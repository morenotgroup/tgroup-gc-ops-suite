// panel/app/api/ops-data/route.ts
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import type { Role } from "../../../lib/rbac";
import { canSeeCompany } from "../../../lib/rbac";

type ClosingStatus = {
  active: boolean;
  competencia: string;
  endDate: string; // YYYY-MM-DD
  triggers?: { handler: string; type: string }[];
};

type PolicyRule = "OBRIGATORIA" | "OPCIONAL" | "DISPENSADA";

type PolicyEntry = {
  rule: PolicyRule;
  motivo: string;
  empresa?: string;
};

type AuditRow = {
  nome: string;
  comp: string;
  status: string;
  nf: string;
  link: string;
  salarioMes: number;
  flags: string[];
  empresas: string[]; // a partir do Esperado(json)
  primaryEmpresa: string; // maior esperado
  policyRule: PolicyRule;
  policyMotivo: string;
  complianceLevel: "OK" | "PENDENTE" | "CRITICO" | "OK_OPCIONAL" | "DISPENSADO";
  motivo: string;
  risco: number; // salarioMes quando pendente/crítico obrigatório
};

type FinanceRow = {
  empresa: string;
  comp: string;
  nome: string;
  valorEsperado: number;
  nf: string;
  link: string;
  payLevel: "OK" | "PENDENTE" | "CRITICO";
  motivo: string;
  policyRule: PolicyRule;
  policyMotivo: string;
  complianceLevel: AuditRow["complianceLevel"] | "NAO_ENCONTRADO";
};

function getServiceAccountAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  const creds = JSON.parse(raw);
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function normName(s: string) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos
}

function toNum(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = v
    .toString()
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function safeJsonParse(s: any) {
  try {
    if (!s) return {};
    if (typeof s === "object") return s;
    return JSON.parse(String(s));
  } catch {
    return {};
  }
}

function companyKey(company: string) {
  return company.replace(".", ""); // T.Youth -> TYouth
}

function finSheetName(company: string, comp: string) {
  return `FIN_${companyKey(company)}_${comp}`;
}

function auditSheetName(comp: string) {
  return `AUDITORIA_${comp}`;
}

function policySheetName(comp: string) {
  return `NF_POLICY_${comp}`;
}

function cltSheetName(comp: string) {
  return `FOLHA_CLT_${comp}`;
}

function pickPrimaryCompany(esperado: Record<string, any>) {
  let best = "";
  let bestV = -1;
  for (const [k, v] of Object.entries(esperado || {})) {
    const n = toNum(v);
    if (n > bestV) {
      bestV = n;
      best = k;
    }
  }
  return best || "";
}

async function fetchClosingStatus(comp: string): Promise<{ status: ClosingStatus | null; inWindow: boolean; daysLeft: number | null }> {
  const url = process.env.APPS_SCRIPT_WEBAPP_URL;
  const key = process.env.BOT_API_KEY;
  if (!url || !key) return { status: null, inWindow: false, daysLeft: null };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, action: "status" }),
    // evitar cache
    cache: "no-store",
  });

  const data: any = await resp.json().catch(() => ({}));
  const st: ClosingStatus | null = data?.status
    ? {
        active: !!data.status.active,
        competencia: String(data.status.competencia || ""),
        endDate: String(data.status.endDate || ""),
        triggers: data.status.triggers || [],
      }
    : null;

  if (!st || !st.active || st.competencia !== comp || !st.endDate) {
    return { status: st, inWindow: false, daysLeft: null };
  }

  const today = new Date();
  const end = new Date(st.endDate + "T23:59:59");
  const inWindow = today <= end;

  const daysLeft = inWindow ? Math.max(0, Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))) : 0;
  return { status: st, inWindow, daysLeft };
}

function detectHardErrors(flags: string[]) {
  // erros que sempre travam (independente da janela)
  const hard = new Set(["SEM_RATEIO", "SEM_SALARIO_MES"]);
  return flags.some((f) => hard.has(f));
}

