import { useEffect, useMemo, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { brl } from "@/lib/format";
import {
  Plus, Trash2, Search, UserPlus, Save, X, FileDown, MessageCircle, Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { loadWarrantySettings, type WarrantySettings } from "@/lib/warranty";
import AutocompleteInput from "@/components/AutocompleteInput";
import { onlyDigits, validateDoc } from "@/lib/docValidation";
import { Pencil, ExternalLink, CheckCircle2, AlertTriangle } from "lucide-react";
import { UserCheck } from "lucide-react";

type CustomerLite = {
  id: string;
  name: string;
  document: string | null;
  doc_type: string | null;
  phone: string | null;
  whatsapp: string | null;
  address_city: string | null;
  email: string | null;
};

const EMPTY_QUICK: any = {
  name: "", doc_type: "cpf", document: "", email: "",
  phone: "", whatsapp: "", address_city: "", address_uf: "", notes: "",
};

type LineItem = {
  product_id: string; // real id OR synthetic "svc-<uuid>"
  is_service?: boolean;
  description?: string;
  name: string;
  code?: string;
  category?: string;
  color?: string;
  storage?: string;
  quantity: number;
  list_price: number;
  discount_pct: number;
  discount_brl: number;
  unit_price: number;
};

type SplitPayment = { method: string; amount: number; notes: string; installments?: number };

const PAY_METHODS: { value: string; label: string }[] = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix",      label: "PIX" },
  { value: "debito",   label: "Cartão de débito" },
  { value: "credito",  label: "Cartão de crédito" },
  { value: "crediario",label: "Crediário" },
  { value: "boleto",   label: "Boleto" },
  { value: "transferencia", label: "Transferência" },
];

const DEDUCTION_REASONS = [
  "Taxa cartão de crédito", "Taxa cartão de débito", "Taxa PIX/maquineta",
  "Antecipação", "Tarifa boleto", "Cashback / desconto", "Outro",
];

function maskCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
function maskCNPJ(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

const CATEGORIES_DEFAULT = [
  "Venda direta", "Reserva", "Troca", "Garantia", "Assistência",
  "Acessórios", "Xiaomi", "iPhone novo", "iPhone seminovo", "Outros",
];

export default function VendaNova() {
  const navigate = useNavigate();
  const { store, user, role } = useAuth();

  // Cliente
  const [customer, setCustomer] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [quickCustomer, setQuickCustomer] = useState<any | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickEditContact, setQuickEditContact] = useState<any | null>(null);
  const [quickEditSaving, setQuickEditSaving] = useState(false);
  const [postSave, setPostSave] = useState<{ saleId: string; saleNumber: number | null; customerId: string | null; customerName: string } | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [phone, setPhone] = useState("");
  const [docType, setDocType] = useState<"cpf" | "cnpj">("cpf");
  const [doc, setDoc] = useState("");
  const [city, setCity] = useState("");
  const [sellerId, setSellerId] = useState<string>("");
  const [seller, setSeller] = useState<string>("");
  const [sellers, setSellers] = useState<{ user_id: string; full_name: string; role: string }[]>([]);
  const [unit, setUnit] = useState("");
  const [priceList, setPriceList] = useState("padrao");

  // Itens
  const [products, setProducts] = useState<any[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);

  // Serviços
  const [serviceDialog, setServiceDialog] = useState<{ open: boolean; description: string; quantity: number; unit_price: number; editing?: string | null }>({
    open: false, description: "", quantity: 1, unit_price: 0, editing: null,
  });
  const openNewService = () =>
    setServiceDialog({ open: true, description: "", quantity: 1, unit_price: 0, editing: null });
  const openEditService = (i: LineItem) =>
    setServiceDialog({ open: true, description: i.description || i.name, quantity: i.quantity, unit_price: i.unit_price, editing: i.product_id });
  const saveService = () => {
    const desc = serviceDialog.description.trim();
    const qty = Math.max(1, Number(serviceDialog.quantity) || 1);
    const price = Number(serviceDialog.unit_price) || 0;
    if (!desc) return toast.error("Descreva o serviço");
    if (price <= 0) return toast.error("Informe um valor maior que zero");
    setItems((arr) => {
      if (serviceDialog.editing) {
        return arr.map((i) => i.product_id === serviceDialog.editing ? {
          ...i, name: desc, description: desc, quantity: qty,
          list_price: price, unit_price: price, discount_pct: 0, discount_brl: 0,
        } : i);
      }
      const id = `svc-${(crypto as any).randomUUID?.() ?? Date.now()}`;
      return [...arr, {
        product_id: id, is_service: true, description: desc,
        name: desc, code: "SERVIÇO", category: "Serviço",
        quantity: qty, list_price: price, discount_pct: 0, discount_brl: 0, unit_price: price,
      }];
    });
    setServiceDialog({ open: false, description: "", quantity: 1, unit_price: 0, editing: null });
  };

  // Comissões
  const [commissionPct, setCommissionPct] = useState(0);
  const [commissionStatus, setCommissionStatus] = useState("pendente");

  // Pagamento
  const [payments, setPayments] = useState<SplitPayment[]>([
    { method: "dinheiro", amount: 0, notes: "", installments: 1 },
  ]);
  const [otherExpenses, setOtherExpenses] = useState(0);
  const [freight, setFreight] = useState(0);
  const [netValue, setNetValue] = useState<number>(0);
  const [deductionReason, setDeductionReason] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Entrega
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [shipDate, setShipDate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [carrier, setCarrier] = useState("");
  const [freightPayer, setFreightPayer] = useState("cif");
  const [diffAddress, setDiffAddress] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // Adicionais
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("Venda direta");
  const [customCategory, setCustomCategory] = useState("");
  const [allCategories, setAllCategories] = useState(CATEGORIES_DEFAULT);

  const [busy, setBusy] = useState(false);

  // Garantia
  const [warrantyCfg, setWarrantyCfg] = useState<WarrantySettings | null>(null);
  const [warrantyEnabled, setWarrantyEnabled] = useState(true);
  const [warrantyDays, setWarrantyDays] = useState<number>(90);

  useEffect(() => {
    if (!store) return;
    loadWarrantySettings(store.id).then((cfg) => {
      setWarrantyCfg(cfg);
      setWarrantyEnabled(cfg.default_enabled);
      setWarrantyDays(cfg.default_days);
    });
  }, [store]);

  // Registra visita à página de vendas (admin master monitora)
  useEffect(() => {
    let sid = sessionStorage.getItem("phn_sid");
    if (!sid) {
      sid = (crypto as any).randomUUID?.() ?? String(Math.random()).slice(2);
      sessionStorage.setItem("phn_sid", sid!);
    }
    (supabase as any).from("page_visits").insert({
      path: "/painel/vendas/nova",
      store_id: store?.id ?? null,
      user_id: user?.id ?? null,
      session_id: sid,
      user_agent: navigator.userAgent,
      referrer: document.referrer || null,
    }).then(() => {/* noop */});
    try {
      const fbq = (window as any).fbq;
      if (typeof fbq === "function") fbq("track", "ViewContent", { content_name: "Nova venda" });
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id]);

  useEffect(() => {
    if (!store) return;
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, sale_price, cost_price, stock_current, category, color, storage, gtin")
        .eq("store_id", store.id)
        .order("name");
      setProducts(data ?? []);
    })();
  }, [store]);

  // Carrega clientes cadastrados da loja (autocomplete + sincronização)
  const loadCustomers = async () => {
    if (!store) return;
    setLoadingCustomers(true);
    const { data } = await (supabase.from("customers") as any)
      .select("id, name, document, doc_type, phone, whatsapp, address_city, email")
      .eq("store_id", store.id)
      .order("name");
    setCustomers((data as CustomerLite[]) ?? []);
    setLoadingCustomers(false);
  };
  useEffect(() => { loadCustomers(); /* eslint-disable-next-line */ }, [store?.id]);

  const applyCustomer = (c: CustomerLite) => {
    setCustomerId(c.id);
    setCustomer(c.name);
    setCustomerSearch(c.name);
    setShowCustomerList(false);
    if (c.whatsapp) setWhatsapp(c.whatsapp);
    if (c.phone) setPhone(c.phone);
    if (c.document) setDoc(c.document);
    if (c.doc_type === "cpf" || c.doc_type === "cnpj") setDocType(c.doc_type);
    if (c.address_city) setCity(c.address_city);
  };

  // Busca cliente por CPF/CNPJ (chave primária) — evita duplicidade quando o nome varia.
  const findByDoc = (docRaw: string): CustomerLite | undefined => {
    const d = onlyDigits(docRaw);
    if (d.length < 11) return undefined;
    return customers.find((c) => onlyDigits(c.document || "") === d);
  };

  const onCustomerNameChange = (v: string) => {
    setCustomer(v);
    // Só troca vínculo se o nome não corresponder ao cliente vinculado por CPF.
    if (customerId) {
      const linked = customers.find((c) => c.id === customerId);
      if (linked && linked.name.toLowerCase() === v.trim().toLowerCase()) return;
    }
    const match = customers.find((c) => c.name.toLowerCase() === v.trim().toLowerCase());
    if (match) applyCustomer(match);
    else if (!onlyDigits(doc)) setCustomerId(null);
  };

  const onDocChange = (raw: string) => {
    const masked = docType === "cpf" ? maskCPF(raw) : maskCNPJ(raw);
    setDoc(masked);
    const match = findByDoc(masked);
    if (match) applyCustomer(match);
  };

  // Busca clientes por nome, documento, telefone, whatsapp ou e-mail (debounce leve).
  const customerMatches = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    const qDigits = onlyDigits(q);
    return customers.filter((c) => {
      const bag = [c.name, c.email].filter(Boolean).map((s) => String(s).toLowerCase()).join(" ");
      const digBag = [c.document, c.phone, c.whatsapp].filter(Boolean).map((s) => onlyDigits(String(s))).join(" ");
      return bag.includes(q) || (qDigits.length >= 3 && digBag.includes(qDigits));
    }).slice(0, 12);
  }, [customers, customerSearch]);

  // Dedupe estendido: verifica CPF, telefone, whatsapp e e-mail antes de inserir.
  const findDuplicate = (payload: { document?: string | null; phone?: string | null; whatsapp?: string | null; email?: string | null }): CustomerLite | undefined => {
    const docD = onlyDigits(payload.document || "");
    const phD = onlyDigits(payload.phone || "");
    const waD = onlyDigits(payload.whatsapp || "");
    const emL = (payload.email || "").trim().toLowerCase();
    return customers.find((c) => {
      if (docD.length >= 11 && onlyDigits(c.document || "") === docD) return true;
      if (phD.length >= 10 && onlyDigits(c.phone || "") === phD) return true;
      if (waD.length >= 10 && onlyDigits(c.whatsapp || "") === waD) return true;
      if (emL && emL.length > 3 && (c.email || "").toLowerCase() === emL) return true;
      return false;
    });
  };

  const openQuickCustomer = () => {
    setQuickCustomer({
      ...EMPTY_QUICK,
      name: (customer || customerSearch).trim(),
      whatsapp, phone,
      document: doc,
      doc_type: docType,
      address_city: city,
    });
  };

  const saveQuickCustomer = async () => {
    if (!store || !quickCustomer) return;
    if (!quickCustomer.name || quickCustomer.name.trim().length < 2) {
      toast.error("Informe o nome do cliente");
      return;
    }
    // Validação de documento (obrigatório quando fornecido)
    if (quickCustomer.document && quickCustomer.document.trim()) {
      const v = validateDoc(quickCustomer.document, (quickCustomer.doc_type || "cpf") as any);
      if (!v.ok) { toast.error(v.message!); return; }
    }
    // Prevenir duplicidade por CPF, telefone, whatsapp ou e-mail
    const dup = findDuplicate(quickCustomer);
    if (dup) {
      toast.warning(`Cliente já cadastrado: ${dup.name}. Vinculado à venda.`);
      applyCustomer(dup);
      setQuickCustomer(null);
      return;
    }
    setQuickSaving(true);
    const payload: any = {
      store_id: store.id,
      name: quickCustomer.name.trim(),
      doc_type: quickCustomer.doc_type || null,
      document: quickCustomer.document?.trim() || null,
      email: quickCustomer.email?.trim() || null,
      phone: quickCustomer.phone?.trim() || null,
      whatsapp: quickCustomer.whatsapp?.trim() || null,
      address_city: quickCustomer.address_city?.trim() || null,
      address_uf: quickCustomer.address_uf?.trim() || null,
      notes: quickCustomer.notes?.trim() || null,
    };
    const { data, error } = await (supabase.from("customers") as any).insert(payload).select("*").single();
    setQuickSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Cliente cadastrado");
    setQuickCustomer(null);
    await loadCustomers();
    if (data) applyCustomer(data as CustomerLite);
  };

  // Garante que o cliente exista na base — CPF é chave primária, evita duplicidade.
  const ensureCustomerRecord = async () => {
    if (!store) return null;
    const name = customer.trim();
    if (!name && !onlyDigits(doc)) return null;
    if (customerId) return customerId;
    // 1) Dedupe por CPF, telefone, whatsapp ou e-mail
    const dup = findDuplicate({ document: doc, phone, whatsapp, email: null });
    if (dup) { setCustomerId(dup.id); return dup.id; }
    // 2) Fallback: nome exato
    const byName = name
      ? customers.find((c) => c.name.toLowerCase() === name.toLowerCase())
      : undefined;
    if (byName) { setCustomerId(byName.id); return byName.id; }
    const payload: any = {
      store_id: store.id,
      name: name || "Cliente sem nome",
      doc_type: docType || null,
      document: doc?.trim() || null,
      phone: phone?.trim() || null,
      whatsapp: whatsapp?.trim() || null,
      address_city: city?.trim() || null,
    };
    const { data } = await (supabase.from("customers") as any).insert(payload).select("id").single();
    if (data?.id) {
      setCustomerId(data.id);
      loadCustomers();
      return data.id as string;
    }
    return null;
  };

  // Edita rapidamente telefone/endereço do cliente já vinculado.
  const openQuickEditContact = async () => {
    if (!customerId) { toast.error("Vincule um cliente antes de editar"); return; }
    const { data } = await (supabase.from("customers") as any)
      .select("id, phone, whatsapp, address_zip, address_street, address_number, address_neighborhood, address_city, address_uf, address_complement")
      .eq("id", customerId).single();
    setQuickEditContact(data ?? { id: customerId });
  };
  const saveQuickEditContact = async () => {
    if (!quickEditContact?.id) return;
    setQuickEditSaving(true);
    const payload: any = {
      phone: quickEditContact.phone?.trim() || null,
      whatsapp: quickEditContact.whatsapp?.trim() || null,
      address_zip: quickEditContact.address_zip?.trim() || null,
      address_street: quickEditContact.address_street?.trim() || null,
      address_number: quickEditContact.address_number?.trim() || null,
      address_neighborhood: quickEditContact.address_neighborhood?.trim() || null,
      address_city: quickEditContact.address_city?.trim() || null,
      address_uf: quickEditContact.address_uf?.trim() || null,
      address_complement: quickEditContact.address_complement?.trim() || null,
    };
    const { error } = await (supabase.from("customers") as any).update(payload).eq("id", quickEditContact.id);
    setQuickEditSaving(false);
    if (error) { toast.error(error.message); return; }
    // Reflete os novos dados no formulário da venda
    if (payload.phone) setPhone(payload.phone);
    if (payload.whatsapp) setWhatsapp(payload.whatsapp);
    if (payload.address_city) setCity(payload.address_city);
    await loadCustomers();
    setQuickEditContact(null);
    toast.success("Contato do cliente atualizado e sincronizado com o CRM");
  };

  // Carrega vendedores/gestores da loja (via função SECURITY DEFINER)
  useEffect(() => {
    if (!store || !user) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .rpc("get_store_sellers", { _store_id: store.id });
      if (error) return;
      const list = (data ?? []) as { user_id: string; full_name: string; role: string }[];
      setSellers(list);

      // Se vendedor, pré-seleciona a si mesmo e bloqueia a seleção.
      if (role === "vendedor") {
        const me = list.find((s) => s.user_id === user.id);
        if (me) {
          setSellerId(me.user_id);
          setSeller(me.full_name);
        }
      }
    })();
  }, [store, user, role]);

  const canChangeSeller = role === "dono" || role === "gerente";
  const selectableSellers = canChangeSeller
    ? sellers
    : sellers.filter((s) => s.user_id === user?.id);

  const onSellerChange = (uid: string) => {
    const s = sellers.find((x) => x.user_id === uid);
    setSellerId(uid);
    setSeller(s?.full_name ?? "");
  };

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products.filter((p: any) =>
      [p.name, p.sku, p.category, p.gtin].filter(Boolean).some((v: string) => String(v).toLowerCase().includes(q))
    ).slice(0, 12);
  }, [products, productQuery]);

  const addItem = (p: any) => {
    if (Number(p.stock_current) <= 0) {
      toast.warning(`"${p.name}" está sem estoque. Regularize em Compras/Estoque antes de vender.`);
      return;
    }
    setItems((arr) => {
      const existing = arr.find((i) => i.product_id === p.id);
      if (existing) return arr.map((i) => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...arr, {
        product_id: p.id,
        name: p.name,
        code: p.sku,
        category: p.category,
        color: p.color,
        storage: p.storage,
        quantity: 1,
        list_price: Number(p.sale_price),
        discount_pct: 0,
        discount_brl: 0,
        unit_price: Number(p.sale_price),
      }];
    });
    setProductQuery("");
  };

  const updateItem = (id: string, patch: Partial<LineItem>) => {
    setItems((arr) => arr.map((i) => {
      if (i.product_id !== id) return i;
      const merged = { ...i, ...patch };
      // Recompute discount/unit cascading
      if (patch.discount_pct !== undefined) {
        merged.discount_brl = +(merged.list_price * (merged.discount_pct / 100)).toFixed(2);
        merged.unit_price = +(merged.list_price - merged.discount_brl).toFixed(2);
      } else if (patch.discount_brl !== undefined) {
        merged.discount_pct = merged.list_price > 0 ? +((merged.discount_brl / merged.list_price) * 100).toFixed(2) : 0;
        merged.unit_price = +(merged.list_price - merged.discount_brl).toFixed(2);
      } else if (patch.list_price !== undefined || patch.unit_price !== undefined) {
        merged.discount_brl = +(merged.list_price - merged.unit_price).toFixed(2);
        merged.discount_pct = merged.list_price > 0 ? +((merged.discount_brl / merged.list_price) * 100).toFixed(2) : 0;
      }
      return merged;
    }));
  };

  const removeItem = (id: string) => setItems((arr) => arr.filter((i) => i.product_id !== id));

  // Totais
  const totalsItems = items.length;
  const totalsQty = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.quantity * i.list_price, 0);
  const totalDiscount = items.reduce((s, i) => s + i.quantity * i.discount_brl, 0);
  const totalItemsValue = subtotal - totalDiscount;
  const commissionValue = +(totalItemsValue * (commissionPct / 100)).toFixed(2);
  const totalSale = +(totalItemsValue + otherExpenses + freight).toFixed(2);
  const paid = +payments.reduce((s, p) => s + Number(p.amount || 0), 0).toFixed(2);
  const remaining = +(totalSale - paid).toFixed(2);
  const isMulti = payments.length > 1;
  const primaryMethod = payments[0]?.method ?? "dinheiro";

  const addPayment = () =>
    setPayments((arr) => [...arr, { method: "pix", amount: Math.max(0, remaining), notes: "", installments: 1 }]);
  const updatePayment = (idx: number, patch: Partial<SplitPayment>) =>
    setPayments((arr) => arr.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const removePayment = (idx: number) =>
    setPayments((arr) => (arr.length <= 1 ? arr : arr.filter((_, i) => i !== idx)));
  const fillRemaining = (idx: number) =>
    setPayments((arr) =>
      arr.map((p, i) => (i === idx ? { ...p, amount: +(Number(p.amount || 0) + remaining).toFixed(2) } : p)),
    );

  const addCategory = () => {
    const v = customCategory.trim();
    if (!v) return;
    setAllCategories((arr) => arr.includes(v) ? arr : [...arr, v]);
    setCategory(v);
    setCustomCategory("");
    toast.success("Categoria adicionada");
  };

  const buildPayload = () => ({
    extras: {
      whatsapp, phone, city, seller, seller_id: sellerId || null, unit, price_list: priceList,
      customer_doc_type: docType,
      commission: { percent: commissionPct, value: commissionValue, status: commissionStatus },
      payment: {
        method: isMulti ? "misto" : primaryMethod,
        is_split: isMulti,
        splits: payments,
        installments: payments[0]?.installments ?? 1,
        other_expenses: otherExpenses, freight,
        net_value: netValue, deduction_reason: deductionReason,
      },
      delivery: { sale_date: saleDate, ship_date: shipDate, expected_date: expectedDate, carrier, payer: freightPayer, diff_address: diffAddress, address: deliveryAddress },
      category,
      totals: { items: totalsItems, qty: totalsQty, subtotal, discount: totalDiscount, items_value: totalItemsValue, sale_total: totalSale },
      user_notes: notes,
      warranty: {
        enabled: warrantyEnabled,
        days: warrantyDays,
        notice: warrantyCfg?.notice_text ?? "",
        terms: warrantyCfg?.message_template ?? "",
      },
    },
  });

  const onSubmitClick = (e?: FormEvent) => {
    e?.preventDefault();
    if (!store || !user) return;
    if (items.length === 0) return toast.error("Adicione ao menos um item");
    if (totalSale <= 0) return toast.error("Total da venda deve ser maior que zero");
    if (Math.abs(remaining) > 0.009) {
      return toast.error(
        remaining > 0
          ? `Faltam ${brl(remaining)} para fechar o pagamento`
          : `Pagamentos excedem o total em ${brl(Math.abs(remaining))}`,
      );
    }
    if (payments.some((p) => !p.method || Number(p.amount) <= 0)) {
      return toast.error("Cada forma de pagamento precisa de método e valor > 0");
    }
    // Validação do documento antes de abrir confirmação
    if (doc && onlyDigits(doc)) {
      const v = validateDoc(doc, docType);
      if (!v.ok) return toast.error(v.message!);
    }
    setConfirmOpen(true);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!store || !user) return;
    setBusy(true);

    const payload = buildPayload();
    // Sincroniza cliente com o CRM antes de gravar a venda
    const linkedCustomerId = await ensureCustomerRecord();
    const dbMethod = isMulti
      ? "misto"
      : (["dinheiro", "pix", "debito", "credito", "crediario"].includes(primaryMethod) ? primaryMethod : "dinheiro");
    const headInstallments = payments[0]?.installments ?? 1;

    const { data: sale, error } = await supabase.from("sales").insert({
      store_id: store.id, seller_id: user.id,
      customer_name: customer || null, customer_doc: doc || null,
      customer_whatsapp: whatsapp || null,
      payment_method: dbMethod as any,
      installments: headInstallments,
      discount: totalDiscount, subtotal: totalItemsValue, total: totalSale,
      notes: JSON.stringify(payload),
    }).select("id, sale_number").single();

    if (error || !sale) { setBusy(false); return toast.error(error?.message ?? "Erro"); }

    // Múltiplas formas de pagamento (sincroniza com financeiro)
    const splitsRows = payments
      .filter((p) => Number(p.amount) > 0)
      .map((p) => ({
        sale_id: sale.id,
        store_id: store.id,
        method: p.method,
        amount: Number(p.amount),
        installments: p.installments ?? null,
        notes: p.notes || null,
      }));
    if (splitsRows.length > 0) {
      const { error: ePay } = await (supabase as any).from("sale_payments").insert(splitsRows);
      if (ePay) console.warn("sale_payments insert error", ePay);
    }

    const { error: e2 } = await supabase.from("sale_items").insert(
      items.map((i) => ({
        sale_id: sale.id, product_id: i.product_id,
        quantity: i.quantity, unit_price: i.unit_price, total: i.quantity * i.unit_price,
      }))
    );
    if (e2) { setBusy(false); return toast.error(e2.message); }

    for (const i of items) {
      const cur = products.find((p) => p.id === i.product_id);
      if (cur) {
        await supabase.from("products").update({
          stock_current: Math.max(0, cur.stock_current - i.quantity),
          last_sold_at: new Date().toISOString(),
        }).eq("id", i.product_id);
      }
    }

    setBusy(false);
    setConfirmOpen(false);
    // Dispara evento Purchase para o Meta Pixel com detalhamento por forma de pagamento
    try {
      const fbq = (window as any).fbq;
      if (typeof fbq === "function") {
        const validSplits = payments.filter((p) => Number(p.amount) > 0);
        const contents = validSplits.map((p) => ({
          id: `pay_${p.method}`,
          quantity: 1,
          item_price: Number(p.amount),
        }));
        // Adiciona um content por item vendido (para reporting)
        const itemContents = items.map((i) => ({
          id: i.product_id,
          quantity: i.quantity,
          item_price: i.unit_price,
        }));
        fbq("track", "Purchase", {
          value: Number(totalSale.toFixed(2)),
          currency: "BRL",
          num_items: totalsQty,
          contents: itemContents.length ? itemContents : contents,
          content_type: "product",
          content_ids: items.map((i) => i.product_id),
          payment_method: isMulti ? "misto" : primaryMethod,
          payment_split: validSplits.map((p) => ({
            method: p.method,
            amount: Number(p.amount),
            installments: p.installments ?? 1,
          })),
        });
      }
    } catch { /* noop */ }
    toast.success("Venda registrada!");
    setPostSave({
      saleId: sale.id,
      saleNumber: (sale as any).sale_number ?? null,
      customerId: linkedCustomerId,
      customerName: customer.trim() || "—",
    });
  };

  const buildSummary = () => {
    const prodLine = items.map((i) => `• ${i.quantity}× ${i.name} — ${brl(i.unit_price * i.quantity)}`).join("\n");
    const storeName = (store as any)?.trade_name || store?.name || "Phonee";
    return `Olá, segue o resumo da sua compra na ${storeName}:

Cliente: ${customer || "—"}
Produto(s):
${prodLine || "—"}
Valor total: ${brl(totalSale)}
Forma de pagamento: ${isMulti ? "MISTO" : primaryMethod.toUpperCase()}
Entrega: ${expectedDate ? `prevista para ${new Date(expectedDate).toLocaleDateString("pt-BR")}` : "a combinar"}

Obrigado pela preferência.`;
  };

  const sendWhatsapp = () => {
    const phone = whatsapp.replace(/\D/g, "");
    if (!phone) return toast.error("Informe o WhatsApp do cliente");
    const url = `https://wa.me/55${phone}?text=${encodeURIComponent(buildSummary())}`;
    window.open(url, "_blank");
  };

  const exportPDF = () => window.print();

  return (
    <div className="pb-28 md:pb-6">
      <PageHeader
        title="Nova venda"
        description="Cadastro completo de venda, com cliente, itens, pagamento e entrega."
        actions={
          <div className="hidden md:flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/painel/vendas")}><X className="h-4 w-4 mr-1" />Cancelar</Button>
            <Button variant="outline" onClick={exportPDF}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
            <Button variant="outline" onClick={sendWhatsapp}><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</Button>
            <Button onClick={onSubmitClick} disabled={busy} className="bg-primary text-primary-foreground shadow-glow">
              <Save className="h-4 w-4 mr-1" />{busy ? "Salvando…" : "Salvar venda"}
            </Button>
          </div>
        }
      />

      <form onSubmit={onSubmitClick} className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          {/* CLIENTE */}
          <Card className="p-5">
            <h3 className="font-semibold mb-4 flex items-center justify-between">
              Dados do Cliente
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => {
                  const el = document.getElementById("venda-cliente-input") as HTMLInputElement | null;
                  el?.focus();
                }}><Search className="h-3.5 w-3.5 mr-1" />Buscar</Button>
                <Button type="button" size="sm" variant="outline" onClick={openQuickCustomer}><UserPlus className="h-3.5 w-3.5 mr-1" />Novo</Button>
              </div>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Cliente">
                <div className="relative">
                  <Input
                    id="venda-cliente-input"
                    value={customerSearch}
                    onFocus={() => setShowCustomerList(true)}
                    onBlur={() => setTimeout(() => setShowCustomerList(false), 180)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomerSearch(v);
                      setCustomer(v);
                      setShowCustomerList(true);
                      // Se já havia vínculo mas o texto mudou, desfaz o vínculo até nova seleção.
                      if (customerId) {
                        const linked = customers.find((c) => c.id === customerId);
                        if (!linked || linked.name.toLowerCase() !== v.trim().toLowerCase()) setCustomerId(null);
                      }
                    }}
                    placeholder="Nome, CPF/CNPJ, telefone, WhatsApp ou e-mail…"
                    autoComplete="off"
                  />
                  {showCustomerList && (
                    <div className="absolute z-20 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-card max-h-72 overflow-auto">
                      {loadingCustomers ? (
                        <div className="px-3 py-3 text-xs text-muted-foreground">Carregando clientes…</div>
                      ) : customerMatches.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-muted-foreground">
                          Nenhum cliente encontrado.
                          <button type="button" onMouseDown={(e) => { e.preventDefault(); openQuickCustomer(); }}
                            className="ml-1 text-primary hover:underline">
                            Cadastrar agora?
                          </button>
                        </div>
                      ) : (
                        customerMatches.map((c) => (
                          <button
                            key={c.id} type="button"
                            onMouseDown={(e) => { e.preventDefault(); applyCustomer(c); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="font-medium truncate flex items-center gap-1">
                                <UserCheck className="h-3 w-3 text-success shrink-0" />{c.name}
                              </div>
                              <div className="text-[11px] text-muted-foreground font-mono truncate">
                                {[c.document, c.whatsapp || c.phone, c.email].filter(Boolean).join(" · ") || "sem contato"}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {customerSearch.trim() && !customerId && !showCustomerList && (
                  <button type="button" onClick={openQuickCustomer}
                    className="mt-1 text-[11px] text-primary hover:underline">
                    + Cadastrar “{customerSearch.trim()}” como novo cliente
                  </button>
                )}
                {customerId && (
                  <div className="mt-1 flex items-center gap-2 text-[11px]">
                    <span className="text-success flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Vinculado ao CRM</span>
                    <button type="button" onClick={openQuickEditContact}
                      className="text-primary hover:underline flex items-center gap-1">
                      <Pencil className="h-3 w-3" />Editar contato/endereço
                    </button>
                  </div>
                )}
              </Field>
              <Field label="WhatsApp (opcional)"><Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(11) 90000-0000" /></Field>
              <Field label="Telefone (opcional)"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 3000-0000" /></Field>
              <Field label="Tipo de documento">
                <Select value={docType} onValueChange={(v: any) => { setDocType(v); setDoc(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF (pessoa física)</SelectItem>
                    <SelectItem value="cnpj">CNPJ (pessoa jurídica)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={docType === "cpf" ? "CPF (11 dígitos)" : "CNPJ (14 dígitos)"}>
                <Input
                  value={doc}
                  onChange={(e) => onDocChange(e.target.value)}
                  placeholder={docType === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                  inputMode="numeric"
                />
                {doc && onlyDigits(doc).length >= (docType === "cpf" ? 11 : 14) && !validateDoc(doc, docType).ok && (
                  <div className="mt-1 text-[11px] text-danger flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />{validateDoc(doc, docType).message}
                  </div>
                )}
              </Field>
              <Field label="Cidade"><Input value={city} onChange={(e) => setCity(e.target.value)} /></Field>
              <Field label="Vendedor">
                <Select value={sellerId} onValueChange={onSellerChange} disabled={!canChangeSeller && selectableSellers.length <= 1}>
                  <SelectTrigger><SelectValue placeholder={selectableSellers.length ? "Selecione um vendedor" : "Sem vendedores cadastrados"} /></SelectTrigger>
                  <SelectContent>
                    {selectableSellers.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        {s.full_name} {s.role !== "vendedor" && <span className="text-muted-foreground text-xs">· {s.role}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Loja"><Input value={store?.name ?? ""} readOnly /></Field>
              <Field label="Unidade de negócio"><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
              <Field label="Lista de preço">
                <Select value={priceList} onValueChange={setPriceList}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="padrao">Padrão</SelectItem>
                    <SelectItem value="atacado">Atacado</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Card>

          {/* ITENS */}
          <Card className="p-5">
            <h3 className="font-semibold mb-4">Itens da Venda</h3>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Buscar por nome, código, categoria, GTIN ou modelo…"
                className="pl-9"
              />
              {productQuery && filteredProducts.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-card max-h-64 overflow-auto">
                  {filteredProducts.map((p: any) => (
                    <button
                      key={p.id} type="button"
                      onClick={() => addItem(p)}
                      disabled={Number(p.stock_current) <= 0}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-3 ${Number(p.stock_current) <= 0 ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {p.sku} · {p.category} · {Number(p.stock_current) > 0
                            ? `est. ${p.stock_current}`
                            : <span className="text-danger">SEM ESTOQUE</span>}
                        </div>
                      </div>
                      <div className="font-mono text-sm">{brl(Number(p.sale_price))}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto rounded-lg border border-border/70">
              <table className="w-full text-sm border-collapse [&_th]:border-r [&_th]:border-border/60 [&_th:last-child]:border-r-0 [&_td]:border-r [&_td]:border-border/40 [&_td:last-child]:border-r-0">
                <thead className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground bg-surface-elevated">
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2.5 font-medium">Produto</th>
                    <th className="text-left px-3 py-2.5 font-medium">Código</th>
                    <th className="text-left px-3 py-2.5 font-medium">Cor</th>
                    <th className="text-left px-3 py-2.5 font-medium">Armaz.</th>
                    <th className="text-right px-3 py-2.5 font-medium w-16">Qtd</th>
                    <th className="text-right px-3 py-2.5 font-medium w-24">P. lista</th>
                    <th className="text-right px-3 py-2.5 font-medium w-16">Desc%</th>
                    <th className="text-right px-3 py-2.5 font-medium w-24">Desc R$</th>
                    <th className="text-right px-3 py-2.5 font-medium w-24">P. unit.</th>
                    <th className="text-right px-3 py-2.5 font-medium w-28">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={11} className="text-center text-xs text-muted-foreground py-8 border-r-0">Nenhum item — busque acima para adicionar</td></tr>
                  ) : items.map((i, idx) => (
                    <tr key={i.product_id} className={`border-t border-border/60 transition-colors hover:bg-primary/[0.03] ${idx % 2 === 1 ? "bg-surface-elevated/40" : ""}`}>
                      <td className="px-3 py-2.5 truncate max-w-[180px] font-medium">{i.name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{i.code}</td>
                      <td className="px-3 py-2.5 text-xs">{i.color || "—"}</td>
                      <td className="px-3 py-2.5 text-xs">{i.storage || "—"}</td>
                      <td className="px-2 py-1.5"><Input type="number" min={1} value={i.quantity} onChange={(e) => updateItem(i.product_id, { quantity: Math.max(1, Number(e.target.value)) })} className="h-8 text-right" /></td>
                      <td className="px-2 py-1.5"><Input type="number" step="0.01" value={i.list_price} onChange={(e) => updateItem(i.product_id, { list_price: Number(e.target.value) })} className="h-8 text-right" /></td>
                      <td className="px-2 py-1.5"><Input type="number" step="0.01" value={i.discount_pct} onChange={(e) => updateItem(i.product_id, { discount_pct: Number(e.target.value) })} className="h-8 text-right" /></td>
                      <td className="px-2 py-1.5"><Input type="number" step="0.01" value={i.discount_brl} onChange={(e) => updateItem(i.product_id, { discount_brl: Number(e.target.value) })} className="h-8 text-right" /></td>
                      <td className="px-2 py-1.5"><Input type="number" step="0.01" value={i.unit_price} onChange={(e) => updateItem(i.product_id, { unit_price: Number(e.target.value) })} className="h-8 text-right" /></td>
                      <td className="px-3 py-2.5 text-right metric font-semibold text-primary">{brl(i.quantity * i.unit_price)}</td>
                      <td className="text-center"><Button type="button" size="icon" variant="ghost" onClick={() => removeItem(i.product_id)}><Trash2 className="h-3.5 w-3.5 text-danger" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile item cards */}
            <div className="md:hidden space-y-3">
              {items.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-4">Nenhum item</p>
              ) : items.map((i) => (
                <div key={i.product_id} className="border border-border rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{i.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{i.code} · {i.color} · {i.storage}</div>
                    </div>
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeItem(i.product_id)}><Trash2 className="h-3.5 w-3.5 text-danger" /></Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Field label="Qtd"><Input type="number" min={1} value={i.quantity} onChange={(e) => updateItem(i.product_id, { quantity: Math.max(1, Number(e.target.value)) })} /></Field>
                    <Field label="P. lista"><Input type="number" step="0.01" value={i.list_price} onChange={(e) => updateItem(i.product_id, { list_price: Number(e.target.value) })} /></Field>
                    <Field label="Desc %"><Input type="number" step="0.01" value={i.discount_pct} onChange={(e) => updateItem(i.product_id, { discount_pct: Number(e.target.value) })} /></Field>
                    <Field label="Desc R$"><Input type="number" step="0.01" value={i.discount_brl} onChange={(e) => updateItem(i.product_id, { discount_brl: Number(e.target.value) })} /></Field>
                    <Field label="P. unit."><Input type="number" step="0.01" value={i.unit_price} onChange={(e) => updateItem(i.product_id, { unit_price: Number(e.target.value) })} /></Field>
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Total</Label>
                      <div className="metric font-semibold h-10 flex items-center px-2 rounded-md bg-primary/10 text-primary">{brl(i.quantity * i.unit_price)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" className="mt-3" onClick={() => document.querySelector<HTMLInputElement>('input[placeholder*="Buscar por nome"]')?.focus()}>
              <Plus className="h-4 w-4 mr-1" />Adicionar outro item
            </Button>
          </Card>

          {/* TABS: Comissões / Pagamento / Entrega / Adicionais */}
          <Card className="p-5">
            <Tabs defaultValue="pagamento">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="pagamento">Pagamento</TabsTrigger>
                <TabsTrigger value="entrega">Entrega</TabsTrigger>
                <TabsTrigger value="comissoes">Comissões</TabsTrigger>
                <TabsTrigger value="adicionais">Adicionais</TabsTrigger>
              </TabsList>

              <TabsContent value="pagamento" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="Outras despesas">
                    <Input type="number" step="0.01" value={otherExpenses} onChange={(e) => setOtherExpenses(Number(e.target.value))} />
                  </Field>
                  <Field label="Frete">
                    <Input type="number" step="0.01" value={freight} onChange={(e) => setFreight(Number(e.target.value))} />
                  </Field>
                  <Field label="Total da venda">
                    <div className="h-10 px-3 flex items-center rounded-md bg-muted font-mono text-sm font-semibold">
                      {brl(totalSale)}
                    </div>
                  </Field>
                </div>

                <div className="border border-border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Formas de pagamento</div>
                      <div className="text-[11px] text-muted-foreground">
                        Divida a venda em quantas formas precisar. A soma deve fechar o total.
                      </div>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={addPayment}>
                      <Plus className="h-3.5 w-3.5 mr-1" />Adicionar forma de pagamento
                    </Button>
                  </div>

                  {payments.map((p, idx) => {
                    const isCard = p.method === "credito" || p.method === "debito" || p.method === "crediario";
                    return (
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-[1fr_140px_90px_1fr_auto] gap-2 items-end border-t border-border/40 pt-2 first:border-t-0 first:pt-0">
                        <Field label={`Forma ${idx + 1}`}>
                          <Select value={p.method} onValueChange={(v) => updatePayment(idx, { method: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PAY_METHODS.map((m) => (
                                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Valor (R$)">
                          <Input
                            type="number" step="0.01" min={0}
                            value={p.amount}
                            onChange={(e) => updatePayment(idx, { amount: Number(e.target.value) })}
                          />
                        </Field>
                        <Field label="Parcelas">
                          <Input
                            type="number" min={1} max={24}
                            value={p.installments ?? 1}
                            disabled={!isCard}
                            onChange={(e) => updatePayment(idx, { installments: Math.max(1, Number(e.target.value)) })}
                          />
                        </Field>
                        <Field label="Observação">
                          <Input
                            value={p.notes}
                            placeholder="Ex.: NSU, autorização, banco…"
                            onChange={(e) => updatePayment(idx, { notes: e.target.value })}
                          />
                        </Field>
                        <div className="flex items-center gap-1">
                          {remaining > 0 && (
                            <Button type="button" size="sm" variant="ghost" onClick={() => fillRemaining(idx)} title="Preencher restante">
                              ={brl(remaining)}
                            </Button>
                          )}
                          <Button
                            type="button" size="icon" variant="ghost"
                            disabled={payments.length <= 1}
                            onClick={() => removePayment(idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-danger" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                  <div className="grid grid-cols-3 gap-2 pt-2 text-xs font-mono">
                    <div className="rounded-md bg-muted/40 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total</div>
                      <div className="text-sm font-semibold">{brl(totalSale)}</div>
                    </div>
                    <div className="rounded-md bg-muted/40 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pago</div>
                      <div className="text-sm font-semibold">{brl(paid)}</div>
                    </div>
                    <div className={`rounded-md px-3 py-2 ${Math.abs(remaining) < 0.01 ? "bg-success/10 text-success" : remaining > 0 ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
                      <div className="text-[10px] uppercase tracking-widest opacity-80">
                        {remaining > 0 ? "Falta" : remaining < 0 ? "Excedente" : "Fechado"}
                      </div>
                      <div className="text-sm font-semibold">{brl(Math.abs(remaining))}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                  💡 Cada forma de pagamento é registrada separadamente e alimenta o financeiro,
                  fluxo de caixa e o resumo de recebimentos por método.
                </div>
              </TabsContent>

              <TabsContent value="entrega" className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Data da venda"><Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} /></Field>
                <Field label="Data de saída"><Input type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} /></Field>
                <Field label="Data prevista"><Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></Field>
                <Field label="Transportador"><Input value={carrier} onChange={(e) => setCarrier(e.target.value)} /></Field>
                <Field label="Frete por conta">
                  <Select value={freightPayer} onValueChange={setFreightPayer}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cif">CIF (loja)</SelectItem>
                      <SelectItem value="fob">FOB (cliente)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Valor do frete"><Input type="number" step="0.01" value={freight} onChange={(e) => setFreight(Number(e.target.value))} /></Field>
                <div className="sm:col-span-3 flex items-center gap-2 pt-1">
                  <Switch checked={diffAddress} onCheckedChange={setDiffAddress} id="diff" />
                  <Label htmlFor="diff" className="text-sm">Endereço de entrega diferente da cobrança</Label>
                </div>
                {diffAddress && (
                  <div className="sm:col-span-3">
                    <Field label="Endereço de entrega"><Textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} rows={2} /></Field>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="comissoes" className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Field label="Vendedor">
                  <Select value={sellerId} onValueChange={onSellerChange} disabled={!canChangeSeller && selectableSellers.length <= 1}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {selectableSellers.map((s) => (
                        <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="% Comissão"><Input type="number" step="0.01" value={commissionPct} onChange={(e) => setCommissionPct(Number(e.target.value))} /></Field>
                <Field label="Valor da comissão">
                  <div className="h-10 px-3 flex items-center rounded-md bg-muted font-mono text-sm">{brl(commissionValue)}</div>
                </Field>
                <Field label="Status">
                  <Select value={commissionStatus} onValueChange={setCommissionStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="paga">Paga</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </TabsContent>

              <TabsContent value="adicionais" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Categoria da venda">
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {allCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  {category === "Outros" && (
                    <Field label="Nova categoria">
                      <div className="flex gap-2">
                        <Input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="Digite e salve" />
                        <Button type="button" onClick={addCategory}>Salvar</Button>
                      </div>
                    </Field>
                  )}
                </div>
                <Field label="Observações">
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Detalhes da venda, entrega, garantia, negociação…" />
                </Field>

                <div className="border-t border-border/60 pt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Garantia</div>
                      <div className="text-xs text-muted-foreground">Inclui o termo de garantia no comprovante.</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch id="war" checked={warrantyEnabled} onCheckedChange={setWarrantyEnabled} />
                      <Label htmlFor="war" className="text-sm">Adicionar garantia</Label>
                    </div>
                  </div>
                  {warrantyEnabled && warrantyCfg && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Prazo de garantia">
                        <Select value={String(warrantyDays)} onValueChange={(v) => setWarrantyDays(Number(v))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {warrantyCfg.options.map((o, i) => (
                              <SelectItem key={i} value={String(o.days)}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <div className="rounded-md border border-border bg-surface-elevated/40 p-3 text-xs">
                        <div className="font-semibold mb-1">Aviso</div>
                        <div className="text-muted-foreground">{warrantyCfg.notice_text}</div>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* TOTAIS — STICKY DESKTOP */}
        <div className="xl:col-span-1">
          <div className="xl:sticky xl:top-4 space-y-3">
            <Card className="p-5 bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground border-primary/60 shadow-glow">
              <h3 className="text-xs uppercase tracking-widest font-mono font-semibold text-white/85 mb-2">Total da venda</h3>
              <div className="text-4xl font-bold metric leading-tight">{brl(totalSale)}</div>
              <div className="text-sm text-white/85 mt-1 font-mono">{totalsItems} itens · {totalsQty} unid.</div>
            </Card>

            <Card className="p-4">
              <h4 className="text-xs uppercase tracking-widest font-mono text-muted-foreground mb-3">Resumo</h4>
              <ul className="space-y-1.5 text-sm">
                <Row label="Nº de itens" value={String(totalsItems)} />
                <Row label="Soma das qtds" value={String(totalsQty)} />
                <Row label="Total dos itens" value={brl(totalItemsValue)} />
                <Row label="Desconto total" value={brl(totalDiscount)} negative />
                <Row label="Comissão" value={brl(commissionValue)} />
                <Row label="Outras despesas" value={brl(otherExpenses)} />
                <Row label="Frete" value={brl(freight)} />
                <li className="h-px bg-border my-1" />
                <Row label="Pago" value={brl(paid)} />
                <Row label="Restante" value={brl(remaining)} negative={remaining > 0} />
              </ul>
            </Card>
          </div>
        </div>

        {/* PRINT / PDF VIEW — Comprovante + Termo de garantia */}
        <div className="hidden print:block text-black text-sm col-span-full">
          <div className="flex items-start justify-between border-b-2 border-black pb-3 mb-4">
            <div>
              <h1 className="text-2xl font-bold uppercase tracking-tight">
                {(store as any)?.trade_name || store?.name || "MOBILE+"}
              </h1>
              {(store as any)?.tax_id && <p className="text-[11px]">CNPJ/CPF: {(store as any).tax_id}</p>}
              {(store as any)?.address && <p className="text-[11px]">{(store as any).address}</p>}
              <p className="text-[11px]">
                {(store as any)?.phone && `Tel: ${(store as any).phone}`}
                {(store as any)?.phone && (store as any)?.email && " · "}
                {(store as any)?.email && (store as any).email}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xl font-mono font-bold">COMPROVANTE DE VENDA</div>
              <div className="text-xs">{new Date().toLocaleString("pt-BR")}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mb-3">
            <div><strong>Cliente:</strong> {customer || "—"}</div>
            <div><strong>{docType.toUpperCase()}:</strong> {doc || "—"}</div>
            <div><strong>WhatsApp:</strong> {whatsapp || "—"}</div>
            <div><strong>Telefone:</strong> {phone || "—"}</div>
            <div><strong>Cidade:</strong> {city || "—"}</div>
            <div><strong>Vendedor:</strong> {seller || "—"}</div>
            <div className="col-span-2"><strong>Pagamento:</strong> {isMulti ? `MISTO (${payments.filter(p => Number(p.amount) > 0).length} formas)` : `${primaryMethod.toUpperCase()}${(payments[0]?.installments ?? 1) > 1 ? ` em ${payments[0]?.installments}x` : ""}`}</div>
          </div>

          {/* Detalhamento de pagamentos */}
          <table className="w-full border-collapse text-[11px] mb-4 border border-black">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left p-1 border-r border-black">Forma de pagamento</th>
                <th className="text-center p-1 border-r border-black w-16">Parcelas</th>
                <th className="text-right p-1 border-r border-black w-20">Valor</th>
                <th className="text-left p-1">Observação</th>
              </tr>
            </thead>
            <tbody>
              {payments.filter((p) => Number(p.amount) > 0).map((p, idx) => {
                const label = PAY_METHODS.find((m) => m.value === p.method)?.label ?? p.method;
                const inst = (p.installments ?? 1);
                const parcel = inst > 1 ? `${inst}x de ${brl(Number(p.amount) / inst)}` : "À vista";
                return (
                  <tr key={idx} className="border-t border-gray-300">
                    <td className="p-1 border-r border-black">{label}</td>
                    <td className="text-center p-1 border-r border-black">{parcel}</td>
                    <td className="text-right p-1 border-r border-black">{brl(Number(p.amount))}</td>
                    <td className="p-1 text-gray-700">{p.notes || "—"}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-black font-bold bg-gray-50">
                <td className="p-1 border-r border-black" colSpan={2}>TOTAL PAGO</td>
                <td className="text-right p-1 border-r border-black">{brl(paid)}</td>
                <td className="p-1" />
              </tr>
            </tbody>
          </table>

          <table className="w-full border-collapse text-xs mb-4">
            <thead>
              <tr className="bg-black text-white">
                <th className="text-left p-1">Produto</th>
                <th className="text-right p-1">Qtd</th>
                <th className="text-right p-1">Unit.</th>
                <th className="text-right p-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.product_id} className="border-b border-gray-300">
                  <td className="p-1">{i.name} {i.code && <span className="text-gray-500">({i.code})</span>}</td>
                  <td className="text-right p-1">{i.quantity}</td>
                  <td className="text-right p-1">{brl(i.unit_price)}</td>
                  <td className="text-right p-1">{brl(i.quantity * i.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mb-4">
            <div className="w-64 text-xs space-y-1">
              <div className="flex justify-between"><span>Subtotal:</span><span>{brl(totalItemsValue)}</span></div>
              <div className="flex justify-between"><span>Desconto:</span><span>-{brl(totalDiscount)}</span></div>
              <div className="flex justify-between"><span>Frete:</span><span>{brl(freight)}</span></div>
              <div className="flex justify-between font-bold border-t border-black pt-1"><span>TOTAL:</span><span>{brl(totalSale)}</span></div>
            </div>
          </div>

          {warrantyEnabled && warrantyCfg && (
            <>
              {warrantyCfg.notice_text && (
                <div className="border border-black p-2 text-[10px] mb-2 bg-yellow-50">
                  <strong>AVISO:</strong> {warrantyCfg.notice_text}
                </div>
              )}
              <div className="border-t border-black pt-3 text-[10px] leading-snug">
                <p className="font-bold mb-1">TERMO DE GARANTIA — {warrantyDays} dias</p>
                <p>{warrantyCfg.message_template}</p>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-8 mt-10">
            <div className="border-t border-black pt-1 text-center text-[10px]">Assinatura do cliente</div>
            <div className="border-t border-black pt-1 text-center text-[10px]">{(store as any)?.trade_name || store?.name}</div>
          </div>
        </div>

        {/* MOBILE bottom bar */}
        <div className="fixed bottom-0 left-0 right-0 md:hidden bg-card border-t border-border p-3 flex gap-2 z-50">
          <Button type="button" variant="outline" onClick={() => navigate("/painel/vendas")} className="flex-shrink-0">
            <X className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" onClick={sendWhatsapp} className="flex-shrink-0">
            <MessageCircle className="h-4 w-4" />
          </Button>
          <Button type="submit" disabled={busy} className="flex-1 bg-primary text-primary-foreground shadow-glow">
            <Save className="h-4 w-4 mr-1" />{busy ? "Salvando…" : `Salvar · ${brl(totalSale)}`}
          </Button>
        </div>
      </form>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar venda · {brl(totalSale)}</DialogTitle>
            <DialogDescription>
              Revise os pagamentos antes de salvar. A soma deve ser igual ao total.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span>{customer || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Itens</span><span>{totalsItems} · {totalsQty} un.</span></div>
            <div className="border-t border-border/60 pt-2 space-y-1">
              {payments.map((p, i) => (
                <div key={i} className="flex justify-between font-mono text-xs">
                  <span className="capitalize">{PAY_METHODS.find((m) => m.value === p.method)?.label ?? p.method}{p.notes ? ` · ${p.notes}` : ""}</span>
                  <span>{brl(Number(p.amount || 0))}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between font-semibold border-t border-border/60 pt-2">
              <span>Total pago</span><span>{brl(paid)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>Voltar</Button>
            <Button onClick={() => submit()} disabled={busy} className="bg-primary text-primary-foreground">
              <Save className="h-4 w-4 mr-1" />{busy ? "Salvando…" : "Confirmar e salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cadastro rápido de cliente (sem sair da venda) */}
      <Dialog open={!!quickCustomer} onOpenChange={(o) => !o && setQuickCustomer(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Cadastro rápido de cliente</DialogTitle>
            <DialogDescription>Salve os dados essenciais — você pode completar o cadastro depois em Clientes.</DialogDescription>
          </DialogHeader>
          {quickCustomer && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Nome completo *</Label>
                <Input value={quickCustomer.name ?? ""} maxLength={120}
                  onChange={(e) => setQuickCustomer({ ...quickCustomer, name: e.target.value })} />
              </div>
              <div>
                <Label>Tipo de documento</Label>
                <Select value={quickCustomer.doc_type ?? "cpf"} onValueChange={(v) => setQuickCustomer({ ...quickCustomer, doc_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="rg">RG</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Documento</Label>
                <Input value={quickCustomer.document ?? ""} maxLength={32}
                  onChange={(e) => {
                    const t = (quickCustomer.doc_type || "cpf") as "cpf" | "cnpj";
                    const masked = t === "cpf" ? maskCPF(e.target.value)
                      : t === "cnpj" ? maskCNPJ(e.target.value)
                      : e.target.value;
                    setQuickCustomer({ ...quickCustomer, document: masked });
                  }}
                  placeholder={quickCustomer.doc_type === "cnpj" ? "00.000.000/0000-00" : "000.000.000-00"} />
                {quickCustomer.document && onlyDigits(quickCustomer.document).length >= ((quickCustomer.doc_type === "cnpj") ? 14 : 11) &&
                  !validateDoc(quickCustomer.document, (quickCustomer.doc_type === "cnpj" ? "cnpj" : "cpf")).ok && (
                    <div className="mt-1 text-[11px] text-danger flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {validateDoc(quickCustomer.document, (quickCustomer.doc_type === "cnpj" ? "cnpj" : "cpf")).message}
                    </div>
                )}
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={quickCustomer.whatsapp ?? ""} maxLength={20}
                  onChange={(e) => setQuickCustomer({ ...quickCustomer, whatsapp: e.target.value })} placeholder="(11) 90000-0000" />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={quickCustomer.phone ?? ""} maxLength={20}
                  onChange={(e) => setQuickCustomer({ ...quickCustomer, phone: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>E-mail</Label>
                <Input type="email" value={quickCustomer.email ?? ""} maxLength={120}
                  onChange={(e) => setQuickCustomer({ ...quickCustomer, email: e.target.value })} />
              </div>
              <div className="sm:col-span-2 grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label>Cidade</Label>
                  <Input value={quickCustomer.address_city ?? ""} maxLength={80}
                    onChange={(e) => setQuickCustomer({ ...quickCustomer, address_city: e.target.value })} />
                </div>
                <div>
                  <Label>UF</Label>
                  <Input value={quickCustomer.address_uf ?? ""} maxLength={2}
                    onChange={(e) => setQuickCustomer({ ...quickCustomer, address_uf: e.target.value.toUpperCase() })} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label>Observações</Label>
                <Textarea rows={2} value={quickCustomer.notes ?? ""} maxLength={2000}
                  onChange={(e) => setQuickCustomer({ ...quickCustomer, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickCustomer(null)}>Cancelar</Button>
            <Button onClick={saveQuickCustomer} disabled={quickSaving} className="bg-gradient-primary">
              {quickSaving ? "Salvando…" : "Cadastrar e vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar rapidamente contato/endereço do cliente vinculado */}
      <Dialog open={!!quickEditContact} onOpenChange={(o) => !o && setQuickEditContact(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Atualizar contato e endereço</DialogTitle>
            <DialogDescription>Alterações são sincronizadas imediatamente com o CRM.</DialogDescription>
          </DialogHeader>
          {quickEditContact && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>WhatsApp</Label>
                <Input value={quickEditContact.whatsapp ?? ""} maxLength={20}
                  onChange={(e) => setQuickEditContact({ ...quickEditContact, whatsapp: e.target.value })} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={quickEditContact.phone ?? ""} maxLength={20}
                  onChange={(e) => setQuickEditContact({ ...quickEditContact, phone: e.target.value })} />
              </div>
              <div>
                <Label>CEP</Label>
                <Input value={quickEditContact.address_zip ?? ""} maxLength={10}
                  onChange={(e) => setQuickEditContact({ ...quickEditContact, address_zip: e.target.value })} />
              </div>
              <div className="sm:col-span-1">
                <Label>Bairro</Label>
                <Input value={quickEditContact.address_neighborhood ?? ""} maxLength={80}
                  onChange={(e) => setQuickEditContact({ ...quickEditContact, address_neighborhood: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Rua</Label>
                <Input value={quickEditContact.address_street ?? ""} maxLength={120}
                  onChange={(e) => setQuickEditContact({ ...quickEditContact, address_street: e.target.value })} />
              </div>
              <div>
                <Label>Número</Label>
                <Input value={quickEditContact.address_number ?? ""} maxLength={10}
                  onChange={(e) => setQuickEditContact({ ...quickEditContact, address_number: e.target.value })} />
              </div>
              <div>
                <Label>Complemento</Label>
                <Input value={quickEditContact.address_complement ?? ""} maxLength={80}
                  onChange={(e) => setQuickEditContact({ ...quickEditContact, address_complement: e.target.value })} />
              </div>
              <div className="sm:col-span-1">
                <Label>Cidade</Label>
                <Input value={quickEditContact.address_city ?? ""} maxLength={80}
                  onChange={(e) => setQuickEditContact({ ...quickEditContact, address_city: e.target.value })} />
              </div>
              <div>
                <Label>UF</Label>
                <Input value={quickEditContact.address_uf ?? ""} maxLength={2}
                  onChange={(e) => setQuickEditContact({ ...quickEditContact, address_uf: e.target.value.toUpperCase() })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickEditContact(null)}>Cancelar</Button>
            <Button onClick={saveQuickEditContact} disabled={quickEditSaving} className="bg-gradient-primary">
              {quickEditSaving ? "Salvando…" : "Salvar e sincronizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação pós-venda com atalho para o CRM */}
      <Dialog open={!!postSave} onOpenChange={(o) => { if (!o) { setPostSave(null); navigate("/painel/vendas"); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />Venda registrada!
            </DialogTitle>
            <DialogDescription>
              Pedido <strong className="font-mono text-foreground">
                {postSave?.saleNumber != null ? `PED-${String(postSave.saleNumber).padStart(6, "0")}` : "—"}
              </strong> · Cliente <strong>{postSave?.customerName}</strong>
              {postSave?.customerId ? " sincronizado ao CRM" : " sem vínculo no CRM"}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 pt-2">
            <Button variant="outline" onClick={exportPDF} className="justify-start">
              <FileDown className="h-4 w-4 mr-2" />Imprimir / Gerar PDF
            </Button>
            {postSave?.customerId && (
              <Button
                variant="outline"
                onClick={() => { const id = postSave.customerId; setPostSave(null); navigate(`/painel/clientes?edit=${id}`); }}
                className="justify-start">
                <ExternalLink className="h-4 w-4 mr-2" />Abrir cliente no CRM (/clientes)
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => { setPostSave(null); navigate("/painel/vendas"); }}
              className="justify-start">
              Voltar para lista de vendas
            </Button>
            <Button
              onClick={() => { setPostSave(null); window.location.reload(); }}
              className="bg-gradient-primary justify-start">
              <Plus className="h-4 w-4 mr-2" />Nova venda
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Row({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`metric font-semibold ${negative ? "text-danger" : ""}`}>{value}</span>
    </li>
  );
}
