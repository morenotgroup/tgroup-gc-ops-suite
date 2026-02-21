"use client";
import { useEffect, useMemo, useState } from "react";
import { GlassCard, Input, GhostButton, PrimaryButton, Chip } from "../components/ui";
import { toCSV, downloadText } from "../../lib/csv";

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

async function fetchMeta() {
  const resp = await fetch("/api/meta");
  return await resp.json();
}

async function fetchSheet(sheetName: string) {
  const resp = await fetch(
    `/api/sheets?sheetName=${encodeURIComponent(sheetName)}&range=${encodeURIComponent("A:K")}`
  );
  return await resp.json();
}

export default function AuditoriaClient({ role }: { role: Role }) {
  // role reservado pra evoluir (ex: finance só vê semáforo)
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [comp, setComp] = useState("FEV-26");
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

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
    try {
      const sheetName = `AUDITORIA_${comp}`;
      const data = await fetchSheet(sheetName);
      if (!data.ok) {
        setRows([]);
        return;
      }
      const values: any[][] = data.values || [];
      if (values.length < 2) {
        setRows([]);
        return;
      }
      const header = values[0].map((v) => (v || "").toString());
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
  }, [comp]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(qq));
  }, [rows, q]);

  const counts = useMemo(() => {
    let ok = 0,
      warn = 0,
      crit = 0;
    const critFlags = ["SEM_LINK", "SEM_NF", "SEM_RATEIO", "SEM_SALARIO_MES"];
    for (const r of filtered) {
      const flags = (r["Flags"] || "").toString();
      if (!flags) {
        ok++;
        continue;
      }
      const parts = flags
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      const hasCrit = parts.some((p: string) => critFlags.includes(p));
      if (hasCrit) crit++;
      else warn++;
    }
    return { ok, warn, crit, total: filtered.length };
  }, [filtered]);

  const criticalList = useMemo(() => {
    const critFlags = ["SEM_LINK", "SEM_NF", "SEM_RATEIO", "SEM_SALARIO_MES"];
    return filtered
      .filter((r) => {
        const flags = (r["Flags"] || "")
          .toString()
          .split(",")
          .map((s: string) => s.trim());
        return flags.some((f: string) => critFlags.includes(f));
      })
      .slice(0, 30);
  }, [filtered]);

  function exportCSV() {
    const headers = ["Nome", "Competência", "Status", "NF(planilha)", "Link(planilha)", "Salário Mês", "Flags"];
    const csv = toCSV(
      filtered.map((r) => ({
        Nome: r["Nome"],
        "Competência": r["Competência"],
        Status: r["Status"],
        "NF(planilha)": r["NF(planilha)"],
        "Link(planilha)": r["Link(planilha)"],
        "Salário Mês": r["Salário Mês"],
        Flags: r["Flags"],
      })),
      headers
    );
    downloadText(`AUDITORIA_${comp}.csv`, csv);
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <GlassCard>
        <h2 style={{ marginTop: 0 }}>Auditoria (GC)</h2>
        <p style={{ opacity: 0.85, marginTop: 6 }}>
          Semáforo de fechamento e pendências críticas. Use isso para destravar o Finance.
        </p>

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

          <div style={{ flex: 1, minWidth: 220 }}>
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
          <Chip text={`Total: ${counts.total}`} />
          <Chip text={`OK: ${counts.ok}`} />
          <Chip text={`Avisos: ${counts.warn}`} />
          <Chip text={`Crítico: ${counts.crit}`} />
        </div>

        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "8px 0", fontSize: 14, opacity: 0.9 }}>Pendências críticas (top 30)</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Nome", "NF(planilha)", "Link(planilha)", "Flags"].map((h) => (
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
                  ))}
                </tr>
              </thead>
              <tbody>
                {criticalList.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                    <td style={{ padding: "10px 8px" }}>{r["Nome"]}</td>
                    <td style={{ padding: "10px 8px" }}>{r["NF(planilha)"]}</td>
                    <td style={{ padding: "10px 8px" }}>
                      {r["Link(planilha)"] ? (
                        <a href={r["Link(planilha)"]} target="_blank">
                          abrir
                        </a>
                      ) : (
                        ""
                      )}
                    </td>
                    <td style={{ padding: "10px 8px" }}>{r["Flags"]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
          Recomendação: só liberar o Finance quando “Crítico” estiver zerado (ou justificado).
        </p>
      </GlassCard>
    </main>
  );
}
