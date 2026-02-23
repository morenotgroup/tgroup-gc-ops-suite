// panel/app/finance/ui.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { GlassCard, Input, GhostButton, PrimaryButton, Chip } from "../components/ui";
import { toCSV, downloadText } from "../../lib/csv";

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

type FinanceRow = {
  empresa: string;
  comp: string;
  nome: string;
  valorEsperado: number;
  nf: string;
  link: string;
  payLevel: "OK" | "PENDENTE" | "CRITICO";
  motivo: string;
  policyRule: string;
  policyMotivo: string;
  complianceLevel: string;
};

type OpsData = {
  ok: boolean;
  comp: string;
  inWindow: boolean;
  daysLeft: number | null;
  allowedCompanies: string[];
  finance: {
    rows: FinanceRow[];
    counts: any;
    totals: any;
  };
  audit: {
    counts: any;
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

function companiesForRole(role: Role) {
  if (role === "gc") return ["TODAS", "T.Youth", "T.Brands", "T.Dreams", "T.Venues", "T.Group"];
  if (role === "finance_youth") return ["T.Youth"];
  if (role === "finance_core") return ["TODAS", "T.Brands", "T.Dreams", "T.Venues", "T.Group"];
  return [];
}

export default function FinanceClient({ role }: { role: Role }) {
  const [comps, setComps] = useState<string[]>(["FEV-26"]);
  const [comp, setComp] = useState("FEV-26");
  const [company, setCompany] = useState(companiesForRole(role)[0] || "TODAS");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"ALL" | "PEND" | "CRIT" | "OK">("ALL");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OpsData | null>(null);

  useEffect(() => {
    (async () => {
      const meta = await fetchMeta();
      const fins: string[] = meta?.fins || [];
      const finComps = Array.from(new Set(fins.map((t) => t.split("_").slice(-1)[0]))).sort();
      if (finComps.length) {
        setComps(finComps);
        setComp(finComps[finComps.length - 1]);
      }
    })();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const d = await fetchOps(comp);
      setData(d.ok ? d : null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [comp]);

  const allRows = (data?.finance?.rows || []) as FinanceRow[];

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return allRows.filter((r) => {
      if (company !== "TODAS" && r.empresa !== company) return false;

      if (mode === "PEND" && r.payLevel !== "PENDENTE") return false;
      if (mode === "CRIT" && r.payLevel !== "CRITICO") return false;
      if (mode === "OK" && r.payLevel !== "OK") return false;

      if (!qq) return true;
      return JSON.stringify(r).toLowerCase().includes(qq);
    });
  }, [allRows, company, mode, q]);

  const totals = useMemo(() => {
    const totalPagar = filtered.reduce((a, r) => a + (r.valorEsperado || 0), 0);
    const pend = filtered.filter((r) => r.payLevel === "PENDENTE").length;
    const crit = filtered.filter((r) => r.payLevel === "CRITICO").length;
    const ok = filtered.filter((r) => r.payLevel === "OK").length;

    const youthOptional = filtered.filter((r) => r.empresa === "T.Youth" && (!r.nf || !r.link)).length;
    return { totalPagar, pend, crit, ok, youthOptional };
  }, [filtered]);

  function exportCSV(kind: "full" | "pagamento" | "pendencias") {
    let rows = filtered;

    if (kind === "pagamento") {
      // Pagamento:
      // - T.Youth entra sempre (com ou sem NF), porque pagamento não trava
      // - Core entra só OK (não pendente/crítico)
      rows = filtered.filter((r) => r.empresa === "T.Youth" || r.payLevel === "OK");
    }

    if (kind === "pendencias") {
      // Pendências de pagamento (core)
      rows = filtered.filter((r) => r.empresa !== "T.Youth" && (r.payLevel === "PENDENTE" || r.payLevel === "CRITICO"));
    }

    const base = rows.map((r) => ({
      Empresa: r.empresa,
      Competencia: r.comp,
      Nome: r.nome,
      ValorEsperado: r.valorEsperado,
      NF: r.nf,
      Link: r.link,
      PayLevel: r.payLevel,
      Motivo: r.motivo,
      Policy: r.policyRule,
      Compliance: r.complianceLevel,
    }));

    const csv = toCSV(base, Object.keys(base[0] || {}));
    downloadText(`FIN_${company}_${comp}_${kind}.csv`, csv);
  }

  function copyCobranca() {
    // texto “cobrança” apenas para core (não Youth), e apenas pend/crit
    const pend = filtered.filter((r) => r.empresa !== "T.Youth" && (r.payLevel === "PENDENTE" || r.payLevel === "CRITICO"));
    const lines = pend.slice(0, 200).map((r) => `• ${r.nome} (${r.empresa}) — ${r.motivo || "pendente"} — Valor: ${money(r.valorEsperado || 0)}`);
    const txt =
      `Pendências de NF (competência ${comp})\n\n` +
      (lines.length ? lines.join("\n") : "Sem pendências core ✅");

    navigator.clipboard.writeText(txt);
    alert("Cobrança copiada 👍");
  }

  return (
    <main style={{ maxWidth: 1320, margin: "0 auto", padding: 28 }}>
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 6 }}>Finance • Pagamentos PJ</h2>
            <div style={{ opacity: 0.78, fontSize: 13 }}>
              “T.Youth NF opcional”: pagamento não trava. Core: pendente/crítico respeita janela do fechamento.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Chip text={data?.inWindow ? `Janela ON` : `Janela OFF`} />
            <Chip text={`Dias restantes: ${data?.daysLeft ?? "-"}`} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 14 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Empresa</div>
            <select value={company} onChange={(e) => setCompany(e.target.value)} style={{
              padding: "12px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,.18)",
              background: "rgba(10,15,30,.35)",
              color: "rgba(255,255,255,.92)",
              minWidth: 210,
            }}>
              {companiesForRole(role).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

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

          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Busca</div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, NF, motivo..." />
          </div>

          <GhostButton disabled={loading} onClick={load}>Atualizar</GhostButton>
          <GhostButton onClick={() => setMode("PEND")}>Somente pendências</GhostButton>
          <GhostButton onClick={() => setMode("CRIT")}>Somente críticos</GhostButton>
          <GhostButton onClick={() => setMode("OK")}>Somente OK</GhostButton>
          <GhostButton onClick={() => setMode("ALL")}>Ver tudo</GhostButton>

          <PrimaryButton onClick={copyCobranca}>Copiar cobrança</PrimaryButton>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <Chip text={`Linhas: ${filtered.length}`} />
          <Chip text={`Total a pagar: ${money(totals.totalPagar || 0)}`} />
          <Chip text={`OK: ${totals.ok}`} />
          <Chip text={`Pendências: ${totals.pend}`} />
          <Chip text={`Críticos: ${totals.crit}`} />
          <Chip text={`T.Youth sem NF (ok): ${totals.youthOptional}`} />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <GhostButton disabled={!filtered.length} onClick={() => exportCSV("full")}>Export CSV (full)</GhostButton>
          <GhostButton disabled={!filtered.length} onClick={() => exportCSV("pagamento")}>Export CSV (pagamento)</GhostButton>
          <GhostButton disabled={!filtered.length} onClick={() => exportCSV("pendencias")}>Export CSV (pendências)</GhostButton>
        </div>

        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["Empresa","Colaborador","Valor","NF","Link","Situação","Motivo"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.85 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                  <td style={{ padding: "10px 8px", fontWeight: 800 }}>{r.empresa}</td>
                  <td style={{ padding: "10px 8px", fontWeight: 700 }}>{r.nome}</td>
                  <td style={{ padding: "10px 8px" }}>{money(r.valorEsperado || 0)}</td>
                  <td style={{ padding: "10px 8px" }}>{r.nf || "-"}</td>
                  <td style={{ padding: "10px 8px" }}>{r.link ? <a href={r.link} target="_blank">abrir</a> : "-"}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,.18)",
                      background:
                        r.payLevel === "CRITICO" ? "rgba(255,80,80,.16)" :
                        r.payLevel === "PENDENTE" ? "rgba(255,200,80,.16)" :
                        "rgba(0,255,180,.14)",
                      opacity: 0.95
                    }}>
                      {r.payLevel}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px", opacity: 0.9 }}>
                    {r.motivo || "-"}
                    {r.policyRule === "DISPENSADA" && r.policyMotivo ? (
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        Policy: {r.policyMotivo}
                      </div>
                    ) : null}
                    {r.empresa === "T.Youth" && (!r.nf || !r.link) ? (
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        Obs: Youth não trava pagamento.
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
          Dica: pra visão consolidada, selecione <b>TODAS</b>. Pra cobrança de NF, use a Auditoria (GC) — aqui o foco é pagamento.
        </div>
      </GlassCard>
    </main>
  );
}
