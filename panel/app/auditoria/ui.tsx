"use client";
import { useEffect, useMemo, useState } from "react";
import { GlassCard, Input, GhostButton, PrimaryButton, Chip } from "../components/ui";
import { toCSV, downloadText } from "../../lib/csv";

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

function normalize(s: string) {
  return (s || "").toUpperCase().replace(/\s+/g, " ").replace(/[.]/g, "").trim();
}
function matchCompany(sheetEmpresa: string, selected: string) {
  if (!selected || selected === "TODAS") return true;
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

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function splitFlags(s: string) {
  const raw = (s || "").toUpperCase().trim();
  if (!raw) return [];
  return raw.split(/[,;|/]+/g).map((x) => x.trim()).filter(Boolean);
}

function classify(flags: string[], link: string, nf: string) {
  const hasLink = !!safeStr(link);
  const hasNF = !!safeStr(nf);

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

async function fetchMeta() {
  const resp = await fetch("/api/meta", { cache: "no-store" });
  return await resp.json();
}
async function fetchSheet(sheetName: string) {
  const resp = await fetch(`/api/sheets?sheetName=${encodeURIComponent(sheetName)}&range=${encodeURIComponent("A:Z")}`, { cache: "no-store" });
  return await resp.json();
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  }
}

function Badge({ kind }: { kind: "ok" | "warn" | "crit" }) {
  const base: any = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,.14)",
    fontSize: 12,
    background: "rgba(0,0,0,.18)",
    whiteSpace: "nowrap",
  };
  const styles: Record<string, any> = {
    ok: { ...base, background: "rgba(20,180,120,.18)" },
    warn: { ...base, background: "rgba(240,180,40,.18)" },
    crit: { ...base, background: "rgba(240,80,80,.18)" },
  };
  const dot = kind === "ok" ? "🟢" : kind === "warn" ? "🟡" : "🔴";
  const label = kind === "ok" ? "OK" : kind === "warn" ? "AVISO" : "CRÍTICO";
  return <span style={styles[kind]}>{dot} {label}</span>;
}

