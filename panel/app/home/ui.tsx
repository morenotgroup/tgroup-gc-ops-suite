// panel/app/home/ui.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GlassCard, GhostButton, PrimaryButton, Chip } from "../components/ui";

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

type OpsData = {
  ok: boolean;
  comp: string;
  inWindow: boolean;
  daysLeft: number | null;
  closing: any;
  allowedCompanies: string[];
  policy: { sheet: string; count: number };
  audit: { rows: any[]; counts: any; risk: { pendente: number; critico: number } };
  finance: { rows: any[]; counts: any; totals: any };
  clt: { sheet: string; rows: number; totalLiquido: number };
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

function Kpi({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone?: "ok" | "warn" | "crit" | "neutral" }) {
  const border =
    tone === "ok" ? "rgba(0,255,180,.25)" :
    tone === "warn" ? "rgba(255,200,80,.28)" :
    tone === "crit" ? "rgba(255,80,80,.28)" :
    "rgba(255,255,255,.18)";

  const bg =
    tone === "ok" ? "linear-gradient(180deg, rgba(0,255,180,.12), rgba(255,255,255,.06))" :
    tone === "warn" ? "linear-gradient(180deg, rgba(255,200,80,.12), rgba(255,255,255,.06))" :
    tone === "crit" ? "linear-gradient(180deg, rgba(255,80,80,.12), rgba(255,255,255,.06))" :
    "linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.06))";

  return (
    <div style={{
      borderRadius: 18,
      border: `1px solid ${border}`,
      background: bg,
      padding: 16,
      minHeight: 96,
      boxShadow: "0 14px 40px rgba(0,0,0,.28)",
      backdropFilter: "blur(14px) saturate(140%)",
    }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.6, marginTop: 8 }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, opacity: 0.72, marginTop: 6 }}>{sub}</div> : null}
    </div>
  );
}

export default function HomeClient({ role, email }: { role: Role; email: string }) {
  const [comp, setComp] = useState("FEV-26");
  const [comps, setComps] = useState<string[]>(["FEV-26"]);
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(false);

  // carrega competências disponíveis
  useEffect(() => {
    (async () => {
      const meta = await fetchMeta();
      const auditorias: string[] = meta?.auditorias || [];
      const fins: string[] = meta?.fins || [];
      const finComps = Array.from(new Set(fins.map((t) => t.split("_").slice(-1)[0]))).sort();
      const all = Array.from(new Set([...auditorias, ...finComps])).sort();
      if (all.length) setComps(all);

      // tenta usar a última como default
      const last = all[all.length - 1] || "FEV-26";
      setComp(last);
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

  const headline = useMemo(() => {
    const inWindow = data?.inWindow;
    const end = data?.closing?.endDate ? `até ${data.closing.endDate}` : "";
    if (inWindow) return `Janela aberta ${end}`;
    if (data?.closing?.competencia === comp && data?.closing?.endDate) return `Janela encerrada (${data.closing.endDate})`;
    return "Modo leitura";
  }, [data, comp]);

  const chips = useMemo(() => {
    const c: string[] = [];
    c.push(`role: ${role}`);
    if (data?.allowedCompanies?.length) c.push(`empresas: ${data.allowedCompanies.length}`);
    if (data?.policy?.count !== undefined) c.push(`policies: ${data.policy.count}`);
    if (data?.inWindow) c.push(`janela: ON`);
    else c.push(`janela: OFF`);
    return c;
  }, [data, role]);

  const finTotals = data?.finance?.totals || { totalPagar: 0, totalPagarOk: 0, totalPagarPendente: 0, totalPagarCritico: 0 };
  const finCounts = data?.finance?.counts || { total: 0, ok: 0, pendente: 0, critico: 0, youth_sem_nf: 0 };
  const audCounts = data?.audit?.counts || { total: 0, ok: 0, ok_opcional: 0, pendente: 0, critico: 0, dispensado: 0 };
  const audRisk = data?.audit?.risk || { pendente: 0, critico: 0 };

  return (
    <main style={{ maxWidth: 1320, margin: "0 auto", padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 42, letterSpacing: -1.2 }}>GC + Finance Panel</h1>
          <div style={{ marginTop: 8, opacity: 0.8 }}>
            Logado como <b>{email}</b> • <span style={{ opacity: 0.85 }}>{headline}</span>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {chips.map((t) => <Chip key={t} text={t} />)}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Competência</div>
            <select
              value={comp}
              onChange={(e) => setComp(e.target.value)}
              style={{
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(10,15,30,.35)",
                color: "rgba(255,255,255,.92)",
                minWidth: 180,
              }}
            >
              {comps.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <GhostButton disabled={loading} onClick={load}>Atualizar</GhostButton>
          <PrimaryButton as-any="true">
            <Link href="/finance" style={{ color: "#121212", textDecoration: "none" }}>Abrir Finance</Link>
          </PrimaryButton>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <GlassCard>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: 14 }}>
            <Kpi title="Total PJ a pagar (visão Finance)" value={money(finTotals.totalPagar || 0)} sub="Soma das FIN_* das empresas permitidas" tone="neutral" />
            <Kpi title="Pendências (Finance)" value={`${finCounts.pendente || 0}`} sub={money(finTotals.totalPagarPendente || 0)} tone="warn" />
            <Kpi title="Críticos (Finance)" value={`${finCounts.critico || 0}`} sub={money(finTotals.totalPagarCritico || 0)} tone="crit" />
            <Kpi title="T.Youth sem NF (opcional)" value={`${finCounts.youth_sem_nf || 0}`} sub="Não trava pagamento Youth" tone="ok" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 14 }}>
            <Kpi title="Compliance (Auditoria) — OK" value={`${audCounts.ok || 0}`} sub={`Opcionais OK: ${audCounts.ok_opcional || 0} • Dispensados: ${audCounts.dispensado || 0}`} tone="ok" />
            <Kpi title="Compliance — Pendências" value={`${audCounts.pendente || 0}`} sub={`Risco: ${money(audRisk.pendente || 0)}`} tone="warn" />
            <Kpi title="Compliance — Críticos" value={`${audCounts.critico || 0}`} sub={`Risco: ${money(audRisk.critico || 0)}`} tone="crit" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 14 }}>
            <Kpi title="CLT — total líquido (manual)" value={money(data?.clt?.totalLiquido || 0)} sub={`${data?.clt?.rows || 0} linhas • ${data?.clt?.sheet || ""}`} tone="neutral" />
            <Kpi title="Total Geral estimado" value={money((finTotals.totalPagar || 0) + (data?.clt?.totalLiquido || 0))} sub="PJ + CLT" tone="neutral" />
            <Kpi title="Policy ativa" value={`${data?.policy?.count || 0}`} sub={data?.policy?.sheet || ""} tone="neutral" />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
            <Link href="/gc" style={{ textDecoration: "none" }}><GhostButton>GC Console</GhostButton></Link>
            <Link href="/auditoria" style={{ textDecoration: "none" }}><GhostButton>Auditoria (GC)</GhostButton></Link>
            <Link href="/updates" style={{ textDecoration: "none" }}><GhostButton>Updates</GhostButton></Link>
            <a href="/api/auth/signout" style={{ textDecoration: "none" }}><GhostButton>Sair</GhostButton></a>
          </div>
        </GlassCard>
      </div>

      <div style={{ marginTop: 14, textAlign: "center", opacity: 0.65, fontSize: 12 }}>
        Gente e Cultura T.Group — 2026 — Todos os direitos reservados.
      </div>
    </main>
  );
}
