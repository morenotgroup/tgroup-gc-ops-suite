import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

function allowedCompanies(role: Role) {
  if (role === "gc") return ["T.Youth", "T.Brands", "T.Dreams", "T.Venues", "T.Group"];
  if (role === "finance_youth") return ["T.Youth"];
  if (role === "finance_core") return ["T.Brands", "T.Dreams", "T.Venues", "T.Group"];
  return [];
}

function normalize(s: string) {
  return (s || "").toUpperCase().replace(/\s+/g, " ").replace(/[.]/g, "").trim();
}

function matchCompany(sheetEmpresa: string, selected: string) {
  if (!selected) return true;
  const sel = normalize(selected);
  const e = normalize(sheetEmpresa);
  const parts = e.split(" - ").map((p) => p.trim());

  const has = (needle: string) => parts.some((p) => p.includes(needle)) || e.includes(needle);

  if (sel === "TYOUTH") return has("TYOUTH") || has("TOY") || has("FORMATURAS") || has("NEO") || has("MED");
  if (sel === "TBRANDS") return has("TBRANDS") || has("TAJ BRANDS") || has("BRANDS") || has("CONSULTORIA");
  if (sel === "TDREAMS") return has("TDREAMS") || has("DREAMS") || has("MIRANTE") || has("PEOPLE");
  if (sel === "TVENUES") return has("TVENUES") || has("VENUES");
  if (sel === "TGROUP") return has("TGROUP") || has("HOLDING") || has("THOLDING") || has("GRUPO T");

  return has(sel);
}

function splitFlags(s: string) {
  const raw = (s || "").toUpperCase().trim();
  if (!raw) return [];
  return raw
    .split(/[,;|/]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function classify(flags: string[], link: string, nf: string) {
  const hasLink = !!String(link || "").trim();
  const hasNF = !!String(nf || "").trim();

  const criticalTokens = [
    "SEM_LINK",
    "SEM LINK",
    "SEM_NF",
    "SEM NF",
    "CNPJ_INVALIDO",
    "CNPJ INVÁLIDO",
    "PDF_ILEGIVEL",
    "PDF ILEGIVEL",
    "DIVERGENCIA_VALOR",
    "DIVERGÊNCIA VALOR",
    "VALOR_DIVERGENTE",
    "SEM_RATEIO",
    "SEM RATEIO",
  ];

  const isCritFlag = flags.some((f) => criticalTokens.some((t) => f.includes(t)));
  const isCritMissing = !hasLink || !hasNF;

  if (isCritFlag || isCritMissing) return "crit";
  if (flags.length) return "warn";
  return "ok";
}

function pickKey(sample: any, candidates: string[], fallback: string) {
  for (const k of candidates) if (sample && Object.prototype.hasOwnProperty.call(sample, k)) return k;
  return fallback;
}

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

function quoteSheetName(name: string) {
  const safe = name.replace(/'/g, "''");
  return `'${safe}'`;
}

export async function GET(req: Request) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const role = (session?.role ?? "viewer") as Role;

  const url = new URL(req.url);
  const comp = (url.searchParams.get("comp") || "FEV-26").trim();
  const company = (url.searchParams.get("company") || "").trim(); // T.Youth etc.

  // RBAC
  const allowed = allowedCompanies(role);
  if (!allowed.length) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (company && !allowed.includes(company) && role !== "gc") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const auth = getServiceAccountAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const spreadsheetId = process.env.SPREADSHEET_ID!;
    const sheetName = `AUDITORIA_${comp}`;
    const a1range = `${quoteSheetName(sheetName)}!A:Z`;

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: a1range,
    });

    const values: any[][] = resp.data.values || [];
    if (values.length < 2) {
      return NextResponse.json({
        ok: true,
        comp,
        company,
        totals: { total: 0, ok: 0, warn: 0, crit: 0 },
        breakdown: [],
        topCrit: [],
        hint: "AUDITORIA vazia",
      });
    }

    const header = values[0].map((v) => (v || "").toString().trim());
    const rows = values.slice(1).map((r) => {
      const o: any = {};
      header.forEach((h, i) => (o[h] = r[i]));
      return o;
    });

    const sample = rows[0] || {};
    const kNome = pickKey(sample, ["Nome", "COLABORADOR", "Colaborador"], "Nome");
    const kEmp = pickKey(sample, ["Empresa", "EMPRESA"], "Empresa");
    const kNF = pickKey(sample, ["NF(planilha)", "NF (planilha)", "NF", "NFS-e"], "NF(planilha)");
    const kLink = pickKey(sample, ["Link(planilha)", "Link (planilha)", "Link"], "Link(planilha)");
    const kFlags = pickKey(sample, ["Flags", "FLAGS"], "Flags");

    // filtra por empresa (se houver)
    const filtered = company
      ? rows.filter((r) => matchCompany(String(r[kEmp] || ""), company))
      : rows;

    let ok = 0, warn = 0, crit = 0;
    const breakdownMap = new Map<string, number>();
    const topCrit: { nome: string; empresa: string; motivo: string }[] = [];

    for (const r of filtered) {
      const nome = String(r[kNome] || "").trim();
      const emp = String(r[kEmp] || "").trim();
      const nf = String(r[kNF] || "").trim();
      const link = String(r[kLink] || "").trim();
      const flagsArr = splitFlags(String(r[kFlags] || ""));
      const level = classify(flagsArr, link, nf);

      if (level === "ok") ok++;
      else if (level === "warn") warn++;
      else crit++;

      // breakdown
      for (const f of flagsArr) breakdownMap.set(f, (breakdownMap.get(f) || 0) + 1);
      if (!link) breakdownMap.set("SEM_LINK", (breakdownMap.get("SEM_LINK") || 0) + 1);
      if (!nf) breakdownMap.set("SEM_NF", (breakdownMap.get("SEM_NF") || 0) + 1);

      if (level === "crit" && topCrit.length < 12) {
        const reasons: string[] = [];
        if (!nf) reasons.push("sem NF");
        if (!link) reasons.push("sem link");
        if (flagsArr.length) reasons.push(flagsArr.join(", "));
        topCrit.push({ nome, empresa: emp, motivo: reasons.join(" • ") });
      }
    }

    const breakdown = Array.from(breakdownMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, v]) => ({ flag: k, count: v }));

    return NextResponse.json({
      ok: true,
      comp,
      company,
      totals: { total: filtered.length, ok, warn, crit },
      semaforo: crit > 0 ? "red" : warn > 0 ? "yellow" : "green",
      breakdown,
      topCrit,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 200 });
  }
}
