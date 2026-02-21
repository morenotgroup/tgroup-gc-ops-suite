"use client";
import { useEffect, useMemo, useState } from "react";
import { GlassCard, Input, PrimaryButton, GhostButton, Chip } from "../components/ui";
import { toCSV, downloadText } from "../../lib/csv";

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

function companiesForRole(role: Role) {
  if (role === "gc") return ["T.Youth", "T.Brands", "T.Dreams", "T.Venues", "T.Group"];
  if (role === "finance_youth") return ["T.Youth"];
  if (role === "finance_core") return ["T.Brands", "T.Dreams", "T.Venues", "T.Group"];
  return [];
}

function finSheetName(company: string, comp: string) {
  const key = company.replace(".", ""); // T.Youth -> TYouth
  return `FIN_${key}_${comp}`;
}

async function fetchMeta() {
  const resp = await fetch("/api/meta");
  return await resp.json();
}

async function fetchSheet(sheetName: string, company?: string) {
  const qs = new URLSearchParams({
    sheetName,
    range: "A:G",
  });
  if (company) qs.set("company", company);
  const resp = await fetch(`/api/sheets?${qs.toString()}`);
  return await resp.json();
}

export default function FinanceClient({ role }: { role: Role }) {
  const companies = useMemo(() => companiesForRole(role), [role]);
  const [company, setCompany] = useState(companies[0] || "");
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [comp, setComp] = useState("FEV-26");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const meta = await fetchMeta();
      if (meta.ok) {
        const fins: string[] = meta.fins || [];
        const comps = Array.from(new Set(fins.map((t) => t.split("_").slice(-1)[0]))).sort();
        setCompetencias(comps);
        if (comps.includes("FEV-26")) setComp("FEV-26");
        else if (comps.length) setComp(comps[comps.length - 1]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!companies.length) return;
    if (!company) setCompany(companies[0]);
  }, [role]);

  async function load() {
    if (!company) return;
    setLoading(true);
    try {
      const sheetName = finSheetName(company, comp);
      const data = await fetchSheet(sheetName, company);
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
    if (company) load();
  }, [company, comp]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(qq));
  }, [rows, q]);

  const total = useMemo(() => {
    const key = "Valor Esperado";
    return filtered.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
  }, [filtered]);

  function exportCSV() {
    const headers = ["Empresa", "Competência", "Nome", "Valor Esperado", "NF(planilha)", "Link(planilha)", "Status"];
    const csv = toCSV(filtered, headers);
    downloadText(`FIN_${company.replace(".", "")}_${comp}.csv`, csv);
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <GlassCard>
        <h2 style={{ marginTop: 0 }}>Finance • Pagamentos PJ</h2>
        <p style={{ opacity: 0.85, marginTop: 6 }}>
          Visão filtrada por empresa (RBAC). Total a pagar e lista com links das NFs.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 12 }}>
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
              {competencias.length ? competencias.map((c) => <option key={c} value={c}>{c}</option>) : <option value={comp}>{comp}</option>}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Busca</div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, status, NF..." />
          </div>

          <GhostButton disabled={loading} onClick={load}>Atualizar</GhostButton>
          <PrimaryButton disabled={!filtered.length} onClick={exportCSV}>Exportar CSV</PrimaryButton>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          <Chip text={`Linhas: ${filtered.length}`} />
          <Chip text={`Total a pagar: R$ ${total.toFixed(2)}`} />
        </div>

        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["Nome", "Valor Esperado", "NF(planilha)", "Link(planilha)", "Status"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.85 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                  <td style={{ padding: "10px 8px" }}>{r["Nome"] || ""}</td>
                  <td style={{ padding: "10px 8px" }}>{r["Valor Esperado"]}</td>
                  <td style={{ padding: "10px 8px" }}>{r["NF(planilha)"]}</td>
                  <td style={{ padding: "10px 8px" }}>
                    {r["Link(planilha)"] ? <a href={r["Link(planilha)"]} target="_blank">abrir</a> : ""}
                  </td>
                  <td style={{ padding: "10px 8px" }}>{r["Status"]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </main>
  );
}