export default function AuditoriaClient({ role }: { role: Role }) {
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [comp, setComp] = useState("FEV-26");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const [companyFilter, setCompanyFilter] = useState("TODAS");
  const [onlyCrit, setOnlyCrit] = useState(false);
  const [onlyWarn, setOnlyWarn] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // deep link params
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const c = p.get("comp");
    const co = p.get("company");
    const lvl = p.get("level");

    if (c) setComp(c);
    if (co) setCompanyFilter(co);
    if (lvl === "crit") setOnlyCrit(true);
    if (lvl === "warn") setOnlyWarn(true);
  }, []);

  useEffect(() => {
    (async () => {
      const meta = await fetchMeta();
      if (meta.ok) {
        const comps: string[] = meta.auditorias || [];
        setCompetencias(comps);
        if (!new URLSearchParams(window.location.search).get("comp")) {
          if (comps.includes("FEV-26")) setComp("FEV-26");
          else if (comps.length) setComp(comps[comps.length - 1]);
        }
      }
    })();
  }, []);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const sheetName = `AUDITORIA_${comp}`;
      const data = await fetchSheet(sheetName);
      if (!data.ok) {
        setRows([]);
        setLoadError(data.error || "Falha ao ler AUDITORIA (api/sheets).");
        return;
      }
      const values: any[][] = data.values || [];
      if (values.length < 2) { setRows([]); return; }

      const header = values[0].map((v) => (v || "").toString().trim());
      const objs = values.slice(1).map((r) => {
        const o: any = {};
        header.forEach((h, i) => (o[h] = r[i]));
        return o;
      });
      setRows(objs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (comp) load(); /* eslint-disable-next-line */ }, [comp]);

  const schema = useMemo(() => {
    const sample = rows[0] || {};
    const pick = (opts: string[], fb: string) => opts.find((k) => Object.prototype.hasOwnProperty.call(sample, k)) || fb;
    return {
      nome: pick(["Nome", "COLABORADOR", "Colaborador"], "Nome"),
      empresa: pick(["Empresa", "EMPRESA"], "Empresa"),
      nf: pick(["NF(planilha)", "NF (planilha)", "NF", "NFS-e"], "NF(planilha)"),
      link: pick(["Link(planilha)", "Link (planilha)", "Link"], "Link(planilha)"),
      flags: pick(["Flags", "FLAGS"], "Flags"),
    };
  }, [rows]);

  const enriched = useMemo(() => {
    return rows.map((r) => {
      const flagsArr = splitFlags(safeStr(r[schema.flags]));
      const level = classify(flagsArr, safeStr(r[schema.link]), safeStr(r[schema.nf]));
      const reasons: string[] = [];
      if (!safeStr(r[schema.nf])) reasons.push("sem NF");
      if (!safeStr(r[schema.link])) reasons.push("sem link");
      if (flagsArr.length) reasons.push(flagsArr.join(", "));
      return { ...r, __flagsArr: flagsArr, __level: level, __reasons: reasons };
    });
  }, [rows, schema]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = enriched;

    list = list.filter((r: any) => matchCompany(safeStr(r[schema.empresa]), companyFilter));

    if (onlyCrit) list = list.filter((r: any) => r.__level === "crit");
    else if (onlyWarn) list = list.filter((r: any) => r.__level === "warn");

    if (!qq) return list;
    return list.filter((r: any) => JSON.stringify(r).toLowerCase().includes(qq));
  }, [enriched, q, onlyCrit, onlyWarn, companyFilter, schema]);

  const metrics = useMemo(() => {
    const total = filtered.length;
    const ok = filtered.filter((r: any) => r.__level === "ok").length;
    const warn = filtered.filter((r: any) => r.__level === "warn").length;
    const crit = filtered.filter((r: any) => r.__level === "crit").length;

    const map = new Map<string, number>();
    for (const r of filtered) {
      const arr: string[] = r.__flagsArr || [];
      for (const f of arr) map.set(f, (map.get(f) || 0) + 1);
      if (!safeStr(r[schema.link])) map.set("SEM_LINK", (map.get("SEM_LINK") || 0) + 1);
      if (!safeStr(r[schema.nf])) map.set("SEM_NF", (map.get("SEM_NF") || 0) + 1);
    }
    const breakdown = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const semaforo = crit > 0 ? "🔴" : warn > 0 ? "🟡" : "🟢";
    return { total, ok, warn, crit, breakdown, semaforo };
  }, [filtered, schema]);

  async function copyCobranca() {
    const crit = filtered.filter((r: any) => r.__level === "crit");
    if (!crit.length) {
      setToast("Sem críticos no filtro ✅");
      setTimeout(() => setToast(null), 2200);
      return;
    }
    const lines = crit.map((r: any) => {
      const nome = safeStr(r[schema.nome]);
      const emp = safeStr(r[schema.empresa]);
      const reason = (r.__reasons || []).join(" • ");
      return `• ${nome} (${emp}) — ${reason}`;
    });
    const text =
      `🚨 Pendências CRÍTICAS PJ — ${companyFilter} — ${comp}\n` +
      `Total críticos: ${crit.length}\n\n` +
      lines.slice(0, 60).join("\n") +
      `\n\n(gerado via Auditoria GC)`;
    await copyToClipboard(text);
    setToast("Cobrança copiada ✅");
    setTimeout(() => setToast(null), 2200);
  }

  function exportFull() {
    if (!filtered.length) return;
    const headers = Array.from(new Set(filtered.reduce<string[]>((acc, r: any) => acc.concat(Object.keys(r || {})), [])))
      .filter((h) => !h.startsWith("__"));
    const csv = toCSV(filtered, headers);
    downloadText(`AUDITORIA_${comp}_${companyFilter}_FULL.csv`, csv);
  }

  function exportCrit() {
    const crit = filtered.filter((r: any) => r.__level === "crit");
    if (!crit.length) return;
    const headers = Array.from(new Set(crit.reduce<string[]>((acc, r: any) => acc.concat(Object.keys(r || {})), [])))
      .filter((h) => !h.startsWith("__"));
    const csv = toCSV(crit, headers);
    downloadText(`AUDITORIA_${comp}_${companyFilter}_CRITICOS.csv`, csv);
  }

  const rowStyle = (lvl: string) => {
    if (lvl === "crit") return { background: "rgba(240,80,80,.10)" };
    if (lvl === "warn") return { background: "rgba(240,180,40,.10)" };
    return {};
  };

  if (role !== "gc") {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px" }}>
        <GlassCard>
          <h2 style={{ marginTop: 0 }}>Auditoria (GC)</h2>
          <p style={{ opacity: 0.85 }}>Seu acesso não permite visualizar Auditoria.</p>
          <a href="/" style={{ opacity: 0.9 }}>Voltar</a>
        </GlassCard>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px" }}>
      <style>{`
        .kpiGrid { display: grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap: 12px; }
        @media (max-width: 1100px) { .kpiGrid { grid-template-columns: repeat(2, minmax(160px, 1fr)); } }
        .btnRow { display: flex; gap: 10px; flex-wrap: wrap; align-items: end; }
        .tableWrap { margin-top: 14px; overflow-x: auto; }
      `}</style>

      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Auditoria (GC)</h2>
            <p style={{ opacity: 0.85, marginTop: 6 }}>
              Agora com filtro por empresa + deep link direto do Finance.
            </p>
          </div>
          <Chip text={`${metrics.semaforo} Críticos: ${metrics.crit}`} />
        </div>

        {loadError ? <p style={{ marginTop: 10, color: "rgba(255,180,180,.95)" }}>⚠️ {loadError}</p> : null}
        {toast ? <p style={{ marginTop: 10, color: "rgba(180,255,210,.95)" }}>✅ {toast}</p> : null}

        <div className="btnRow" style={{ marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Competência</div>
            <select value={comp} onChange={(e) => setComp(e.target.value)} style={{
              padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(255,255,255,.18)",
              background: "rgba(10,15,30,.35)", color: "rgba(255,255,255,.92)"
            }}>
              {competencias.length ? competencias.map((c) => <option key={c} value={c}>{c}</option>) : <option value={comp}>{comp}</option>}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Empresa</div>
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={{
              padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(255,255,255,.18)",
              background: "rgba(10,15,30,.35)", color: "rgba(255,255,255,.92)"
            }}>
              {["TODAS", "T.Youth", "T.Brands", "T.Dreams", "T.Venues", "T.Group"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Busca</div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, flags…" />
          </div>

          <GhostButton disabled={loading} onClick={load}>Atualizar</GhostButton>

          <GhostButton onClick={() => { setOnlyWarn(false); setOnlyCrit((v) => !v); }}>
            {onlyCrit ? "Mostrando críticos" : "Somente críticos"}
          </GhostButton>

          <GhostButton onClick={() => { setOnlyCrit(false); setOnlyWarn((v) => !v); }}>
            {onlyWarn ? "Mostrando avisos" : "Somente avisos"}
          </GhostButton>

          <PrimaryButton onClick={copyCobranca}>Copiar cobrança</PrimaryButton>
        </div>

        <div className="kpiGrid" style={{ marginTop: 14 }}>
          <GlassCard><div style={{ fontSize: 12, opacity: .75 }}>Total</div><div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>{metrics.total}</div></GlassCard>
          <GlassCard><div style={{ fontSize: 12, opacity: .75 }}>OK</div><div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>{metrics.ok}</div></GlassCard>
          <GlassCard><div style={{ fontSize: 12, opacity: .75 }}>Avisos</div><div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>{metrics.warn}</div></GlassCard>
          <GlassCard><div style={{ fontSize: 12, opacity: .75 }}>Críticos</div><div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>{metrics.crit}</div></GlassCard>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <GhostButton disabled={!filtered.length} onClick={exportFull}>Export CSV (full)</GhostButton>
          <GhostButton disabled={!filtered.length} onClick={exportCrit}>Export CSV (só críticos)</GhostButton>
          <Chip text="Breakdown top flags" />
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Breakdown (top 10)</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {metrics.breakdown.length ? metrics.breakdown.map(([k, v]) => <Chip key={k} text={`${k}: ${v}`} />) : <span style={{ opacity: 0.7 }}>—</span>}
          </div>
        </div>

        <div className="tableWrap">
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Críticos (top 30)</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["Nome", "Empresa", "NF", "Link", "Flags", "Nível"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.9 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.filter((r: any) => r.__level === "crit").slice(0, 30).map((r: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.08)", ...rowStyle(r.__level) }}>
                  <td style={{ padding: "10px 8px" }}>{safeStr(r[schema.nome])}</td>
                  <td style={{ padding: "10px 8px" }}>{safeStr(r[schema.empresa])}</td>
                  <td style={{ padding: "10px 8px" }}>{safeStr(r[schema.nf]) || <span style={{ opacity: 0.65 }}>—</span>}</td>
                  <td style={{ padding: "10px 8px" }}>
                    {safeStr(r[schema.link]) ? <a href={safeStr(r[schema.link])} target="_blank">abrir</a> : <span style={{ opacity: 0.65 }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 8px" }}>{safeStr(r[schema.flags])}</td>
                  <td style={{ padding: "10px 8px" }}><Badge kind="crit" /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
            Agora a Auditoria pode ser aberta direto do Finance já filtrada por empresa e críticos.
          </p>
        </div>
      </GlassCard>
    </main>
  );
}