function defaultRuleFromEmpresas(empresas: string[]) {
  // só Youth => opcional
  if (empresas.length === 1 && empresas[0] === "T.Youth") return "OPCIONAL" as PolicyRule;
  return "OBRIGATORIA" as PolicyRule;
}

function levelFromAuditRow(params: {
  missingNF: boolean;
  missingLink: boolean;
  inWindow: boolean;
  hardErrors: boolean;
  rule: PolicyRule;
}) {
  const missing = params.missingNF || params.missingLink;

  if (params.rule === "DISPENSADA") return "DISPENSADO" as const;
  if (params.hardErrors) return "CRITICO" as const;

  if (!missing) return "OK" as const;

  if (params.rule === "OPCIONAL") return "OK_OPCIONAL" as const;

  return params.inWindow ? ("PENDENTE" as const) : ("CRITICO" as const);
}

function payLevelFromFinanceRow(params: {
  company: string;
  missingNF: boolean;
  missingLink: boolean;
  inWindow: boolean;
  rule: PolicyRule;
  complianceLevel: AuditRow["complianceLevel"] | "NAO_ENCONTRADO";
}) {
  const missing = params.missingNF || params.missingLink;

  // Youth não trava pagamento (regra do negócio)
  if (params.company === "T.Youth") return "OK" as const;

  if (params.rule === "DISPENSADA") return "OK" as const;
  if (!missing) return "OK" as const;

  return params.inWindow ? ("PENDENTE" as const) : ("CRITICO" as const);
}

function parsePolicy(values: any[][]): Record<string, PolicyEntry> {
  if (!values || values.length < 2) return {};
  const header = values[0].map((x) => String(x || "").trim());
  const idx = (h: string) => header.findIndex((c) => c.toUpperCase() === h.toUpperCase());

  const iColab = idx("COLABORADOR");
  const iRegra = idx("REGRA");
  const iMotivo = idx("MOTIVO");
  const iEmp = idx("EMPRESA");

  const out: Record<string, PolicyEntry> = {};
  for (const r of values.slice(1)) {
    const nome = iColab >= 0 ? String(r[iColab] || "").trim() : "";
    if (!nome) continue;

    const regraRaw = iRegra >= 0 ? String(r[iRegra] || "").trim().toUpperCase() : "";
    const motivo = iMotivo >= 0 ? String(r[iMotivo] || "").trim() : "";
    const empresa = iEmp >= 0 ? String(r[iEmp] || "").trim() : "";

    let rule: PolicyRule = "OBRIGATORIA";
    if (regraRaw.includes("DISP")) rule = "DISPENSADA";
    else if (regraRaw.includes("OPC")) rule = "OPCIONAL";
    else if (regraRaw.includes("OBR")) rule = "OBRIGATORIA";

    out[normName(nome)] = { rule, motivo, empresa };
  }
  return out;
}

