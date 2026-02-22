"use client";
import { useEffect, useMemo, useState } from "react";
import { GlassCard, Input, GhostButton, PrimaryButton, Chip } from "../components/ui";
import { toCSV, downloadText } from "../../lib/csv";

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

function isGC(role: Role) {
  return role === "gc";
}

function splitFlags(s: string) {
  const raw = (s || "").toUpperCase().trim();
  if (!raw) return [];
  // separa por vírgula, ponto e vírgula, barra, pipe, espaço duplo
  return raw
    .split(/[,;|/]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function classifyRow(flags: string[], link: string, nf: string) {
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

  const isCriticalByFlag = flags.some((f) => criticalTokens.some((t) => f.includes(t)));
  const isCriticalByMissing = !hasLink || !hasNF;

  if (isCriticalByFlag || isCriticalByMissing) return "crit";
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

export default function AuditoriaClient({ role }: { role: Role }) {
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [comp, setComp] = useState("FEV-26");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

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
    const pick = (opts: string[]) => opts.find((k) => Object.prototype.hasOwnProperty.call(sample, k)) || opts[0];

    return {
      nome: pick(["Nome", "COLABORADOR", "Colaborador"]),
      empresa: pick(["Empresa", "EMPRESA"]),
      nf: pick(["NF(planilha)", "NF (planilha)", "NF", "NFS-e"]),
      link: pick(["Link(planilha)", "Link (planilha)", "Link"]),
      flags: pick(["Flags", "FLAGS"]),
      status: pick(["Status", "STATUS"]),
    };
  }, [rows]);

  const processed = useMemo(() => {
    return rows.map((r) => {
      const flagsArr = splitFlags(String(r[schema.flags] || ""));
      const level = classifyRow(flagsArr, String(r[schema.link] || ""), String(r[schema.nf] || ""));
      return { ...r, __flagsArr: flagsArr, __level: level };
    });
  }, [rows, schema]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return processed;
    return processed.filter((r) => JSON.stringify(r).toLowerCase().includes(qq));
  }, [processed, q]);

  const metrics = useMemo(() => {
    const total = filtered.length;
    const ok = filtered.filter((r) => r.__level === "ok").length;
    const warn = filtered.filter((r) => r.__level === "warn").length;
    const crit = filtered.filter((r) => r.__level === "crit").length;

    // breakdown por tipo de flag (top)
    const map = new Map<string, number>();
    for (const r of filtered) {
      const arr: string[] = r.__flagsArr || [];
      for (const f of arr) map.set(f, (map.get(f) || 0) + 1);
    }
    const breakdown = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const semaforo = crit > 0 ? "🔴" : warn > 0 ? "🟡" : "🟢";

    return { total, ok, warn, crit, breakdown, semaforo };
  }, [filtered]);

  const recomendacoes = useMemo(() => {
    const items: string[] = [];
    const by = new Map(metrics.breakdown);

    const has = (k: string) =>
      Array.from(by.keys()).some((x) => x.includes(k));

    if (metrics.crit > 0) items.push(`Não liberar Finance enquanto houver críticos: ${metrics.crit}.`);
    if (has("SEM_LINK") || has("SEM LINK")) items.push("Tem gente sem link de NF: cobrar reenvio/checar Drive e link na planilha.");
    if (has("SEM_NF") || has("SEM NF")) items.push("Tem gente sem número de NF: cobrar o número da NFS-e (não é DPS).");
    if (has("SEM_RATEIO") || has("SEM RATEIO")) items.push("Rateios pendentes: revisar base/colunas de empresa e proporções.");
    if (has("DIVERGEN") || has("VALOR")) items.push("Divergência de valor: comparar Valor Esperado vs PDF/nota.");
    if (has("CNPJ")) items.push("CNPJ inválido: validar tomador/prestador vs ficha cadastral da empresa.");
    if (!items.length) items.push("Tudo ok: pode liberar Finance para pagamento. ✅");

    return items;
  }, [metrics]);

  function exportCSV() {
    if (!filtered.length) return;

    const headers = Array.from(
      new Set(
        filtered.reduce<string[]>((acc, r) => acc.concat(Object.keys(r || {})), [] as string[])
      )
    ).filter((h) => !h.startsWith("__"));

    const csv = toCSV(filtered, headers);
    downloadText(`AUDITORIA_${comp}.csv`, csv);
  }

  if (!isGC(role)) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
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
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Auditoria (GC)</h2>
            <p style={{ opacity: 0.85, marginTop: 6 }}>
              Semáforo de fechamento + pendências críticas. Use isso pra destravar o Finance.
            </p>
          </div>
          <Chip text={`${metrics.semaforo} Crítico: ${metrics.crit}`} />
        </div>

        {loadError ? (
          <p style={{ marginTop: 10, color: "rgba(255,180,180,.95)" }}>⚠️ {loadError}</p>
        ) : null}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 12 }}>
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
                  <option key={c} value={c}>
                    {c}
                  </option>
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

          <GhostButton disabled={loading} onClick={load}>
            Atualizar
          </GhostButton>
          <PrimaryButton disabled={!filtered.length} onClick={exportCSV}>
            Exportar CSV
          </PrimaryButton>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          <Chip text={`Total: ${metrics.total}`} />
          <Chip text={`OK: ${metrics.ok}`} />
          <Chip text={`Avisos: ${metrics.warn}`} />
          <Chip text={`Crítico: ${metrics.crit}`} />
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Breakdown (top 10 flags)</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {metrics.breakdown.length ? (
              metrics.breakdown.map(([k, v]) => <Chip key={k} text={`${k}: ${v}`} />)
            ) : (
              <span style={{ opacity: 0.7 }}>—</span>
            )}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Recomendações (automático)</div>
          <ul style={{ marginTop: 0, opacity: 0.85 }}>
            {recomendacoes.map((t, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Pendências críticas (top 30)</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["Nome", "Empresa", "NF(planilha)", "Link(planilha)", "Flags"].map((h) => (
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
              {filtered
                .filter((r) => r.__level === "crit")
                .slice(0, 30)
                .map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                    <td style={{ padding: "10px 8px" }}>{r[schema.nome] || ""}</td>
                    <td style={{ padding: "10px 8px" }}>{r[schema.empresa] || ""}</td>
                    <td style={{ padding: "10px 8px" }}>{r[schema.nf] || ""}</td>
                    <td style={{ padding: "10px 8px" }}>
                      {String(r[schema.link] || "").trim() ? (
                        <a href={String(r[schema.link])} target="_blank">
                          abrir
                        </a>
                      ) : (
                        <span style={{ opacity: 0.65 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px" }}>{r[schema.flags] || ""}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          <p style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
            Regra: liberar Finance só quando <b>Crítico</b> estiver zerado (ou justificado).
          </p>
        </div>
      </GlassCard>
    </main>
  );
}
