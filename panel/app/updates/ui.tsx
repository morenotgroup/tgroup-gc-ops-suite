"use client";
import { useEffect, useMemo, useState } from "react";
import { GlassCard, Input, GhostButton, PrimaryButton, Chip } from "../components/ui";
import { toCSV, downloadText } from "../../lib/csv";

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

function companiesForRole(role: Role) {
  if (role === "gc") return ["TODAS", "T.Youth", "T.Brands", "T.Dreams", "T.Venues", "T.Group"];
  if (role === "finance_youth") return ["T.Youth"];
  if (role === "finance_core") return ["TODAS", "T.Brands", "T.Dreams", "T.Venues", "T.Group"];
  return [];
}

/**
 * Normaliza o texto de empresa vindo do Sheet (porque pode estar "TOY FORMATURAS",
 * "T.BRANDS - T.DREAMS", "MIRANTE", etc.)
 */
function normalize(s: string) {
  return (s || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[.]/g, "")
    .trim();
}

/**
 * Mapeamento esperto de empresa:
 * - Você pode ajustar/expandir facilmente se aparecerem novos nomes “antigos”.
 */
function matchCompany(sheetEmpresa: string, selected: string) {
  if (selected === "TODAS") return true;

  const e = normalize(sheetEmpresa);
  const sel = normalize(selected);

  // quebra multi-empresa "A - B - C"
  const parts = e.split(" - ").map(p => p.trim());

  // helpers
  const has = (needle: string) => parts.some(p => p.includes(needle)) || e.includes(needle);

  if (sel === "TYOUTH") {
    // Toy Formaturas / Neo / Toy Med etc
    return has("TYOUTH") || has("TOY") || has("FORMATURAS") || has("NEO") || has("MED");
  }

  if (sel === "TBRANDS") {
    return has("TBRANDS") || has("TAJ BRANDS") || has("BRANDS") || has("CONSULTORIA");
  }

  if (sel === "TDREAMS") {
    // Dreams + Mirante (se no seu financeiro entra como Dreams)
    return has("TDREAMS") || has("DREAMS") || has("MIRANTE") || has("PEOPLE");
  }

  if (sel === "TVENUES") {
    return has("TVENUES") || has("VENUES");
  }

  if (sel === "TGROUP") {
    return has("TGROUP") || has("HOLDING") || has("THOLDING") || has("GRUPO T");
  }

  // fallback (se no futuro vier exatamente “T.YOUTH” etc)
  return has(sel);
}

const MONTH = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12
} as const;

function parseMonthKey(title: string) {
  // Ex: "Update Colaboradores Jan-26" ou "Updates Colaboradores Nov-25"
  const m = title.match(/(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)-(\d{2})/i);
  if (!m) return null;
  const mm = (m[1] || "").toUpperCase() as keyof typeof MONTH;
  const yy = Number(m[2]);
  const year = 2000 + yy;
  const month = MONTH[mm] || 0;
  return year * 100 + month; // chave ordenável
}

async function fetchMeta() {
  const resp = await fetch("/api/meta");
  return await resp.json();
}

async function fetchSheet(sheetName: string) {
  const resp = await fetch(`/api/sheets?sheetName=${encodeURIComponent(sheetName)}&range=${encodeURIComponent("A:Z")}`);
  return await resp.json();
}

