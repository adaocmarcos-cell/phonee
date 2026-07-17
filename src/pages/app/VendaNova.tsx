import { useCallback, useEffect, useMemo, useState, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { buildLineItemFromProduct } from "@/lib/vendaSearch";
import { NumberInput } from "@/components/NumberInput";
import { LastEditFooter } from "@/components/audit/LastEditFooter";

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

export type NewTradeInDraft = {
  brand: string;
  model: string;
  storage_gb: string;
  color: string;
  imei: string;
  condition: "otimo" | "bom" | "regular" | "com_defeito";
  battery_health: number;
  entry_value: number;
  intended_sale_value: number;
  needs_repair: boolean;
  repair_desc: string;
  repair_cost_est: number;
  charger_included: boolean;
  accessories: string;
  notes: string;
};

type SplitPayment = {
  method: string;
  amount: number;
  notes: string;
  installments?: number;
  trade_in_id?: string | null;
  /** Rascunho criado pelo dialog inline — vai atomicamente na RPC create_sale. */
  new_trade_in?: NewTradeInDraft | null;
  /** Vale-troca: código digitado, id/saldo confirmado após validate_store_credit */
  store_credit_code?: string;
  store_credit_id?: string | null;
  store_credit_balance?: number | null;
};

type TradeInLite = {
  id: string; brand: string | null; model: string | null;
  storage_gb: number | null; imei: string | null;
  entry_value: number; status: string; product_id: string | null;
};

const PAY_METHODS: { value: string; label: string }[] = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix",      label: "PIX" },
  { value: "debito",   label: "Cartão de débito" },
  { value: "credito",  label: "Cartão de crédito" },
  { value: "crediario",label: "Crediário" },
  { value: "boleto",   label: "Boleto" },
  { value: "transferencia", label: "Transferência" },
  { value: "troca",    label: "Troca de aparelho" },
  { value: "vale_troca", label: "Vale-troca" },
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
  const { id: editingSaleId } = useParams();
  const isEditingSale = !!editingSaleId;
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
  const [productQueryDebounced, setProductQueryDebounced] = useState("");
  const [showProductList, setShowProductList] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [allowNegativeStock, setAllowNegativeStock] = useState(true);
  const [items, setItems] = useState<LineItem[]>([]);

  // Serviços
  const [serviceDialog, setServiceDialog] = useState<{ open: boolean; description: string; quantity: number; unit_price: number; editing?: string | null }>({
    open: false, description: "", quantity: 0, unit_price: 0, editing: null,
  });
  const openNewService = () =>
    setServiceDialog({ open: true, description: "", quantity: 0, unit_price: 0, editing: null });
  const openEditService = (i: LineItem) =>
    setServiceDialog({ open: true, description: i.description || i.name, quantity: i.quantity, unit_price: i.unit_price, editing: i.product_id });
  const saveService = () => {
    const desc = serviceDialog.description.trim();
    const qty = Number(serviceDialog.quantity) || 0;
    const price = Number(serviceDialog.unit_price) || 0;
    if (!desc) return toast.error("Descreva o serviço");
    if (qty < 1) return toast.error("Informe a quantidade do serviço (mínimo 1)");
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
    setServiceDialog({ open: false, description: "", quantity: 0, unit_price: 0, editing: null });
  };

  // Comissões
  const [commissionPct, setCommissionPct] = useState(0);
  const [commissionStatus, setCommissionStatus] = useState("pendente");

  // Pagamento
  const [payments, setPayments] = useState<SplitPayment[]>([
    { method: "dinheiro", amount: 0, notes: "", installments: 1, trade_in_id: null },
  ]);
  const [otherExpenses, setOtherExpenses] = useState(0);
  const [freight, setFreight] = useState(0);
  const [netValue, setNetValue] = useState<number>(0);
  const [deductionReason, setDeductionReason] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Trade-ins disponíveis para uso como meio de pagamento
  const [availableTradeIns, setAvailableTradeIns] = useState<TradeInLite[]>([]);

  // Dialog inline para cadastrar aparelho de troca DENTRO da venda (Fatia 1).
  const emptyTradeInDraft: NewTradeInDraft = {
    brand: "", model: "", storage_gb: "", color: "", imei: "",
    condition: "bom", battery_health: 100,
    entry_value: 0, intended_sale_value: 0,
    needs_repair: false, repair_desc: "", repair_cost_est: 0,
    charger_included: false, accessories: "", notes: "",
  };
  const [tradeInDialogIdx, setTradeInDialogIdx] = useState<number | null>(null);
  const [tradeInDraft, setTradeInDraft] = useState<NewTradeInDraft>(emptyTradeInDraft);

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
  const [editHasTradeIn, setEditHasTradeIn] = useState(false);
  const [editSaleLoaded, setEditSaleLoaded] = useState(false);

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

  const loadSaleProducts = useCallback(async (query = productQueryDebounced) => {
    if (!store) return;
    setLoadingProducts(true);
    const { data, error } = await (supabase as any).rpc("search_sale_products", {
      _store_id: store.id,
      _query: query,
      _limit: query.trim() ? 30 : 12,
    });
    setLoadingProducts(false);
    if (error) {
      console.error("[VendaNova] falha ao buscar produtos:", error);
      toast.error("Não foi possível buscar os produtos da loja.");
      return;
    }
    setProducts(data ?? []);
  }, [store, productQueryDebounced]);

  useEffect(() => { loadSaleProducts(productQueryDebounced); }, [loadSaleProducts, productQueryDebounced]);

  useEffect(() => {
    if (!store) return;
    const ch = supabase
      .channel(`venda-nova-products-${store.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `store_id=eq.${store.id}` }, () => loadSaleProducts(productQueryDebounced))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [store, loadSaleProducts, productQueryDebounced]);

  // Configuração da loja: permite (ou não) vender com estoque negativo.
  useEffect(() => {
    if (!store) return;
    (async () => {
      const { data } = await (supabase.from("stores") as any)
        .select("allow_negative_stock")
        .eq("id", store.id)
        .maybeSingle();
      setAllowNegativeStock(data?.allow_negative_stock ?? true);
    })();
  }, [store]);

  // Modo edição: carrega venda existente + itens + pagamentos e preenche o formulário.
  useEffect(() => {
    if (!isEditingSale || !store || editSaleLoaded) return;
    (async () => {
      const { data: sale } = await supabase
        .from("sales").select("*").eq("id", editingSaleId).maybeSingle();
      if (!sale) { toast.error("Venda não encontrada."); navigate("/painel/vendas"); return; }
      const { data: sItems } = await supabase
        .from("sale_items").select("*").eq("sale_id", editingSaleId);
      const { data: sPays } = await supabase
        .from("sale_payments").select("*").eq("sale_id", editingSaleId);

      setCustomer((sale as any).customer_name ?? "");
      setCustomerId((sale as any).customer_id ?? null);
      setDoc((sale as any).customer_doc ?? "");
      setWhatsapp((sale as any).customer_whatsapp ?? "");
      // Extras estão em notes (JSON). Tenta preservar.
      try {
        const extras = (sale as any).notes ? JSON.parse((sale as any).notes) : null;
        const ex = extras?.extras;
        if (ex?.phone) setPhone(ex.phone);
        if (ex?.city) setCity(ex.city);
        if (ex?.customer_doc_type === "cpf" || ex?.customer_doc_type === "cnpj") setDocType(ex.customer_doc_type);
        if (ex?.user_notes) setNotes(ex.user_notes);
        if (ex?.category) setCategory(ex.category);
        if (typeof ex?.commission?.percent === "number") setCommissionPct(ex.commission.percent);
        if (ex?.commission?.status) setCommissionStatus(ex.commission.status);
        if (ex?.delivery?.sale_date) setSaleDate(ex.delivery.sale_date);
      } catch { /* noop — notes pode ser texto livre */ }

      const loadedItems: LineItem[] = ((sItems ?? []) as any[]).map((r) => {
        const price = Number(r.unit_price || 0);
        const disc = Number(r.discount_amount || 0);
        const qty = Number(r.quantity || 0);
        const discPerUnit = qty > 0 ? disc / qty : 0;
        return {
          product_id: r.product_id ?? `svc-${r.id}`,
          is_service: !!r.is_service,
          description: r.description ?? undefined,
          name: r.name ?? r.description ?? "",
          code: r.sku ?? undefined,
          category: r.category ?? undefined,
          quantity: qty,
          list_price: price + discPerUnit,
          discount_pct: 0,
          discount_brl: discPerUnit,
          unit_price: price,
        };
      });
      setItems(loadedItems);

      const loadedPays: SplitPayment[] = ((sPays ?? []) as any[]).map((p) => ({
        method: p.method,
        amount: Number(p.amount || 0),
        notes: p.notes ?? "",
        installments: p.installments ?? 1,
        trade_in_id: p.trade_in_id ?? null,
      }));
      if (loadedPays.length > 0) setPayments(loadedPays);
      setEditHasTradeIn(loadedPays.some((p) => !!p.trade_in_id));
      setEditSaleLoaded(true);
    })();
  }, [isEditingSale, store, editingSaleId, editSaleLoaded, navigate]);

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

  // Carrega trade-ins disponíveis para uso como meio de pagamento
  const loadAvailableTradeIns = useCallback(async () => {
    if (!store) return;
    const { data } = await (supabase as any)
      .from("trade_ins")
      .select("id,brand,model,storage_gb,imei,entry_value,status,product_id")
      .eq("store_id", store.id)
      .in("status", ["em_avaliacao", "aprovado"])
      .is("received_in_sale_id", null)
      .order("created_at", { ascending: false })
      .limit(50);
    setAvailableTradeIns((data as TradeInLite[]) ?? []);
  }, [store]);
  useEffect(() => { loadAvailableTradeIns(); }, [loadAvailableTradeIns]);

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

  // Debounce de 300ms para o termo de busca.
  useEffect(() => {
    const t = setTimeout(() => setProductQueryDebounced(productQuery), 300);
    return () => clearTimeout(t);
  }, [productQuery]);

  const searchState = useMemo(() => {
    const raw = productQuery.trim();
    const deb = productQueryDebounced.trim();
    if (loadingProducts || raw !== deb) return { kind: "searching" as const };
    if (products.length === 0 && deb) return { kind: "no-results" as const, term: deb };
    if (products.length === 0) return { kind: "empty-table" as const };
    if (!deb) return { kind: "initial" as const, items: products };
    return { kind: "results" as const, items: products };
  }, [products, productQuery, productQueryDebounced, loadingProducts]);
  const visibleProducts = useMemo<any[]>(() => {
    if (searchState.kind === "results" || searchState.kind === "initial") return searchState.items as any[];
    return [];
  }, [searchState]);

  // Zera o índice ativo sempre que a lista visível muda.
  useEffect(() => { setActiveIdx(0); }, [productQueryDebounced, products.length]);

  const addItem = (p: any) => {
    // Bloqueio duro apenas quando a loja NÃO permite estoque negativo.
    if (!allowNegativeStock && Number(p.stock_current) <= 0) {
      toast.warning(`"${p.name}" está sem estoque. Regularize em Compras/Estoque antes de vender.`);
      return;
    }
    // Vinculação validada de product_id, nome, preço e estoque.
    const built = buildLineItemFromProduct(p);
    if (built.ok === false) { toast.error(built.error); return; }
    const draft = built.item;
    built.warnings.forEach((w) => toast.warning(w));

    setItems((arr) => {
      const existing = arr.find((i) => i.product_id === draft.product_id);
      if (existing) return arr.map((i) => i.product_id === draft.product_id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...arr, {
        product_id: draft.product_id,
        name: draft.name,
        code: draft.code ?? undefined,
        category: draft.category ?? undefined,
        color: draft.color ?? undefined,
        storage: draft.storage ?? undefined,
        quantity: 1,
        list_price: draft.list_price,
        discount_pct: 0,
        discount_brl: 0,
        unit_price: draft.unit_price,
      }];
    });
    setProductQuery("");
    setShowProductList(false);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showProductList || visibleProducts.length === 0) {
      if (e.key === "ArrowDown") { setShowProductList(true); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(visibleProducts.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = visibleProducts[activeIdx];
      if (p) addItem(p);
    } else if (e.key === "Escape") {
      setShowProductList(false);
    }
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
    // Trocas: uma por venda, com aparelho selecionado e valor = entry_value.
    const trocaPays = payments.filter((p) => p.method === "troca");
    if (trocaPays.length > 1) {
      return toast.error("Só é possível registrar uma troca de aparelho por venda.");
    }
    for (const tp of trocaPays) {
      if (!tp.trade_in_id && !tp.new_trade_in) {
        return toast.error("Selecione o aparelho recebido na troca ou cadastre um novo.");
      }
      if (tp.new_trade_in) {
        const d = tp.new_trade_in;
        if (!d.model.trim()) return toast.error("Informe o modelo do aparelho da troca.");
        if (Number(d.entry_value) <= 0) {
          return toast.error("Valor de entrada do aparelho de troca deve ser maior que zero.");
        }
      } else {
        const ti = availableTradeIns.find((x) => x.id === tp.trade_in_id);
        if (!ti) return toast.error("Aparelho de troca não encontrado. Recarregue a lista.");
      }
      // Amount pode ser ajustado manualmente; se ficar diferente do entry_value, avisa mas segue.
      if (Number(tp.amount) > totalSale) {
        return toast.error("Valor da troca não pode exceder o total da venda.");
      }
    }
    // Validação estrita do payment_breakdown quando há troca: a soma de TODAS
    // as parcelas (incluindo a troca) precisa ser exatamente o total da venda.
    if (trocaPays.length > 0) {
      const sumBreakdown = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      if (Math.abs(sumBreakdown - totalSale) > 0.01) {
        return toast.error(
          `Composição do pagamento inconsistente: soma ${brl(sumBreakdown)} ≠ total ${brl(totalSale)}. ` +
          "Ajuste as parcelas para que a troca + demais métodos batam com o total."
        );
      }
    }
    // Valida vale-troca: precisa estar validado e com saldo suficiente
    for (const vp of payments.filter((p) => p.method === "vale_troca")) {
      if (!vp.store_credit_id) {
        return toast.error("Valide o código do vale-troca antes de finalizar a venda.");
      }
      if (Number(vp.amount) <= 0) {
        return toast.error("Informe o valor a abater do vale-troca.");
      }
      if (vp.store_credit_balance != null && Number(vp.amount) > vp.store_credit_balance + 0.001) {
        return toast.error(`Vale-troca ${vp.store_credit_code}: saldo insuficiente (${brl(vp.store_credit_balance)}).`);
      }
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
    // Validação final antes de gravar — impede vendas sem itens ou itens inválidos
    if (items.length === 0) {
      return toast.error("Adicione ao menos um item antes de salvar.");
    }
    const invalid = items.find((i) =>
      Number(i.quantity || 0) <= 0 ||
      (!i.is_service && !i.product_id) ||
      (i.is_service && !((i.description || i.name || "").trim())) ||
      !((i.name || i.description || "").trim())
    );
    if (invalid) {
      return toast.error("Há itens sem descrição ou quantidade válida. Revise antes de salvar.");
    }
    setBusy(true);

    const payload = buildPayload();
    // Sincroniza cliente com o CRM antes de gravar a venda
    const linkedCustomerId = await ensureCustomerRecord();
    // Compat: header payment_method é um enum e não conhece "troca". Usa o primeiro
    // método monetário; se todos forem troca (sem parte em caixa), grava "dinheiro" como fallback.
    const monetaryMethods = payments
      .filter((p) => p.method !== "troca" && Number(p.amount) > 0)
      .map((p) => p.method);
    const dbMethod = isMulti
      ? "misto"
      : (["dinheiro", "pix", "debito", "credito", "crediario"].includes(primaryMethod)
          ? primaryMethod
          : (monetaryMethods[0] && ["dinheiro","pix","debito","credito","crediario"].includes(monetaryMethods[0])
              ? monetaryMethods[0]
              : "dinheiro"));
    const headInstallments = payments[0]?.installments ?? 1;

    // Atomic sale: cabeçalho + itens + pagamentos + baixa de estoque numa única
    // transação no banco. O total é recalculado no servidor e o estoque é
    // debitado com trava (WHERE stock_current >= qty), evitando venda com
    // estoque negativo em cenários concorrentes.
    const rpcItems = items.map((i) => ({
      product_id: i.is_service ? null : i.product_id,
      is_service: !!i.is_service,
      description: i.is_service ? (i.description || i.name) : null,
      quantity: i.quantity,
      unit_price: i.list_price,
      name: i.name || null,
      sku: i.is_service ? "SERVIÇO" : (i.code || null),
      category: i.category || null,
      brand: (i as any).brand || null,
      model: (i as any).model || null,
      unit: unit || null,
      discount_amount: +(Number(i.discount_brl || 0) * Number(i.quantity || 0)).toFixed(2),
      warranty_days: warrantyEnabled ? warrantyDays : null,
    }));
    const rpcPayments = payments
      .filter((p) => Number(p.amount) > 0)
      .map((p) => ({
        method: p.method,
        amount: Number(p.amount),
        installments: p.installments ?? null,
        notes: p.notes || null,
        trade_in_id: p.trade_in_id ?? null,
      }));

    // Aparelho de troca cadastrado inline no PDV (Fatia 1): vai atomicamente
    // na RPC create_sale para virar trade_in + sale_payment.trade_in_id numa
    // única transação — sem despesa gerada no financeiro.
    const trocaWithDraft = payments.find((p) => p.method === "troca" && p.new_trade_in);
    const tradeInPayload = trocaWithDraft?.new_trade_in
      ? {
          brand: trocaWithDraft.new_trade_in.brand || null,
          model: trocaWithDraft.new_trade_in.model || "Aparelho",
          storage_gb: trocaWithDraft.new_trade_in.storage_gb || null,
          color: trocaWithDraft.new_trade_in.color || null,
          imei: trocaWithDraft.new_trade_in.imei || null,
          condition: trocaWithDraft.new_trade_in.condition,
          battery_health: trocaWithDraft.new_trade_in.battery_health || null,
          entry_value: Number(trocaWithDraft.new_trade_in.entry_value) || 0,
          intended_sale_value:
            Number(trocaWithDraft.new_trade_in.intended_sale_value) ||
            Number(trocaWithDraft.new_trade_in.entry_value) || 0,
          needs_repair: !!trocaWithDraft.new_trade_in.needs_repair,
          customer_name: customer || null,
          customer_doc: doc || null,
          customer_phone: whatsapp || null,
          checklist: {
            charger_included: !!trocaWithDraft.new_trade_in.charger_included,
            accessories: trocaWithDraft.new_trade_in.accessories || "",
          },
          notes: [
            trocaWithDraft.new_trade_in.notes,
            trocaWithDraft.new_trade_in.needs_repair && trocaWithDraft.new_trade_in.repair_desc
              ? `Reparo previsto: ${trocaWithDraft.new_trade_in.repair_desc} (~${brl(Number(trocaWithDraft.new_trade_in.repair_cost_est) || 0)})`
              : "",
          ].filter(Boolean).join("\n") || null,
        }
      : null;

    // Bloqueio local: em edição de venda com troca, não permite remover a parcela de troca.
    if (isEditingSale && editHasTradeIn && !payments.some((p) => p.method === "troca")) {
      setBusy(false);
      return toast.error(
        "Esta venda tem parcela de troca vinculada a um trade-in. Cancele a venda em vez de remover a troca pela edição.",
      );
    }

    const { data: rpcData, error } = isEditingSale
      ? await (supabase as any).rpc("update_sale_with_stock", {
          _sale_id: editingSaleId,
          _customer_id: linkedCustomerId,
          _customer_name: customer || null,
          _customer_doc: doc || null,
          _customer_whatsapp: whatsapp || null,
          _payment_method: dbMethod,
          _installments: headInstallments,
          _discount: totalDiscount,
          _notes: JSON.stringify(payload),
          _items: rpcItems,
          _payments: rpcPayments,
        })
      : await (supabase as any).rpc("create_sale", {
          _store_id: store.id,
          _customer_id: linkedCustomerId,
          _customer_name: customer || null,
          _customer_doc: doc || null,
          _customer_whatsapp: whatsapp || null,
          _payment_method: dbMethod,
          _installments: headInstallments,
          _discount: totalDiscount,
          _notes: JSON.stringify(payload),
          _items: rpcItems,
          _payments: rpcPayments,
          _trade_in: tradeInPayload,
        });

    if (error || !rpcData) {
      setBusy(false);
      const raw = error?.message ?? "";
      let msg = raw || "Erro ao registrar a venda.";
      if (/estoque insuficiente/i.test(raw)) {
        msg = "Estoque insuficiente para um dos itens. Atualize a lista e tente novamente.";
      } else if (/sem acesso a esta loja/i.test(raw)) {
        msg = "Você não tem permissão para registrar vendas nesta loja.";
      } else if (/soma dos pagamentos/i.test(raw)) {
        msg = "A soma das formas de pagamento não fecha com o total. Revise antes de salvar.";
        // Auditoria de checksum: registra os valores divergentes para diagnóstico.
        try {
          await (supabase as any).from("audit_log").insert({
            user_id: user.id,
            store_id: store.id,
            action: "checksum_falha",
            entity: "sale",
            module: "vendas",
            screen: isEditingSale ? "venda_editar" : "venda_nova",
            status: "erro",
            details: {
              origem: "VendaNova",
              subtotal_bruto: subtotal,
              desconto_total: totalDiscount,
              frete: freight,
              outras_despesas: otherExpenses,
              total_esperado: totalSale,
              soma_pagamentos: paid,
              divergencia: +(paid - totalSale).toFixed(2),
              itens: rpcItems.map((it) => ({
                name: it.name, qty: it.quantity, unit_price: it.unit_price, discount: it.discount_amount,
              })),
              pagamentos: rpcPayments,
              db_error: raw,
            },
          });
        } catch {/* silencia falha do log */}
      } else if (/venda precisa de ao menos um item/i.test(raw)) {
        msg = "Adicione ao menos um item antes de salvar.";
      } else if (/desconto maior que o subtotal/i.test(raw)) {
        msg = "O desconto é maior que o subtotal dos itens.";
      }
      return toast.error(msg);
    }

    const sale = {
      id: (rpcData as any).sale_id as string,
      sale_number: (rpcData as any).sale_number as number | null,
    };

    // Vincula os aparelhos recebidos em troca à venda e move para "em_estoque"
    // (trigger tg_tradein_to_product cria o produto no inventário com o custo correto).
    for (const tp of payments.filter((p) => p.method === "troca" && p.trade_in_id)) {
      await (supabase as any)
        .from("trade_ins")
        .update({ received_in_sale_id: sale.id, status: "em_estoque" })
        .eq("id", tp.trade_in_id);
      // Marca o pagamento troca desta venda com o vínculo do trade-in
      await (supabase as any)
        .from("sale_payments")
        .update({ trade_in_id: tp.trade_in_id })
        .eq("sale_id", sale.id)
        .eq("method", "troca");
    }
    // Persiste o breakdown de pagamento na venda (para relatórios de caixa)
    await (supabase as any)
      .from("sales")
      .update({
        payment_breakdown: payments
          .filter((p) => Number(p.amount) > 0)
          .map((p) => ({
            method: p.method,
            amount: Number(p.amount),
            installments: p.installments ?? 1,
            trade_in_id: p.trade_in_id ?? null,
            store_credit_code: p.store_credit_code ?? null,
          })),
      })
      .eq("id", sale.id);

    // Abate vale-troca (chama uma vez por split e atualiza notes do sale_payment)
    for (const vp of payments.filter((p) => p.method === "vale_troca" && p.store_credit_id && Number(p.amount) > 0)) {
      try {
        const { data: rd, error: rdErr } = await (supabase as any).rpc("redeem_store_credit", {
          _store_id: store.id,
          _code: vp.store_credit_code,
          _amount: Number(vp.amount),
          _sale_id: sale.id,
        });
        if (rdErr) throw rdErr;
        const nota = `Vale-troca ${vp.store_credit_code} · saldo restante ${brl(Number((rd as any)?.balance ?? 0))}`;
        await (supabase as any).from("sale_payments").update({ notes: nota })
          .eq("sale_id", sale.id).eq("method", "vale_troca");
      } catch (err: any) {
        toast.error(`Falha ao abater vale-troca ${vp.store_credit_code}: ${err.message}`);
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
    if (isEditingSale) {
      toast.success("Venda atualizada · estoque recalculado");
      navigate("/painel/vendas");
    } else {
      toast.success("Venda registrada!");
      setPostSave({
        saleId: sale.id,
        saleNumber: (sale as any).sale_number ?? null,
        customerId: linkedCustomerId,
        customerName: customer.trim() || "—",
      });
    }
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
        title={isEditingSale ? "Editar venda" : "Nova venda"}
        description={isEditingSale
          ? "Ajuste itens, quantidades, preços e formas de pagamento. O estoque é recalculado pela diferença e a alteração fica na auditoria."
          : "Cadastro completo de venda, com cliente, itens, pagamento e entrega."}
        actions={
          <div className="hidden md:flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/painel/vendas")}><X className="h-4 w-4 mr-1" />Cancelar</Button>
            <Button variant="outline" onClick={exportPDF}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
            <Button variant="outline" onClick={sendWhatsapp}><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</Button>
            <Button onClick={onSubmitClick} disabled={busy} className="bg-primary text-primary-foreground shadow-glow">
              <Save className="h-4 w-4 mr-1" />{busy ? "Salvando…" : (isEditingSale ? "Salvar alterações" : "Salvar venda")}
            </Button>
          </div>
        }
      />

      {isEditingSale && editingSaleId && (
        <div className="mb-4">
          <LastEditFooter entity="sale" entityId={editingSaleId} />
        </div>
      )}

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
                onFocus={() => setShowProductList(true)}
                onBlur={() => setTimeout(() => setShowProductList(false), 150)}
                onKeyDown={onSearchKeyDown}
                placeholder="Buscar por nome, SKU, EAN, categoria, marca ou modelo…"
                className="pl-9"
                role="combobox"
                aria-expanded={showProductList}
                aria-controls="produtos-listbox"
                aria-activedescendant={visibleProducts[activeIdx] ? `produto-opt-${visibleProducts[activeIdx].id}` : undefined}
                autoComplete="off"
              />
              {showProductList && searchState.kind === "empty-table" && (
                <div className="absolute z-10 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-card px-3 py-3 text-sm text-muted-foreground">
                  Nenhum produto cadastrado.{" "}
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); navigate("/painel/estoque/novo"); }}
                    className="text-primary hover:underline"
                  >
                    Cadastre em Estoque &gt; Produtos.
                  </button>
                </div>
              )}
              {showProductList && searchState.kind === "searching" && (
                <div className="absolute z-10 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-card px-3 py-3 text-sm text-muted-foreground">
                  Buscando…
                </div>
              )}
              {showProductList && searchState.kind === "no-results" && (
                <div className="absolute z-10 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-card px-3 py-3 text-sm text-muted-foreground">
                  Nenhum resultado para "{searchState.term}". Verifique o termo ou cadastre o produto no Estoque.
                </div>
              )}
              {showProductList && visibleProducts.length > 0 && (
                <div
                  id="produtos-listbox"
                  role="listbox"
                  className="absolute z-10 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-card max-h-64 overflow-auto"
                >
                  {visibleProducts.map((p: any, idx: number) => {
                    const noStock = Number(p.stock_current) <= 0;
                    const blocked = noStock && !allowNegativeStock;
                    const active = idx === activeIdx;
                    return (
                      <button
                        key={p.id}
                        id={`produto-opt-${p.id}`}
                        role="option"
                        aria-selected={active}
                        type="button"
                        onMouseEnter={() => setActiveIdx(idx)}
                        onMouseDown={(e) => { e.preventDefault(); addItem(p); }}
                        disabled={blocked}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-3 ${active ? "bg-accent" : "hover:bg-accent"} ${blocked ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate flex items-center gap-2">
                            <span className="truncate">{p.name}</span>
                            {noStock && allowNegativeStock && (
                              <span className="shrink-0 inline-flex items-center rounded-md bg-amber-500/15 text-amber-700 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider">
                                estoque negativo
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {p.sku} · {p.category} · {noStock
                              ? (blocked
                                  ? <span className="text-danger">SEM ESTOQUE</span>
                                  : <span className="text-amber-600">est. {p.stock_current}</span>)
                              : `est. ${p.stock_current}`}
                          </div>
                        </div>
                        <div className="font-mono text-sm">{brl(Number(p.sale_price))}</div>
                      </button>
                    );
                  })}
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
                     <td className="px-2 py-1.5"><NumberInput allowDecimal={false} min={0} emptyBehavior="zero" value={i.quantity} onValueChange={(n) => updateItem(i.product_id, { quantity: n })} className="h-8 text-right" /></td>
                     <td className="px-2 py-1.5"><NumberInput value={i.list_price} onValueChange={(n) => updateItem(i.product_id, { list_price: n })} className="h-8 text-right" /></td>
                     <td className="px-2 py-1.5"><NumberInput value={i.discount_pct} onValueChange={(n) => updateItem(i.product_id, { discount_pct: n })} className="h-8 text-right" /></td>
                     <td className="px-2 py-1.5"><NumberInput value={i.discount_brl} onValueChange={(n) => updateItem(i.product_id, { discount_brl: n })} className="h-8 text-right" /></td>
                     <td className="px-2 py-1.5"><NumberInput value={i.unit_price} onValueChange={(n) => updateItem(i.product_id, { unit_price: n })} className="h-8 text-right" /></td>
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
                    <Field label="Qtd"><NumberInput allowDecimal={false} min={0} emptyBehavior="zero" value={i.quantity} onValueChange={(n) => updateItem(i.product_id, { quantity: n })} /></Field>
                    <Field label="P. lista"><NumberInput value={i.list_price} onValueChange={(n) => updateItem(i.product_id, { list_price: n })} /></Field>
                    <Field label="Desc %"><NumberInput value={i.discount_pct} onValueChange={(n) => updateItem(i.product_id, { discount_pct: n })} /></Field>
                    <Field label="Desc R$"><NumberInput value={i.discount_brl} onValueChange={(n) => updateItem(i.product_id, { discount_brl: n })} /></Field>
                    <Field label="P. unit."><NumberInput value={i.unit_price} onValueChange={(n) => updateItem(i.product_id, { unit_price: n })} /></Field>
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Total</Label>
                      <div className="metric font-semibold h-10 flex items-center px-2 rounded-md bg-primary/10 text-primary">{brl(i.quantity * i.unit_price)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => document.querySelector<HTMLInputElement>('input[placeholder*="Buscar por nome"]')?.focus()}>
                <Plus className="h-4 w-4 mr-1" />Adicionar outro item
              </Button>
              <Button type="button" variant="outline" onClick={openNewService}>
                <Plus className="h-4 w-4 mr-1" />Adicionar serviço
              </Button>
            </div>
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
                   <NumberInput value={otherExpenses} onValueChange={setOtherExpenses} />
                  </Field>
                  <Field label="Frete">
                   <NumberInput value={freight} onValueChange={setFreight} />
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
                    const isTroca = p.method === "troca";
                    const isVale = p.method === "vale_troca";
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
                          <NumberInput
                            min={0}
                            value={p.amount}
                            onValueChange={(n) => updatePayment(idx, { amount: n })}
                          />
                        </Field>
                        <Field label="Parcelas">
                          <NumberInput
                            allowDecimal={false}
                            min={0}
                            max={24}
                            emptyBehavior="zero"
                            value={p.installments ?? 1}
                            disabled={!isCard}
                            onValueChange={(n) => updatePayment(idx, { installments: n })}
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
                        {isTroca && (
                          <div className="md:col-span-5 -mt-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-[11px] uppercase tracking-widest text-amber-700">
                                Aparelho recebido na troca
                              </Label>
                              <button
                                type="button"
                                onClick={() => {
                                  setTradeInDraft({
                                    ...emptyTradeInDraft,
                                    ...(p.new_trade_in ?? {}),
                                    entry_value: p.new_trade_in?.entry_value ?? (Number(p.amount) || 0),
                                  });
                                  setTradeInDialogIdx(idx);
                                }}
                                className="text-[11px] underline text-amber-700 hover:text-amber-800"
                              >
                                {p.new_trade_in ? "✎ Editar aparelho cadastrado" : "+ Cadastrar aparelho agora"}
                              </button>
                            </div>
                            {p.new_trade_in ? (
                              <div className="text-[11px] text-amber-800 bg-amber-500/10 rounded px-2 py-1.5 flex items-center justify-between gap-2">
                                <span>
                                  <b>{p.new_trade_in.brand} {p.new_trade_in.model}</b>
                                  {p.new_trade_in.storage_gb ? ` · ${p.new_trade_in.storage_gb}GB` : ""}
                                  {p.new_trade_in.imei ? ` · IMEI ${p.new_trade_in.imei}` : ""}
                                  {" · "}Avaliado em <b>{brl(p.new_trade_in.entry_value)}</b>
                                  {p.new_trade_in.needs_repair ? " · precisa de reparo" : ""}
                                </span>
                                <Button
                                  type="button" size="sm" variant="ghost"
                                  className="h-6 px-2 text-[11px]"
                                  onClick={() => updatePayment(idx, { new_trade_in: null })}
                                >
                                  Remover
                                </Button>
                              </div>
                            ) : availableTradeIns.length === 0 ? (
                              <div className="text-[11px] text-muted-foreground">
                                Nenhum aparelho pré-cadastrado. Use <b>+ Cadastrar aparelho agora</b> acima
                                para receber o aparelho na troca sem sair da venda.
                              </div>
                            ) : (
                              <Select
                                value={p.trade_in_id ?? ""}
                                onValueChange={(v) => {
                                  const ti = availableTradeIns.find((x) => x.id === v);
                                  updatePayment(idx, {
                                    trade_in_id: v || null,
                                    amount: ti ? Number(ti.entry_value || 0) : p.amount,
                                    notes: ti ? `${ti.brand ?? ""} ${ti.model ?? ""}${ti.imei ? ` · IMEI ${ti.imei}` : ""}`.trim() : p.notes,
                                  });
                                }}
                              >
                                <SelectTrigger className="h-9"><SelectValue placeholder="Selecionar aparelho…" /></SelectTrigger>
                                <SelectContent>
                                  {availableTradeIns.map((ti) => (
                                    <SelectItem key={ti.id} value={ti.id}>
                                      {ti.brand} {ti.model} {ti.storage_gb ? `· ${ti.storage_gb}GB` : ""} · {brl(Number(ti.entry_value || 0))}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        )}
                        {isVale && (
                          <div className="md:col-span-5 -mt-1 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 space-y-1.5">
                            <Label className="text-[11px] uppercase tracking-widest text-emerald-700">Vale-troca</Label>
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                value={p.store_credit_code || ""}
                                placeholder="Código (ex.: VT-AB23CD)"
                                className="h-9 w-48 uppercase"
                                onChange={(e) => updatePayment(idx, {
                                  store_credit_code: e.target.value.toUpperCase(),
                                  store_credit_id: null, store_credit_balance: null,
                                })}
                              />
                              <Button
                                type="button" size="sm" variant="outline"
                                disabled={!store || !p.store_credit_code}
                                onClick={async () => {
                                  if (!store) return;
                                  const { data, error } = await (supabase as any).rpc("validate_store_credit", {
                                    _store_id: store.id, _code: p.store_credit_code,
                                  });
                                  if (error) return toast.error(error.message);
                                  const r = data as any;
                                  if (!r?.ok) return toast.error(`Vale-troca: ${r?.reason || "inválido"}`);
                                  updatePayment(idx, {
                                    store_credit_id: r.id,
                                    store_credit_balance: Number(r.balance || 0),
                                    amount: Math.min(Math.max(0, remaining) || Number(r.balance), Number(r.balance)),
                                    notes: `Vale-troca ${r.code} · saldo ${brl(Number(r.balance || 0))}`,
                                  });
                                  toast.success(`Vale-troca válido — saldo ${brl(Number(r.balance || 0))}`);
                                }}
                              >Validar</Button>
                              {p.store_credit_balance != null && (
                                <span className="text-[11px] text-emerald-700">
                                  Saldo disponível: <b>{brl(Number(p.store_credit_balance))}</b>
                                </span>
                              )}
                            </div>
                          </div>
                        )}
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
                <Field label="Valor do frete"><NumberInput value={freight} onValueChange={setFreight} /></Field>
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
                <Field label="% Comissão"><NumberInput value={commissionPct} onValueChange={setCommissionPct} /></Field>
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
            <div className="rounded-md border border-border/60 bg-surface-elevated/40 p-2 space-y-1 font-mono text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal bruto</span><span>{brl(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Descontos</span><span>− {brl(totalDiscount)}</span></div>
              {freight > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span>+ {brl(freight)}</span></div>
              )}
              {otherExpenses > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Outras despesas</span><span>+ {brl(otherExpenses)}</span></div>
              )}
              <div className="flex justify-between border-t border-border/60 pt-1 font-semibold text-foreground"><span>Total esperado</span><span>{brl(totalSale)}</span></div>
            </div>
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
            <div className={`flex justify-between text-xs ${Math.abs(remaining) < 0.01 ? "text-success" : "text-danger"}`}>
              <span>Restante</span><span>{brl(remaining)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>Voltar</Button>
            <Button onClick={() => submit()} disabled={busy || Math.abs(remaining) > 0.009} className="bg-primary text-primary-foreground">
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
      <Dialog open={serviceDialog.open} onOpenChange={(o) => setServiceDialog((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{serviceDialog.editing ? "Editar serviço" : "Adicionar serviço"}</DialogTitle>
            <DialogDescription>Descreva o serviço e informe o valor cobrado.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Descrição do serviço *</Label>
              <Textarea
                value={serviceDialog.description}
                onChange={(e) => setServiceDialog((s) => ({ ...s, description: e.target.value }))}
                placeholder="Ex.: Troca de tela iPhone 12"
                rows={3}
                maxLength={300}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantidade</Label>
                <NumberInput allowDecimal={false} min={0} emptyBehavior="zero" value={serviceDialog.quantity}
                  onValueChange={(n) => setServiceDialog((s) => ({ ...s, quantity: n }))} />
              </div>
              <div>
                <Label>Valor unitário (R$) *</Label>
                <NumberInput min={0} value={serviceDialog.unit_price}
                  onValueChange={(n) => setServiceDialog((s) => ({ ...s, unit_price: n }))} />
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Total: <span className="font-mono text-foreground font-semibold">{brl((Number(serviceDialog.unit_price) || 0) * (Number(serviceDialog.quantity) || 0))}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setServiceDialog({ open: false, description: "", quantity: 0, unit_price: 0, editing: null })}>Cancelar</Button>
            <Button onClick={saveService} className="bg-gradient-primary">{serviceDialog.editing ? "Salvar alterações" : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Dialog inline: cadastrar aparelho recebido na troca (Fatia 1) */}
      <Dialog
        open={tradeInDialogIdx !== null}
        onOpenChange={(o) => { if (!o) setTradeInDialogIdx(null); }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Aparelho recebido na troca</DialogTitle>
            <DialogDescription>
              O aparelho entra no estoque atomicamente com esta venda. <b>Não gera despesa</b> no
              financeiro — o custo aparece só quando ele for revendido.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 py-2">
            <Field label="Marca">
              <Input value={tradeInDraft.brand}
                onChange={(e) => setTradeInDraft({ ...tradeInDraft, brand: e.target.value })}
                placeholder="Apple, Samsung…" />
            </Field>
            <Field label="Modelo *">
              <Input value={tradeInDraft.model}
                onChange={(e) => setTradeInDraft({ ...tradeInDraft, model: e.target.value })}
                placeholder="iPhone 12" />
            </Field>
            <Field label="Armazenamento (GB)">
              <Input value={tradeInDraft.storage_gb}
                onChange={(e) => setTradeInDraft({ ...tradeInDraft, storage_gb: e.target.value })}
                placeholder="128" />
            </Field>
            <Field label="Cor">
              <Input value={tradeInDraft.color}
                onChange={(e) => setTradeInDraft({ ...tradeInDraft, color: e.target.value })} />
            </Field>
            <Field label="IMEI">
              <Input value={tradeInDraft.imei}
                onChange={(e) => setTradeInDraft({ ...tradeInDraft, imei: e.target.value })} />
            </Field>
            <Field label="Condição">
              <Select value={tradeInDraft.condition}
                onValueChange={(v) => setTradeInDraft({ ...tradeInDraft, condition: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="otimo">Ótimo</SelectItem>
                  <SelectItem value="bom">Bom</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="com_defeito">Com defeito</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Saúde bateria (%)">
              <NumberInput allowDecimal={false} min={0} value={tradeInDraft.battery_health}
                onValueChange={(n) => setTradeInDraft({ ...tradeInDraft, battery_health: n })} />
            </Field>
            <Field label="Valor de entrada (abatimento) *">
              <NumberInput min={0} value={tradeInDraft.entry_value}
                onValueChange={(n) => setTradeInDraft({ ...tradeInDraft, entry_value: n })} />
            </Field>
            <Field label="Preço pretendido de venda">
              <NumberInput min={0} value={tradeInDraft.intended_sale_value}
                onValueChange={(n) => setTradeInDraft({ ...tradeInDraft, intended_sale_value: n })} />
            </Field>
            <div className="col-span-2 md:col-span-3 flex flex-wrap items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={tradeInDraft.needs_repair}
                  onCheckedChange={(v) => setTradeInDraft({ ...tradeInDraft, needs_repair: v })} />
                Precisa de reparo
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={tradeInDraft.charger_included}
                  onCheckedChange={(v) => setTradeInDraft({ ...tradeInDraft, charger_included: v })} />
                Carregador incluso
              </label>
            </div>
            {tradeInDraft.needs_repair && (
              <>
                <div className="col-span-2">
                  <Field label="Descrição do reparo">
                    <Input value={tradeInDraft.repair_desc}
                      onChange={(e) => setTradeInDraft({ ...tradeInDraft, repair_desc: e.target.value })}
                      placeholder="Ex.: troca de bateria, tela…" />
                  </Field>
                </div>
                <Field label="Custo estimado do reparo">
                  <NumberInput min={0} value={tradeInDraft.repair_cost_est}
                    onValueChange={(n) => setTradeInDraft({ ...tradeInDraft, repair_cost_est: n })} />
                </Field>
              </>
            )}
            <div className="col-span-2 md:col-span-3">
              <Field label="Acessórios / brindes inclusos">
                <Input value={tradeInDraft.accessories}
                  onChange={(e) => setTradeInDraft({ ...tradeInDraft, accessories: e.target.value })}
                  placeholder="Ex.: capinha, película, fone" />
              </Field>
            </div>
            <div className="col-span-2 md:col-span-3">
              <Field label="Observações">
                <Textarea rows={2} value={tradeInDraft.notes}
                  onChange={(e) => setTradeInDraft({ ...tradeInDraft, notes: e.target.value })} />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTradeInDialogIdx(null)}>Cancelar</Button>
            <Button
              className="bg-gradient-primary"
              onClick={() => {
                if (!tradeInDraft.model.trim()) return toast.error("Informe o modelo.");
                if (Number(tradeInDraft.entry_value) <= 0) {
                  return toast.error("Informe o valor de entrada (abatimento).");
                }
                if (tradeInDialogIdx === null) return;
                updatePayment(tradeInDialogIdx, {
                  new_trade_in: { ...tradeInDraft },
                  trade_in_id: null,
                  amount: Number(tradeInDraft.entry_value) || 0,
                  notes: `${tradeInDraft.brand} ${tradeInDraft.model}${tradeInDraft.imei ? ` · IMEI ${tradeInDraft.imei}` : ""}`.trim(),
                });
                setTradeInDialogIdx(null);
              }}
            >
              Salvar aparelho
            </Button>
          </DialogFooter>
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