function parseAudit(values: any[][], policy: Record<string, PolicyEntry>, inWindow: boolean): { rows: AuditRow[]; byName: Record<string, AuditRow> } {
  if (!values || values.length < 2) return { rows: [], byName: {} };

  const header = values[0].map((x) => String(x || "").trim());
  const get = (r: any[], h: string) => {
    const i = header.findIndex((c) => c === h);
    return i >= 0 ? r[i] : "";
  };

  const out: AuditRow[] = [];
  const byName: Record<string, AuditRow> = {};

  for (const r of values.slice(1)) {
    const nome = String(get(r, "Nome") || "").trim();
    if (!nome) continue;

    const comp = String(get(r, "Competência") || "").trim();
    const status = String(get(r, "Status") || "").trim();
    const nf = String(get(r, "NF(planilha)") || "").trim();
    const link = String(get(r, "Link(planilha)") || "").trim();
    const salarioMes = toNum(get(r, "Salário Mês"));

    const flagsRaw = String(get(r, "Flags") || "").trim();
    const flags = flagsRaw ? flagsRaw.split(",").map((x) => x.trim()).filter(Boolean) : [];

    const esperadoJson = safeJsonParse(get(r, "Esperado(json)"));
    const empresas = Object.keys(esperadoJson || {}).filter(Boolean);
    const primaryEmpresa = pickPrimaryCompany(esperadoJson);

    const p = policy[normName(nome)];
    const policyRule = p?.rule || defaultRuleFromEmpresas(empresas);
    const policyMotivo = p?.motivo || "";

    const hardErrors = detectHardErrors(flags);
    const missingNF = !nf;
    const missingLink = !link;

    const complianceLevel = levelFromAuditRow({
      missingNF,
      missingLink,
      inWindow,
      hardErrors,
      rule: policyRule,
    });

    let motivo = "";
    if (complianceLevel === "DISPENSADO") motivo = policyMotivo ? `Dispensado: ${policyMotivo}` : "Dispensado por policy";
    else if (complianceLevel === "OK_OPCIONAL") motivo = "NF opcional";
    else if (complianceLevel === "PENDENTE") motivo = "Dentro da janela (pendente)";
    else if (complianceLevel === "CRITICO") {
      if (hardErrors) motivo = "Erro estrutural (rateio/salário mês)";
      else motivo = "Fora da janela (crítico)";
    }

    const risco = (complianceLevel === "PENDENTE" || complianceLevel === "CRITICO") && policyRule === "OBRIGATORIA" ? salarioMes : 0;

    const row: AuditRow = {
      nome,
      comp,
      status,
      nf,
      link,
      salarioMes,
      flags,
      empresas,
      primaryEmpresa,
      policyRule,
      policyMotivo,
      complianceLevel,
      motivo,
      risco,
    };

    out.push(row);
    byName[normName(nome)] = row;
  }

  return { rows: out, byName };
}

function parseFinance(
  company: string,
  values: any[][],
  policy: Record<string, PolicyEntry>,
  auditByName: Record<string, AuditRow>,
  inWindow: boolean
): FinanceRow[] {
  if (!values || values.length < 2) return [];

  const header = values[0].map((x) => String(x || "").trim());
  const idx = (h: string) => header.findIndex((c) => c === h);
  const iNome = idx("Nome");
  const iComp = idx("Competência");
  const iVal = idx("Valor Esperado");
  const iNF = idx("NF(planilha)");
  const iLink = idx("Link(planilha)");

  const out: FinanceRow[] = [];

  for (const r of values.slice(1)) {
    const nome = iNome >= 0 ? String(r[iNome] || "").trim() : "";
    if (!nome) continue;

    const comp = iComp >= 0 ? String(r[iComp] || "").trim() : "";
    const valorEsperado = iVal >= 0 ? toNum(r[iVal]) : 0;
    const nf = iNF >= 0 ? String(r[iNF] || "").trim() : "";
    const link = iLink >= 0 ? String(r[iLink] || "").trim() : "";

    const p = policy[normName(nome)];
    const policyRule = p?.rule || (company === "T.Youth" ? ("OPCIONAL" as PolicyRule) : ("OBRIGATORIA" as PolicyRule));
    const policyMotivo = p?.motivo || "";

    const audit = auditByName[normName(nome)];
    const complianceLevel = audit ? audit.complianceLevel : "NAO_ENCONTRADO";

    const missingNF = !nf;
    const missingLink = !link;

    const payLevel = payLevelFromFinanceRow({
      company,
      missingNF,
      missingLink,
      inWindow,
      rule: policyRule,
      complianceLevel,
    });

    let motivo = "";
    const missing = missingNF || missingLink;

    if (company === "T.Youth") {
      if (!missing) motivo = "";
      else {
        // Youth: pagamento segue sempre; compliance pode ser opcional ou pendente por GC
        if (policyRule === "DISPENSADA") motivo = policyMotivo ? `Dispensado: ${policyMotivo}` : "Dispensado por policy";
        else if (policyRule === "OPCIONAL") motivo = "NF opcional (T.Youth)";
        else motivo = "NF pendente (GC) — pagamento segue (T.Youth)";
      }
    } else {
      if (policyRule === "DISPENSADA") motivo = policyMotivo ? `Dispensado: ${policyMotivo}` : "Dispensado por policy";
      else if (!missing) motivo = "";
      else motivo = `${missingNF ? "sem NF" : ""}${missingNF && missingLink ? ", " : ""}${missingLink ? "sem link" : ""}`.trim();
    }

    out.push({
      empresa: company,
      comp,
      nome,
      valorEsperado,
      nf,
      link,
      payLevel,
      motivo,
      policyRule,
      policyMotivo,
      complianceLevel,
    });
  }

  return out;
}