export default function UpdatesClient({ role }: { role: Role }) {
  const companies = useMemo(() => companiesForRole(role), [role]);
  const [company, setCompany] = useState(companies[0] || "TODAS");

  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState<string>("");

  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState("TODAS");

  useEffect(() => {
    (async () => {
      const meta = await fetchMeta();
      if (!meta.ok) return;

      const ups: string[] = meta.updates || [];
      setSheets(ups);

      // escolhe a aba mais recente pelo padrão MES-ANO no título
      const sorted = [...ups].sort((a, b) => {
        const ka = parseMonthKey(a) ?? 0;
        const kb = parseMonthKey(b) ?? 0;
        return ka - kb;
      });

      const last = sorted[sorted.length - 1] || "";
      setSheet(last);
    })();
  }, []);

  async function load() {
    if (!sheet) return;
    setLoading(true);
    try {
      const data = await fetchSheet(sheet);
      if (!data.ok) {
        setRows([]);
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
    load();
  }, [sheet]);

  const actions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r["AÇÃO"]) set.add(String(r["AÇÃO"]).trim());
    });
    return ["TODAS", ...Array.from(set).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      const emp = String(r["EMPRESA"] || "");
      const acao = String(r["AÇÃO"] || "").trim();

      if (!matchCompany(emp, company)) return false;
      if (actionFilter !== "TODAS" && acao !== actionFilter) return false;

      if (!qq) return true;
      return JSON.stringify(r).toLowerCase().includes(qq);
    });
  }, [rows, q, company, actionFilter]);

  const metrics = useMemo(() => {
    const count = filtered.length;
    const deslig = filtered.filter((r) => String(r["AÇÃO"] || "").toUpperCase().includes("DESLIG")).length;
    const contr = filtered.filter((r) => String(r["AÇÃO"] || "").toUpperCase().includes("CONTRAT")).length;
    const reaj = filtered.filter((r) => String(r["AÇÃO"] || "").toUpperCase().includes("REAJ")).length;
    return { count, deslig, contr, reaj };
  }, [filtered]);

  function exportCSV() {
    // Usa o padrão da sua planilha (Jan-26)
    const headers = [
      "CONTRATO",
      "COLABORADOR",
      "EMPRESA",
      "ÁREA",
      "AÇÃO",
      "DATA CONTRATAÇÃO",
      "SALÁRIO ATUAL",
      "DAS - R$ 50",
      "SALÁRIO PROP",
      "SALÁRIO REAJUSTADO",
      "SOMA SALÁRIO TOTAL + DAS (SEM DAS TOY FORMA)",
      "VALOR TOTAL DA RESCISÃO (SALÁRIO + SALDO FÉRIAS)",
      "MÊS DE REF",
      "OBSERVAÇÕES:",
    ];

    const csv = toCSV(
      filtered.map((r) => {
        const o: any = {};
        headers.forEach((h) => (o[h] = r[h] ?? ""));
        return o;
      }),
      headers
    );

    downloadText(`UPDATES_${sheet.replace(/\s+/g, "_")}.csv`, csv);
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <GlassCard>
        <h2 style={{ marginTop: 0 }}>Updates (GC + Finance)</h2>
        <p style={{ opacity: 0.85, marginTop: 6 }}>
          Admissões, desligamentos, reajustes e movimentações — com filtros e export.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Mês (aba)</div>
            <select
              value={sheet}
              onChange={(e) => setSheet(e.target.value)}
              style={{
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(10,15,30,.35)",
                color: "rgba(255,255,255,.92)",
                minWidth: 260,
              }}
            >
              {sheets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Empresa</div>
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              style={{
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(10,15,30,.35)",
                color: "rgba(255,255,255,.92)",
              }}
            >
              {companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Ação</div>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              style={{
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(10,15,30,.35)",
                color: "rgba(255,255,255,.92)",
              }}
            >
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Busca</div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Colaborador, observações, área..." />
          </div>

          <GhostButton disabled={loading} onClick={load}>
            Atualizar
          </GhostButton>
          <PrimaryButton disabled={!filtered.length} onClick={exportCSV}>
            Exportar CSV
          </PrimaryButton>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          <Chip text={`Linhas: ${metrics.count}`} />
          <Chip text={`Contratações: ${metrics.contr}`} />
          <Chip text={`Reajustes: ${metrics.reaj}`} />
          <Chip text={`Desligamentos: ${metrics.deslig}`} />
        </div>

        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["COLABORADOR", "EMPRESA", "AÇÃO", "SALÁRIO ATUAL", "SALÁRIO REAJUSTADO", "VALOR TOTAL DA RESCISÃO (SALÁRIO + SALDO FÉRIAS)", "OBSERVAÇÕES:"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "10px 8px",
                        borderBottom: "1px solid rgba(255,255,255,.12)",
                        opacity: 0.85,
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                  <td style={{ padding: "10px 8px" }}>{r["COLABORADOR"]}</td>
                  <td style={{ padding: "10px 8px" }}>{r["EMPRESA"]}</td>
                  <td style={{ padding: "10px 8px" }}>{r["AÇÃO"]}</td>
                  <td style={{ padding: "10px 8px" }}>{r["SALÁRIO ATUAL"]}</td>
                  <td style={{ padding: "10px 8px" }}>{r["SALÁRIO REAJUSTADO"]}</td>
                  <td style={{ padding: "10px 8px" }}>{r["VALOR TOTAL DA RESCISÃO (SALÁRIO + SALDO FÉRIAS)"]}</td>
                  <td
                    style={{
                      padding: "10px 8px",
                      maxWidth: 520,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={r["OBSERVAÇÕES:"] ? String(r["OBSERVAÇÕES:"]) : ""}
                  >
                    {r["OBSERVAÇÕES:"]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </main>
  );
}
