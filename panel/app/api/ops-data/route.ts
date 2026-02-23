// panel/app/api/ops-data/route.ts
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import type { Role } from "../../../lib/rbac";
import { canSeeCompany } from "../../../lib/rbac";

type PolicyRule = "OBRIGATORIA" | "OPCIONAL" | "DISPENSADA";

type ClosingStatus = {
  active: boolean;
  competencia: string;
  endDate: string; // YYYY-MM-DD
  triggers?: { handler: string; type: string }[];
};

type AuditRow = {
  nome: string;
  comp: string;
  status: string;
  nf: string;
  link: string;
  salarioMes: number;
  flags: string[];
  empresas: string[];
  primaryEmpresa: string;
  policyRule: PolicyRule;
  policyMotivo: string;
  complianceLevel: "OK" | "PENDENTE" | "CRITICO" | "OK_OPCIONAL" | "DISPENSADO";
  motivo: string;
  risco: number;
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
  complianceLevel: string;
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
    .replace(/[\u0300-\u036f]/g, "");
}

function normHdr(s: string) {
  return (s || "")
    .toString()
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
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

function idx(header: any[], candidates: string[]) {
  const H = header.map((h) => normHdr(String(h ?? "")));
  for (const c of candidates) {
    const i = H.indexOf(normHdr(c));
    if (i >= 0) return i;
  }
  return -1;
}

function companyKey(company: string) {
  return company.replace(".", "");
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

function detectHardErrors(flags: string[]) {
  const up = flags.map((f) => normHdr(f));
  return up.some((f) => f.includes("SEM_RATEIO") || f.includes("SEM SALARIO") || f.includes("SEM_SALARIO"));
}

function defaultRuleFromEmpresas(empresas: string[]) {
  // Youth puro => opcional
  if (empresas.length === 1 && empresas[0] === "T.Youth") return "OPCIONAL" as PolicyRule;
  return "OBRIGATORIA" as PolicyRule;
}

function levelFromAudit(params: {
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

function payLevelFromFinance(params: {
  company: string;
  missingNF: boolean;
  missingLink: boolean;
  inWindow: boolean;
  rule: PolicyRule;
}) {
  const missing = params.missingNF || params.missingLink;

  // Youth nunca trava pagamento
  if (params.company === "T.Youth") return "OK" as const;

  if (params.rule === "DISPENSADA") return "OK" as const;
  if (!missing) return "OK" as const;
  return params.inWindow ? ("PENDENTE" as const) : ("CRITICO" as const);
}

async function fetchClosingStatus(comp: string): Promise<{ status: ClosingStatus | null; inWindow: boolean; daysLeft: number | null }> {
  const url = process.env.APPS_SCRIPT_WEBAPP_URL;
  const key = process.env.BOT_API_KEY;
  if (!url || !key) return { status: null, inWindow: false, daysLeft: null };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, action: "status" }),
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

  if (!st || !st.active || st.competencia !== comp || !st.endDate) return { status: st, inWindow: false, daysLeft: null };

  const today = new Date();
  const end = new Date(st.endDate + "T23:59:59");
  const inWindow = today <= end;
  const daysLeft = inWindow ? Math.max(0, Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))) : 0;

  return { status: st, inWindow, daysLeft };
}

function parsePolicy(values: any[][]): Record<string, { rule: PolicyRule; motivo: string }> {
  if (!values || values.length < 2) return {};
  const header = values[0];

  const iColab = idx(header, ["COLABORADOR", "NOME"]);
  const iRegra = idx(header, ["REGRA"]);
  const iMotivo = idx(header, ["MOTIVO"]);

  const out: Record<string, { rule: PolicyRule; motivo: string }> = {};
  for (const r of values.slice(1)) {
    const nome = iColab >= 0 ? String(r[iColab] || "").trim() : "";
    if (!nome) continue;

    const regraRaw = iRegra >= 0 ? String(r[iRegra] || "").trim().toUpperCase() : "";
    const motivo = iMotivo >= 0 ? String(r[iMotivo] || "").trim() : "";

    let rule: PolicyRule = "OBRIGATORIA";
    if (regraRaw.includes("DISP")) rule = "DISPENSADA";
    else if (regraRaw.includes("OPC")) rule = "OPCIONAL";
    else if (regraRaw.includes("OBR")) rule = "OBRIGATORIA";

    out[normName(nome)] = { rule, motivo };
  }
  return out;
}