function sumBy<T>(arr: T[], fn: (x: T) => number) {
  return arr.reduce((acc, x) => acc + fn(x), 0);
}

export async function GET(req: Request) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const role = (session.role || "viewer") as Role;

  const url = new URL(req.url);
  const comp = String(url.searchParams.get("comp") || "FEV-26").trim().toUpperCase();
  if (!comp) return NextResponse.json({ ok: false, error: "missing comp" }, { status: 400 });

  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) return NextResponse.json({ ok: false, error: "missing SPREADSHEET_ID env" }, { status: 500 });

  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // 1) status de janela
  const closing = await fetchClosingStatus(comp);

  // 2) lista de abas existentes (evita batchGet quebrar)
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title))",
  });
  const titles = (meta.data.sheets || []).map((s) => s.properties?.title).filter(Boolean) as string[];

  const wantAudit = auditSheetName(comp);
  const wantPolicy = policySheetName(comp);
  const wantClt = cltSheetName(comp);

  const allCompanies = ["T.Youth", "T.Brands", "T.Dreams", "T.Venues", "T.Group"];
  const allowedCompanies = allCompanies.filter((c) => canSeeCompany(role, c));

  const finSheets = allowedCompanies
    .map((c) => ({ c, sh: finSheetName(c, comp) }))
    .filter((x) => titles.includes(x.sh));

  const ranges: string[] = [];
  if (titles.includes(wantAudit)) ranges.push(`${wantAudit}!A:K`);
  if (titles.includes(wantPolicy)) ranges.push(`${wantPolicy}!A:Z`);
  if (titles.includes(wantClt)) ranges.push(`${wantClt}!A:Z`);
  for (const f of finSheets) ranges.push(`${f.sh}!A:G`);

  // se ainda não existirem abas (primeiro dia), devolve vazio mas ok
  if (!ranges.length) {
    return NextResponse.json({
      ok: true,
      comp,
      closing: closing.status,
      inWindow: closing.inWindow,
      daysLeft: closing.daysLeft,
      allowedCompanies,
      policy: { sheet: wantPolicy, count: 0 },
      audit: { rows: [], counts: {}, risk: { pendente: 0, critico: 0 } },
      finance: { rows: [], counts: {}, totals: {} },
      clt: { sheet: wantClt, rows: 0, totalLiquido: 0 },
    });
  }

  const batch = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
    majorDimension: "ROWS",
  });

  const mapRange: Record<string, any[][]> = {};
  for (const vr of batch.data.valueRanges || []) {
    const r = vr.range || "";
    const base = r.split("!")[0]; // sheet title
    mapRange[base] = (vr.values || []) as any[][];
  }

  // 3) policy
  const policyValues = mapRange[wantPolicy] || [];
  const policy = parsePolicy(policyValues);

  // 4) auditoria (compliance)
  const auditValues = mapRange[wantAudit] || [];
  const auditParsed = parseAudit(auditValues, policy, closing.inWindow);

  // filtra auditoria por RBAC (impacto em empresas permitidas)
  const auditRowsRBAC = auditParsed.rows.filter((r) => {
    if (role === "gc") return true; // GC vê tudo
    // finance: só entra se a linha impacta alguma empresa permitida
    return r.empresas.some((e) => allowedCompanies.includes(e));
  });

  // 5) finance (pagamento)
  let financeRows: FinanceRow[] = [];
  for (const f of finSheets) {
    const vals = mapRange[f.sh] || [];
    financeRows = financeRows.concat(parseFinance(f.c, vals, policy, auditParsed.byName, closing.inWindow));
  }

  // ====== métricas auditoria
  const auditCounts = {
    total: auditRowsRBAC.length,
    ok: auditRowsRBAC.filter((r) => r.complianceLevel === "OK").length,
    ok_opcional: auditRowsRBAC.filter((r) => r.complianceLevel === "OK_OPCIONAL").length,
    pendente: auditRowsRBAC.filter((r) => r.complianceLevel === "PENDENTE").length,
    critico: auditRowsRBAC.filter((r) => r.complianceLevel === "CRITICO").length,
    dispensado: auditRowsRBAC.filter((r) => r.complianceLevel === "DISPENSADO").length,
  };

  const auditRisk = {
    pendente: sumBy(auditRowsRBAC.filter((r) => r.complianceLevel === "PENDENTE"), (r) => r.risco),
    critico: sumBy(auditRowsRBAC.filter((r) => r.complianceLevel === "CRITICO"), (r) => r.risco),
  };

  // ====== métricas finance
  const financeCounts = {
    total: financeRows.length,
    ok: financeRows.filter((r) => r.payLevel === "OK").length,
    pendente: financeRows.filter((r) => r.payLevel === "PENDENTE").length,
    critico: financeRows.filter((r) => r.payLevel === "CRITICO").length,
    youth_sem_nf: financeRows.filter((r) => r.empresa === "T.Youth" && (!r.nf || !r.link)).length,
  };

  const financeTotals = {
    totalPagar: sumBy(financeRows, (r) => r.valorEsperado),
    totalPagarOk: sumBy(financeRows.filter((r) => r.payLevel === "OK"), (r) => r.valorEsperado),
    totalPagarPendente: sumBy(financeRows.filter((r) => r.payLevel === "PENDENTE"), (r) => r.valorEsperado),
    totalPagarCritico: sumBy(financeRows.filter((r) => r.payLevel === "CRITICO"), (r) => r.valorEsperado),
  };

  // ====== CLT summary (tenta inferir colunas comuns)
  const cltValues = mapRange[wantClt] || [];
  let cltRows = 0;
  let cltTotalLiquido = 0;

  if (cltValues.length >= 2) {
    const h = cltValues[0].map((x) => String(x || "").trim().toLowerCase());
    const iLiquido = h.findIndex((c) => c.includes("líquido") || c.includes("liquido") || c.includes("net"));
    // fallback: se não existir, tenta "total" + "líquido"
    for (const r of cltValues.slice(1)) {
      const anyCell = r.some((x) => String(x || "").trim() !== "");
      if (!anyCell) continue;
      cltRows++;
      if (iLiquido >= 0) cltTotalLiquido += toNum(r[iLiquido]);
    }
  }

  // ordena finance por empresa + nome
  financeRows.sort((a, b) => (a.empresa + a.nome).localeCompare(b.empresa + b.nome, "pt-BR"));

  // ordena auditoria por nível (critico->pend->ok) e nome
  const levelOrder: Record<AuditRow["complianceLevel"], number> = {
    CRITICO: 0,
    PENDENTE: 1,
    OK: 2,
    OK_OPCIONAL: 3,
    DISPENSADO: 4,
  };
  auditRowsRBAC.sort((a, b) => {
    const da = levelOrder[a.complianceLevel] - levelOrder[b.complianceLevel];
    if (da !== 0) return da;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  return NextResponse.json({
    ok: true,
    comp,
    closing: closing.status,
    inWindow: closing.inWindow,
    daysLeft: closing.daysLeft,
    allowedCompanies,
    policy: { sheet: wantPolicy, count: Object.keys(policy).length },
    audit: { rows: auditRowsRBAC, counts: auditCounts, risk: auditRisk },
    finance: { rows: financeRows, counts: financeCounts, totals: financeTotals },
    clt: { sheet: wantClt, rows: cltRows, totalLiquido: cltTotalLiquido },
  });
}
