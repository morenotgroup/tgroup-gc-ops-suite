// panel/app/auditoria/ui.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { GlassCard, Input, GhostButton, PrimaryButton, Chip } from "../components/ui";
import { toCSV, downloadText } from "../../lib/csv";

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

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
  policyRule: string;
  policyMotivo: string;
  complianceLevel: "OK" | "PENDENTE" | "CRITICO" | "OK_OPCIONAL" | "DISPENSADO";
  motivo: string;
  risco: number;
};

type OpsData = {
  ok: boolean;
  comp: string;
  inWindow: boolean;
  daysLeft: number | null;
  allowedCompanies: string[];
  audit: {
    rows: AuditRow[];
    counts: any;
    risk: { pendente: number; critico: number };
  };
};

function money(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function fetchOps(comp: string) {
  const resp = await fetch(`/api/ops-data?comp=${encodeURIComponent(comp)}`, { cache: "no-store" });
  return await resp.json();
}

async function fetchMeta() {
  const resp = await fetch("/api/meta", { cache: "no-store" });
  return await resp.json();
}

export default function AuditoriaClient({ role }: { role: Role }) {
  const [comps, setComps] = useState<string[]>(["FEV-26"]);
  const [comp, setComp] = useState("FEV-26");
  const [empresa, setEmpresa] = useState("TODAS");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OpsData | null>(null);

  useEffect(() => {
    (async () => {
      const meta = await fetchMeta();
      const auditorias: string[] = meta?.auditorias || [];
      if (auditorias.length) {
        setComps(auditorias);
        setComp(auditorias[auditorias.length - 1]);
      }
    })();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const d = await fetchOps(comp);
      setData(d.ok ? d : null);
      // ajusta empresa default
      if (d?.allowedCompanies?.length && empresa === "TODAS") {
        // ok
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [comp]);

  const rows = (data?.audit?.rows || []) as AuditRow[];
  const allowedCompanies = data?.allowedCompanies || [];

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (empresa !== "TODAS") {
        const hits = (r.empresas || []).includes(empresa) || r.primaryEmpresa === empresa;
        if (!hits) return false;
      }
      if (!qq) return true;
      const blob = JSON.stringify(r).toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, empresa, q]);

  const counts = useMemo(() => {
    const out = { total: filtered.length, ok: 0, pend: 0, crit: 0, opc: 0, disp: 0 };
    for (const r of filtered) {
      if (r.complianceLevel === "OK") out.ok++;
      else if (r.complianceLevel === "PENDENTE") out.pend++;
      else if (r.complianceLevel === "CRITICO") out.crit++;
      else if (r.complianceLevel === "OK_OPCIONAL") out.opc++;
      else if (r.complianceLevel === "DISPENSADO") out.disp++;
    }
    return out;
  }, [filtered]);

  const risco = useMemo(() => {
    const pend = filtered.filter((r) => r.complianceLevel === "PENDENTE").reduce((a, r) => a + (r.risco || 0), 0);
    const crit = filtered.filter((r) => r.complianceLevel === "CRITICO").reduce((a, r) => a + (r.risco || 0), 0);
    return { pend, crit };
  }, [filtered]);

  function exportCSV(full: boolean) {
    const base = filtered.map((r) => ({
      Nome: r.nome,
      Empresa: (r.primaryEmpresa || "") + (r.empresas?.length ? ` (${r.empresas.join(", ")})` : ""),
      Competencia: r.comp,
      Nivel: r.complianceLevel,
      "Valor Esperado (Salário Mês)": r.salarioMes,
      NF: r.nf,
      Link: r.link,
      Policy: r.policyRule,
      Motivo: r.motivo || r.policyMotivo || "",
      Flags: (r.flags || []).join(", "),
    }));

    const csv = toCSV(base, Object.keys(base[0] || {}));
    downloadText(`AUDITORIA_${comp}${full ? "" : "_FILTRADA"}.csv`, csv);
  }

  return (
    <main style={{ maxWidth: 1320, margin: "0 auto", padding: 28 }}>
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 6 }}>Auditoria (GC)</h2>
            <div style={{ opacity: 0.78, fontSize: 13 }}>
              Semáforo + lista completa (sem top 30). Valor esperado vem do <b>Total Salário Mês</b> (BW / “Salário Mês”).
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Chip text={data?.inWindow ? `Janela ON` : `Janela OFF`} />
            <Chip text={`Dias restantes: ${data?.daysLeft ?? "-"}`} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 14 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Competência</div>
            <select value={comp} onChange={(e) => setComp(e.target.value)} style={{
              padding: "12px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,.18)",
              background: "rgba(10,15,30,.35)",
              color: "rgba(255,255,255,.92)",
              minWidth: 160,
            }}>
              {comps.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Empresa</div>
            <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} style={{
              padding: "12px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,.18)",
              background: "rgba(10,15,30,.35)",
              color: "rgba(255,255,255,.92)",
              minWidth: 200,
            }}>
              <option value="TODAS">TODAS</option>
              {allowedCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Busca</div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, flags, policy, motivo..." />
          </div>

          <GhostButton disabled={loading} onClick={load}>Atualizar</GhostButton>
          <PrimaryButton disabled={!filtered.length} onClick={() => exportCSV(false)}>Exportar CSV</PrimaryButton>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <Chip text={`Total: ${counts.total}`} />
          <Chip text={`OK: ${counts.ok}`} />
          <Chip text={`Pendências: ${counts.pend}`} />
          <Chip text={`Críticos: ${counts.crit}`} />
          <Chip text={`Opcionais OK: ${counts.opc}`} />
          <Chip text={`Dispensados: ${counts.disp}`} />
          <Chip text={`R$ risco pendente: ${money(risco.pend)}`} />
          <Chip text={`R$ risco crítico: ${money(risco.crit)}`} />
        </div>

        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["Nível","Colaborador","Empresa","Valor Esperado","NF","Link","Policy","Motivo"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.85 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,.18)",
                      background:
                        r.complianceLevel === "CRITICO" ? "rgba(255,80,80,.16)" :
                        r.complianceLevel === "PENDENTE" ? "rgba(255,200,80,.16)" :
                        r.complianceLevel === "OK_OPCIONAL" ? "rgba(0,255,180,.10)" :
                        r.complianceLevel === "DISPENSADO" ? "rgba(160,160,160,.12)" :
                        "rgba(0,255,180,.14)",
                      opacity: 0.95
                    }}>
                      {r.complianceLevel}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px", fontWeight: 700 }}>{r.nome}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ fontWeight: 700 }}>{r.primaryEmpresa || "-"}</div>
                    {r.empresas?.length ? <div style={{ fontSize: 12, opacity: 0.7 }}>{r.empresas.join(", ")}</div> : null}
                  </td>
                  <td style={{ padding: "10px 8px" }}>{money(r.salarioMes || 0)}</td>
                  <td style={{ padding: "10px 8px" }}>{r.nf || "-"}</td>
                  <td style={{ padding: "10px 8px" }}>
                    {r.link ? <a href={r.link} target="_blank">abrir</a> : "-"}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ fontWeight: 700 }}>{r.policyRule}</div>
                    {r.policyMotivo ? <div style={{ fontSize: 12, opacity: 0.7 }}>{r.policyMotivo}</div> : null}
                  </td>
                  <td style={{ padding: "10px 8px", opacity: 0.9 }}>{r.motivo || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
          Dica: durante a janela, “sem NF/sem link” fica como <b>PENDENTE</b>. Depois do prazo, vira <b>CRÍTICO</b>. T.Youth pode ficar como “NF opcional”.
        </div>
      </GlassCard>
    </main>
  );
}