function parseAudit(values: any[][], policy: Record<string, { rule: PolicyRule; motivo: string }>, inWindow: boolean) {
  if (!values || values.length < 2) return { rows: [] as AuditRow[], byName: {} as Record<string, AuditRow>, debugHeader: [] as string[] };

  const header = values[0];
  const Hnorm = header.map((h) => normHdr(String(h ?? "")));

  // candidatos tolerantes
  const iNome = idx(header, ["NOME", "Nome", "COLABORADOR", "COLABORADOR(A)"]);
  const iComp = idx(header, ["COMPETÊNCIA", "COMPETENCIA", "COMP"]);
  const iStatus = idx(header, ["STATUS", "SITUAÇÃO", "SITUACAO"]);
  const iNF = idx(header, ["NF(PLANILHA)", "NF (PLANILHA)", "NF", "NFS-E", "NFS-e", "NUMERO DA NFS-E", "NÚMERO DA NFS-E"]);
  const iLink = idx(header, ["LINK(PLANILHA)", "LINK (PLANILHA)", "LINK", "URL", "LINK NF", "LINK DA NF"]);
  const iSalMes = idx(header, ["SALÁRIO MÊS", "SALARIO MES", "TOTAL SALARIO MES", "TOTAL SALÁRIO MÊS", "BW"]);
  const iFlags = idx(header, ["FLAGS", "FLAG"]);
  const iEsperado = idx(header, ["ESPERADO(JSON)", "ESPERADO (JSON)", "ESPERADO", "RATEIO JSON"]);

  const rows: AuditRow[] = [];
  const byName: Record<string, AuditRow> = {};

  for (const r of values.slice(1)) {
    const nome = iNome >= 0 ? String(r[iNome] || "").trim() : "";
    if (!nome) continue;

    const nf = iNF >= 0 ? String(r[iNF] || "").trim() : "";
    const link = iLink >= 0 ? String(r[iLink] || "").trim() : "";
    const salarioMes = iSalMes >= 0 ? toNum(r[iSalMes]) : 0;

    const flagsRaw = iFlags >= 0 ? String(r[iFlags] || "").trim() : "";
    const flags = flagsRaw ? flagsRaw.split(",").map((x) => x.trim()).filter(Boolean) : [];

    const esperadoJson = iEsperado >= 0 ? safeJsonParse(r[iEsperado]) : {};
    const empresas = Object.keys(esperadoJson || {}).filter(Boolean);
    const primaryEmpresa = pickPrimaryCompany(esperadoJson);

    const pol = policy[normName(nome)];
    const policyRule = pol?.rule || defaultRuleFromEmpresas(empresas);
    const policyMotivo = pol?.motivo || "";

    const hardErrors = detectHardErrors(flags);
    const missingNF = !nf;
    const missingLink = !link;

    const complianceLevel = levelFromAudit({
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
    else if (complianceLevel === "CRITICO") motivo = hardErrors ? "Erro estrutural (rateio/salário)" : "Fora da janela (crítico)";

    const risco = (complianceLevel === "PENDENTE" || complianceLevel === "CRITICO") && policyRule === "OBRIGATORIA" ? salarioMes : 0;

    const comp = iComp >= 0 ? String(r[iComp] || "").trim() : "";
    const status = iStatus >= 0 ? String(r[iStatus] || "").trim() : "";

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

    rows.push(row);
    byName[normName(nome)] = row;
  }

  return { rows, byName, debugHeader: Hnorm };
}

function parseFinance(
  company: string,
  values: any[][],
  policy: Record<string, { rule: PolicyRule; motivo: string }>,
  auditByName: Record<string, AuditRow>,
  inWindow: boolean
) {
  if (!values || values.length < 2) return { rows: [] as FinanceRow[], debugHeader: [] as string[] };

  const header = values[0];
  const Hnorm = header.map((h) => normHdr(String(h ?? "")));

  const iNome = idx(header, ["NOME", "Nome", "COLABORADOR"]);
  const iComp = idx(header, ["COMPETÊNCIA", "COMPETENCIA", "COMP"]);
  const iVal = idx(header, ["VALOR ESPERADO", "Valor Esperado", "VALOR", "SALARIO MES", "SALÁRIO MÊS", "TOTAL"]);
  const iNF = idx(header, ["NF(PLANILHA)", "NF (PLANILHA)", "NF", "NFS-E"]);
  const iLink = idx(header, ["LINK(PLANILHA)", "LINK (PLANILHA)", "LINK", "URL"]);

  const out: FinanceRow[] = [];

  for (const r of values.slice(1)) {
    const nome = iNome >= 0 ? String(r[iNome] || "").trim() : "";
    if (!nome) continue;

    const comp = iComp >= 0 ? String(r[iComp] || "").trim() : "";
    const valorEsperado = iVal >= 0 ? toNum(r[iVal]) : 0;
    const nf = iNF >= 0 ? String(r[iNF] || "").trim() : "";
    const link = iLink >= 0 ? String(r[iLink] || "").trim() : "";

    const pol = policy[normName(nome)];
    const policyRule = pol?.rule || (company === "T.Youth" ? ("OPCIONAL" as PolicyRule) : ("OBRIGATORIA" as PolicyRule));
    const policyMotivo = pol?.motivo || "";

    const missingNF = !nf;
    const missingLink = !link;

    const payLevel = payLevelFromFinance({
      company,
      missingNF,
      missingLink,
      inWindow,
      rule: policyRule,
    });

    let motivo = "";
    const missing = missingNF || missingLink;

    if (company === "T.Youth") {
      if (!missing) motivo = "";
      else {
        if (policyRule === "DISPENSADA") motivo = policyMotivo ? `Dispensado: ${policyMotivo}` : "Dispensado por policy";
        else if (policyRule === "OPCIONAL") motivo = "NF opcional (T.Youth)";
        else motivo = "NF pendente (GC) — pagamento segue (T.Youth)";
      }
    } else {
      if (policyRule === "DISPENSADA") motivo = policyMotivo ? `Dispensado: ${policyMotivo}` : "Dispensado por policy";
      else if (!missing) motivo = "";
      else motivo = `${missingNF ? "sem NF" : ""}${missingNF && missingLink ? ", " : ""}${missingLink ? "sem link" : ""}`.trim();
    }

    const audit = auditByName[normName(nome)];
    const complianceLevel = audit ? audit.complianceLevel : "NAO_ENCONTRADO";

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

  return { rows: out, debugHeader: Hnorm };
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

  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) return NextResponse.json({ ok: false, error: "missing SPREADSHEET_ID env" }, { status: 500 });

  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const closing = await fetchClosingStatus(comp);

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
  if (titles.includes(wantAudit)) ranges.push(`${wantAudit}!A:Z`);
  if (titles.includes(wantPolicy)) ranges.push(`${wantPolicy}!A:Z`);
  if (titles.includes(wantClt)) ranges.push(`${wantClt}!A:Z`);
  for (const f of finSheets) ranges.push(`${f.sh}!A:Z`);

  if (!ranges.length) {
    return NextResponse.json({
      ok: true,
      comp,
      closing: closing.status,
      inWindow: closing.inWindow,
      daysLeft: closing.daysLeft,
      allowedCompanies,
      policy: { sheet: wantPolicy, count: 0 },
      audit: { rows: [], counts: { total: 0 }, risk: { pendente: 0, critico: 0 } },
      finance: { rows: [], counts: { total: 0 }, totals: { totalPagar: 0 } },
      clt: { sheet: wantClt, rows: 0, totalLiquido: 0 },
      debug: { titlesFound: titles.length, wantAudit, finSheets: finSheets.map((x) => x.sh) },
    });
  }

  const batch = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
    majorDimension: "ROWS",
  });

  const mapRange: Record<string, any[][]> = {};
  for (const vr of batch.data.valueRanges || []) {
    const base = (vr.range || "").split("!")[0];
    mapRange[base] = (vr.values || []) as any[][];
  }

  // policy
  const policyValues = mapRange[wantPolicy] || [];
  const policy = parsePolicy(policyValues);

  // audit
  const auditValues = mapRange[wantAudit] || [];
  const auditParsed = parseAudit(auditValues, policy, closing.inWindow);

  // finance
  let financeRows: FinanceRow[] = [];
  const finHeaders: Record<string, string[]> = {};

  for (const f of finSheets) {
    const vals = mapRange[f.sh] || [];
    const parsed = parseFinance(f.c, vals, policy, auditParsed.byName, closing.inWindow);
    financeRows = financeRows.concat(parsed.rows);
    finHeaders[f.sh] = parsed.debugHeader;
  }

  const auditRowsRBAC = auditParsed.rows.filter((r) => {
    if (role === "gc") return true;
    return r.empresas.some((e) => allowedCompanies.includes(e));
  });

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

  // CLT
  const cltValues = mapRange[wantClt] || [];
  let cltRows = 0;
  let cltTotalLiquido = 0;

  if (cltValues.length >= 2) {
    const h = cltValues[0].map((x) => normHdr(String(x || "")));
    const iLiquido =
      h.findIndex((c) => c.includes("LIQUIDO") || c.includes("LÍQUIDO") || c.includes("NET")) ?? -1;

    for (const r of cltValues.slice(1)) {
      const anyCell = r.some((x) => String(x || "").trim() !== "");
      if (!anyCell) continue;
      cltRows++;
      if (iLiquido >= 0) cltTotalLiquido += toNum(r[iLiquido]);
    }
  }

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
    debug: {
      wantAudit,
      gotAudit: titles.includes(wantAudit),
      auditHeader: auditParsed.debugHeader,
      finSheets: finSheets.map((x) => x.sh),
      finHeaders,
      titlesFound: titles.length,
    },
  });
}
