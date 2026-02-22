"use client";
import { useEffect, useMemo, useState } from "react";
import { GlassCard, Input, GhostButton, PrimaryButton, Chip } from "../components/ui";
import { toCSV, downloadText } from "../../lib/csv";

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

function isGC(role: Role) {
  return role === "gc";
}

function safeStr(v: any) {
  return String(v ?? "").trim();
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
  const resp = await fetch(
    `/api/sheets?sheetName=${encodeURIComponent(sheetName)}&range=${encodeURIComponent("A:Z")}`,
    { cache: "no-store" }
  );
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

  const [onlyCrit, setOnlyCrit] = useState(false);
  const [onlyWarn, setOnlyWarn] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const meta = await fetchMeta();
      if (meta.ok) {
        const comps: string[] = meta.auditorias || [];
        setCompetencias(comps);
        if (comps.includes("FEV-26")) setComp("FEV-26");
        else if (comps.length) setComp(comps[comps.length - 1]);
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
      if (values.length < 2) {
        setRows([]);
        return;
      }

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

  useEffect(() => {
    if (comp) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp]);

  const schema = useMemo(() => {
    const sample = rows[0] || {};
    const pick = (opts: string[], fb: string) => opts.find((k) => Object.prototype.hasOwnProperty.call(sample, k)) || fb;

    return {
      nome: pick(["Nome", "COLABORADOR", "Colaborador"], "Nome"),
      empresa: pick(["Empresa", "EMPRESA"], "Empresa"),
      nf: pick(["NF(planilha)", "NF (planilha)", "NF", "NFS-e"], "NF(planilha)"),
      link: pick(["Link(planilha)", "Link (planilha)", "Link"], "Link(planilha)"),
      flags: pick(["Flags", "FLAGS"], "Flags"),
      status: pick(["Status", "STATUS"], "Status"),
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

    if (onlyCrit) list = list.filter((r: any) => r.__level === "crit");
    else if (onlyWarn) list = list.filter((r: any) => r.__level === "warn");

    if (!qq) return list;
    return list.filter((r: any) => JSON.stringify(r).toLowerCase().includes(qq));
  }, [enriched, q, onlyCrit, onlyWarn]);

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

  const topCrit = useMemo(() => {
    return enriched
      .filter((r: any) => r.__level === "crit")
      .slice(0, 10)
      .map((r: any) => ({
        nome: safeStr(r[schema.nome]),
        empresa: safeStr(r[schema.empresa]),
        motivo: (r.__reasons || []).join(" • "),
      }));
  }, [enriched, schema]);

  const recomendacoes = useMemo(() => {
    const items: string[] = [];
    const keys = metrics.breakdown.map(([k]) => k);

    const has = (x: string) => keys.some((k) => k.includes(x));

    if (metrics.crit > 0) items.push(`Não liberar Finance enquanto houver críticos: ${metrics.crit}.`);
    if (has("SEM_LINK")) items.push("Cobrar reenvio/link de NF (tem gente sem link).");
    if (has("SEM_NF")) items.push("Cobrar número correto da NFS-e (não é DPS).");
    if (has("SEM_RATEIO") || has("RATEIO")) items.push("Rateios pendentes: revisar base/colunas de empresa e proporções.");
    if (has("DIVERGEN") || has("VALOR")) items.push("Divergência de valor: comparar Valor Esperado vs PDF/nota.");
    if (has("CNPJ")) items.push("CNPJ inválido: validar tomador/prestador vs ficha cadastral.");

    if (!items.length) items.push("Tudo ok: pode liberar Finance para pagamento. ✅");
    return items;
  }, [metrics]);

  function exportCSVFull() {
    if (!filtered.length) return;
    const headers = Array.from(
      new Set(filtered.reduce<string[]>((acc, r: any) => acc.concat(Object.keys(r || {})), []))
    ).filter((h) => !h.startsWith("__"));
    const csv = toCSV(filtered, headers);
    downloadText(`AUDITORIA_${comp}_FULL.csv`, csv);
  }

  function exportCSVCrit() {
    const crit = enriched.filter((r: any) => r.__level === "crit");
    if (!crit.length) return;
    const headers = Array.from(
      new Set(crit.reduce<string[]>((acc, r: any) => acc.concat(Object.keys(r || {})), []))
    ).filter((h) => !h.startsWith("__"));
    const csv = toCSV(crit, headers);
    downloadText(`AUDITORIA_${comp}_CRITICOS.csv`, csv);
  }

  async function copyCobranca() {
    const crit = enriched.filter((r: any) => r.__level === "crit");
    if (!crit.length) {
      setToast("Sem críticos pra cobrar ✅");
      setTimeout(() => setToast(null), 2500);
      return;
    }

    const lines = crit.map((r: any) => {
      const nome = safeStr(r[schema.nome]);
      const empresa = safeStr(r[schema.empresa]);
      const reason = (r.__reasons || []).filter(Boolean).join(" • ");
      return `• ${nome} (${empresa}) — ${reason}`;
    });

    const text =
      `🚨 Pendências CRÍTICAS PJ — ${comp}\n` +
      `Total críticos: ${crit.length}\n\n` +
      lines.slice(0, 40).join("\n") +
      `\n\n(gerado via Auditoria GC)`;

    await copyToClipboard(text);
    setToast("Lista de cobrança (críticos) copiada ✅");
    setTimeout(() => setToast(null), 2500);
  }

  const rowStyle = (level: string) => {
    if (level === "crit") return { background: "rgba(240,80,80,.10)" };
    if (level === "warn") return { background: "rgba(240,180,40,.10)" };
    return {};
  };

  if (!isGC(role)) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px" }}>
        <GlassCard>
          <h2 style={{ marginTop: 0 }}>Auditoria (GC)</h2>
          <p style={{ opacity: 0.85 }}>
            A Auditoria é uma área de controle da GC. Seu acesso atual não permite visualizar esta página.
          </p>
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
        .tableWrap { margin-top: 14px; overflow-x: auto; }
        .btnRow { display: flex; gap: 10px; flex-wrap: wrap; align-items: end; }
      `}</style>

      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Auditoria (GC)</h2>
            <p style={{ opacity: 0.85, marginTop: 6 }}>
              Semáforo de fechamento + críticos + recomendações automáticas pra destravar o Finance.
            </p>
          </div>
          <Chip text={`${metrics.semaforo} Críticos: ${metrics.crit}`} />
        </div>

        {loadError ? (
          <p style={{ marginTop: 10, color: "rgba(255,180,180,.95)" }}>⚠️ {loadError}</p>
        ) : null}

        {toast ? (
          <p style={{ marginTop: 10, color: "rgba(180,255,210,.95)" }}>✅ {toast}</p>
        ) : null}

        <div className="btnRow" style={{ marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Competência</div>
            <select
              value={comp}
              onChange={(e) => setComp(e.target.value)}
              style={{
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(10,15,30,.35)",
                color: "rgba(255,255,255,.92)",
              }}
            >
              {competencias.length ? (
                competencias.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))
              ) : (
                <option value={comp}>{comp}</option>
              )}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Busca</div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, flags, status..." />
          </div>

          <GhostButton disabled={loading} onClick={load}>Atualizar</GhostButton>

          <GhostButton
            onClick={() => {
              setOnlyWarn(false);
              setOnlyCrit((v) => !v);
            }}
          >
            {onlyCrit ? "Mostrando críticos" : "Somente críticos"}
          </GhostButton>

          <GhostButton
            onClick={() => {
              setOnlyCrit(false);
              setOnlyWarn((v) => !v);
            }}
          >
            {onlyWarn ? "Mostrando avisos" : "Somente avisos"}
          </GhostButton>

          <PrimaryButton onClick={copyCobranca}>Copiar cobrança</PrimaryButton>
        </div>

        <div className="kpiGrid" style={{ marginTop: 14 }}>
          <GlassCard>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Total</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>{metrics.total}</div>
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>Registros na auditoria</div>
          </GlassCard>

          <GlassCard>
            <div style={{ fontSize: 12, opacity: 0.75 }}>OK</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>{metrics.ok}</div>
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>Sem flags críticas</div>
          </GlassCard>

          <GlassCard>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Avisos</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>{metrics.warn}</div>
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>Revisar, mas não trava sempre</div>
          </GlassCard>

          <GlassCard>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Críticos</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>{metrics.crit}</div>
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>Trava Finance</div>
          </GlassCard>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <GhostButton disabled={!filtered.length} onClick={exportCSVFull}>Export CSV (full)</GhostButton>
          <GhostButton disabled={!enriched.length} onClick={exportCSVCrit}>Export CSV (só críticos)</GhostButton>
          <Chip text="Breakdown de flags (top 10)" />
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Breakdown (top 10)</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {metrics.breakdown.length ? (
              metrics.breakdown.map(([k, v]) => <Chip key={k} text={`${k}: ${v}`} />)
            ) : (
              <span style={{ opacity: 0.7 }}>—</span>
            )}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Recomendações (automático)</div>
          <ul style={{ marginTop: 0, opacity: 0.85 }}>
            {recomendacoes.map((t, i) => (
              <li key={i} style={{ marginBottom: 6 }}>{t}</li>
            ))}
          </ul>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Top 10 críticos (pra destravar rápido)</div>
          <div style={{ display: "grid", gap: 10 }}>
            {topCrit.length ? (
              topCrit.map((x, i) => (
                <div
                  key={i}
                  style={{
                    borderRadius: 16,
                    padding: 12,
                    border: "1px solid rgba(255,255,255,.12)",
                    background: "rgba(240,80,80,.08)",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{x.nome}</div>
                  <div style={{ opacity: 0.8, fontSize: 13, marginTop: 4 }}>{x.empresa}</div>
                  <div style={{ opacity: 0.75, fontSize: 12, marginTop: 6 }}>{x.motivo}</div>
                </div>
              ))
            ) : (
              <span style={{ opacity: 0.7 }}>—</span>
            )}
          </div>
        </div>

        <div className="tableWrap">
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Pendências críticas (top 30)</div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["Nome", "Empresa", "NF", "Link", "Flags", "Nível"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 8px",
                      borderBottom: "1px solid rgba(255,255,255,.12)",
                      opacity: 0.9,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {enriched
                .filter((r: any) => r.__level === "crit")
                .slice(0, 30)
                .map((r: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.08)", ...rowStyle(r.__level) }}>
                    <td style={{ padding: "10px 8px" }}>{safeStr(r[schema.nome])}</td>
                    <td style={{ padding: "10px 8px" }}>{safeStr(r[schema.empresa])}</td>
                    <td style={{ padding: "10px 8px" }}>{safeStr(r[schema.nf]) || <span style={{ opacity: 0.65 }}>—</span>}</td>
                    <td style={{ padding: "10px 8px" }}>
                      {safeStr(r[schema.link]) ? (
                        <a href={safeStr(r[schema.link])} target="_blank">abrir</a>
                      ) : (
                        <span style={{ opacity: 0.65 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px" }}>{safeStr(r[schema.flags])}</td>
                    <td style={{ padding: "10px 8px" }}><Badge kind="crit" /></td>
                  </tr>
                ))}
            </tbody>
          </table>

          <p style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
            Regra: liberar Finance só quando <b>Críticos</b> estiver zerado (ou justificado).
          </p>
        </div>
      </GlassCard>
    </main>
  );
}
