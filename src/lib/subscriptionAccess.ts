// Regras centrais de liberação de acesso por status de assinatura.
// Cobre: active/ativa, trial/trialing, vitalicio/lifetime, overdue,
// canceled, refunded, expired e cancel_at_period_end.

export type SubStatus =
  | "active" | "ativa"
  | "trial" | "trialing"
  | "vitalicio" | "lifetime"
  | "overdue"
  | "canceled" | "cancelada"
  | "refunded"
  | "expired"
  | "pending"
  | "sem_assinatura"
  | string
  | null
  | undefined;

export interface SubInput {
  status: SubStatus;
  expires_at?: string | Date | null;
  cancel_at_period_end?: boolean | null;
  billing_cycle?: string | null;
}

export interface AccessResult {
  hasAccess: boolean;
  state:
    | "active"
    | "trialing"
    | "lifetime"
    | "grace"          // cancel_at_period_end mas ainda válido
    | "overdue"
    | "expired"
    | "canceled"
    | "refunded"
    | "none";
  label: string;
  daysLeft?: number | null;
  expiresAt?: Date | null;
}

const norm = (s: SubStatus) => (s ?? "").toString().trim().toLowerCase();

export function subscriptionAccess(input: SubInput): AccessResult {
  const st = norm(input.status);
  const cycle = norm(input.billing_cycle);
  const expiresAt = input.expires_at ? new Date(input.expires_at) : null;
  const now = Date.now();
  const isExpired = expiresAt ? expiresAt.getTime() <= now : false;
  const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - now) / 86_400_000) : null;

  // Vitalício não expira
  if (st === "vitalicio" || st === "lifetime" || cycle === "lifetime" || cycle === "vitalicio") {
    return { hasAccess: true, state: "lifetime", label: "Vitalício", expiresAt: null, daysLeft: null };
  }

  if (st === "refunded") {
    return { hasAccess: false, state: "refunded", label: "Reembolsada", expiresAt, daysLeft };
  }

  if (st === "canceled" || st === "cancelada") {
    // Cancelada, mas se ainda dentro do período pago → grace
    if (expiresAt && !isExpired) {
      return { hasAccess: true, state: "grace", label: "Cancelada — acesso até vencimento", expiresAt, daysLeft };
    }
    return { hasAccess: false, state: "canceled", label: "Cancelada", expiresAt, daysLeft };
  }

  if (st === "active" || st === "ativa") {
    if (isExpired) {
      return { hasAccess: false, state: "expired", label: "Vencida", expiresAt, daysLeft };
    }
    if (input.cancel_at_period_end) {
      return { hasAccess: true, state: "grace", label: "Ativa — sem renovação", expiresAt, daysLeft };
    }
    return { hasAccess: true, state: "active", label: "Ativa", expiresAt, daysLeft };
  }

  if (st === "trial" || st === "trialing") {
    if (isExpired) {
      return { hasAccess: false, state: "expired", label: "Teste expirado", expiresAt, daysLeft };
    }
    return { hasAccess: true, state: "trialing", label: "Em teste", expiresAt, daysLeft };
  }

  if (st === "overdue") {
    // Damos 3 dias de graça após vencimento em cobranças em atraso.
    if (expiresAt) {
      const graceEnd = expiresAt.getTime() + 3 * 86_400_000;
      if (graceEnd > now) {
        return { hasAccess: true, state: "overdue", label: "Em atraso (graça)", expiresAt, daysLeft };
      }
    }
    return { hasAccess: false, state: "overdue", label: "Em atraso", expiresAt, daysLeft };
  }

  if (st === "expired") {
    return { hasAccess: false, state: "expired", label: "Vencida", expiresAt, daysLeft };
  }

  return { hasAccess: false, state: "none", label: "Sem plano", expiresAt, daysLeft };
}

export function anyGrantsAccess(subs: SubInput[]): AccessResult | null {
  const results = (subs ?? []).map(subscriptionAccess);
  const active = results.find((r) => r.hasAccess);
  if (active) return active;
  return results[0] ?? null;
}