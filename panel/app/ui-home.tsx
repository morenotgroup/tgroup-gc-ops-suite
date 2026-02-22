"use client";
import { useEffect, useMemo, useState } from "react";
import { Chip, GlassCard, PrimaryButton, GhostButton } from "./components/ui";

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

async function fetchMeta() {
  const resp = await fetch("/api/meta", { cache: "no-store" });
  return await resp.json();
}

function modulesForRole(role: Role) {
  // prioridade: Finance + Auditoria (para GC), Finance + Updates (para Finance)
  if (role === "gc") {
    return {
      primary: [
        { href: "/finance", title: "Finance", desc: "Pagamentos PJ • total + export + pronto pro fluxo" },
        { href: "/auditoria", title: "Auditoria (GC)", desc: "Semáforo + críticos + recomendações automáticas" },
      ],
      secondary: [
        { href: "/gc", title: "GC Console", desc: "Start/Stop • rodar agora • parser on-demand" },
        { href: "/updates", title: "Updates", desc: "Admissões • desligamentos • reajustes (mês a mês)" },
      ],
    };
  }
  if (role === "finance_youth") {
    return {
      primary: [{ href: "/finance", title: "Finance", desc: "T.Youth • pagamentos PJ do mês + export" }],
      secondary: [{ href: "/updates", title: "Updates", desc: "Movimentações do mês (apoio Finance)" }],
    };
  }
  if (role === "finance_core") {
    return {
      primary: [{ href: "/finance", title: "Finance", desc: "T.Brands • T.Dreams • T.Venues • T.Group" }],
      secondary: [{ href: "/updates", title: "Updates", desc: "Movimentações do mês (apoio Finance)" }],
    };
  }
  return { primary: [], secondary: [] };
}

function fadeUpStyle(delayMs: number) {
  return {
    opacity: 0,
    transform: "translateY(10px)",
    animation: `fadeUp .55s ease forwards`,
    animationDelay: `${delayMs}ms`,
  } as any;
}

export default function HomeClient({ role, email }: { role: Role; email: string }) {
  const mods = useMemo(() => modulesForRole(role), [role]);

  const [meta, setMeta] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const m = await fetchMeta();
      setMeta(m);
    })();
  }, []);

  const kpis = useMemo(() => {
    if (!meta?.ok) {
      return [
        { label: "Sheets", value: "offline", tone: "warn" },
        { label: "Updates", value: "—", tone: "muted" },
        { label: "FIN", value: "—", tone: "muted" },
        { label: "AUD", value: "—", tone: "muted" },
      ];
    }
    return [
      { label: "Sheets", value: "online", tone: "ok" },
      { label: "Updates", value: String((meta.updates || []).length), tone: "muted" },
      { label: "FIN sheets", value: String((meta.fins || []).length), tone: "muted" },
      { label: "AUD comps", value: String((meta.auditorias || []).length), tone: "muted" },
    ];
  }, [meta]);

  const statusChip = (tone: string, text: string) => {
    if (tone === "ok") return <Chip text={`🟢 ${text}`} />;
    if (tone === "warn") return <Chip text={`🟠 ${text}`} />;
    return <Chip text={text} />;
  };

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px" }}>
      <style>{`
        @keyframes fadeUp { to { opacity: 1; transform: translateY(0); } }
        .hoverLift { transition: transform .15s ease, filter .15s ease; }
        .hoverLift:hover { transform: translateY(-3px); filter: brightness(1.03); }
        .linkReset { text-decoration: none; color: inherit; }
        .pillRow { display: flex; gap: 10px; flex-wrap: wrap; }
        .kpiGrid { display: grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap: 12px; }
        @media (max-width: 900px) {
          .kpiGrid { grid-template-columns: repeat(2, minmax(160px, 1fr)); }
        }
      `}</style>

      <div style={{ ...fadeUpStyle(0) }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.06 }}>
              GC + Finance Panel
            </div>
            <div style={{ marginTop: 10, opacity: 0.85, fontSize: 14 }}>
              Logado como <b>{email || "—"}</b> • role <b>{role}</b>
            </div>

            <div className="pillRow" style={{ marginTop: 12 }}>
              {statusChip("muted", "2026")}
              {statusChip("muted", "Liquid Glass")}
              {statusChip("muted", "RBAC")}
              {meta?.ok ? statusChip("ok", "Sheets online") : statusChip("warn", "Sheets offline")}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <GhostButton onClick={() => (window.location.href = "/updates")}>Ver Updates</GhostButton>
            <PrimaryButton onClick={() => (window.location.href = "/finance")}>Abrir Finance</PrimaryButton>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, ...fadeUpStyle(80) }}>
        <div className="kpiGrid">
          {kpis.map((k, idx) => (
            <GlassCard key={idx}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{k.label}</div>
              <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800 }}>
                {k.value}
              </div>
              <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
                {k.label === "Sheets" ? "Conectividade da base" : "Visão do ecossistema"}
              </div>
            </GlassCard>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 14, ...fadeUpStyle(160) }}>
        <div className="hoverLift">
          <GlassCard>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Rotas principais</div>
              <div style={{ opacity: 0.7, fontSize: 12 }}>pensado pro fluxo do Finance</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              {mods.primary.map((m) => (
                <a key={m.href} href={m.href} className="linkReset">
                  <div
                    className="hoverLift"
                    style={{
                      borderRadius: 20,
                      padding: 14,
                      background:
                        m.href === "/finance"
                          ? "linear-gradient(135deg, rgba(240,180,40,.22), rgba(10,15,30,.25))"
                          : "linear-gradient(135deg, rgba(120,160,255,.18), rgba(10,15,30,.25))",
                      border: "1px solid rgba(255,255,255,.14)",
                      minHeight: 120,
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{m.title}</div>
                    <div style={{ marginTop: 8, opacity: 0.82, fontSize: 13, lineHeight: 1.3 }}>{m.desc}</div>
                    <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>Abrir →</div>
                  </div>
                </a>
              ))}
            </div>
          </GlassCard>
        </div>

        <div className="hoverLift">
          <GlassCard>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Apoio</div>
            <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
              Rotas de operação GC e movimentações.
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {mods.secondary.map((m) => (
                <a key={m.href} href={m.href} className="linkReset">
                  <div
                    className="hoverLift"
                    style={{
                      borderRadius: 18,
                      padding: 12,
                      background: "rgba(0,0,0,.16)",
                      border: "1px solid rgba(255,255,255,.12)",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{m.title}</div>
                    <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>{m.desc}</div>
                  </div>
                </a>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>

      <div style={{ marginTop: 16, textAlign: "center", ...fadeUpStyle(240) }}>
        <a href="/api/auth/signout" style={{ opacity: 0.85 }}>
          Sair
        </a>
        <div style={{ marginTop: 10, opacity: 0.65, fontSize: 12 }}>
          Gente e Cultura T.Group — 2026 — Todos os direitos reservados.
        </div>
      </div>
    </main>
  );
}
