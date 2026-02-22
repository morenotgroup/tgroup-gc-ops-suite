import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";
import { GlassCard, Chip } from "./components/ui";

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

function modulesForRole(role: Role) {
  if (role === "gc") {
    return [
      {
        href: "/gc",
        title: "GC Console",
        subtitle: "Start/Stop + rodar agora + parser on-demand",
        meta: "Fechamento PJ",
      },
      {
        href: "/auditoria",
        title: "Auditoria (GC)",
        subtitle: "Semáforo + pendências críticas + export",
        meta: "Controle de risco",
      },
      {
        href: "/finance",
        title: "Finance",
        subtitle: "Total a pagar + tabela + export (CSV/pagamento)",
        meta: "Visão Finance",
      },
      {
        href: "/updates",
        title: "Updates",
        subtitle: "Admissões, desligamentos e reajustes (mês a mês)",
        meta: "Movimentações",
      },
    ];
  }
  if (role === "finance_youth") {
    return [
      {
        href: "/finance",
        title: "Finance",
        subtitle: "T.Youth — pagamentos PJ do mês",
        meta: "RBAC ativo",
      },
      {
        href: "/updates",
        title: "Updates",
        subtitle: "Movimentações (admissões/desligamentos/reajustes)",
        meta: "Apoio Finance",
      },
    ];
  }
  if (role === "finance_core") {
    return [
      {
        href: "/finance",
        title: "Finance",
        subtitle: "T.Brands / T.Dreams / T.Venues / T.Group",
        meta: "RBAC ativo",
      },
      {
        href: "/updates",
        title: "Updates",
        subtitle: "Movimentações (admissões/desligamentos/reajustes)",
        meta: "Apoio Finance",
      },
    ];
  }
  return [];
}

export default async function Home() {
  const session: any = await getServerSession(authOptions);
  const email = session?.user?.email || "";
  const role: Role = (session?.role ?? "viewer") as Role;

  const mods = modulesForRole(role);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>T.Group • GC + Finance Panel</h1>
            <p style={{ marginTop: 8, opacity: 0.85 }}>
              Logado como: <b>{email || "—"}</b> • role: <b>{role}</b>
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Chip text="2026" />
            <Chip text="Liquid Glass" />
            <Chip text="RBAC" />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
            marginTop: 16,
          }}
        >
          {mods.map((m) => (
            <a
              key={m.href}
              href={m.href}
              style={{
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div
                style={{
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,.16)",
                  background: "rgba(0,0,0,.18)",
                  padding: 14,
                  transition: "transform .15s ease, border-color .15s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{m.title}</div>
                    <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>{m.subtitle}</div>
                  </div>
                  <div style={{ opacity: 0.85, fontSize: 12, whiteSpace: "nowrap" }}>{m.meta}</div>
                </div>

                <div style={{ marginTop: 12, opacity: 0.75, fontSize: 12 }}>
                  Abrir →
                </div>
              </div>
            </a>
          ))}
        </div>

        {!mods.length ? (
          <p style={{ marginTop: 16, opacity: 0.8 }}>
            Você está com role <b>viewer</b>. Peça para a GC liberar seu acesso.
          </p>
        ) : null}

        <div style={{ marginTop: 18, opacity: 0.7, fontSize: 12, textAlign: "center" }}>
          Gente e Cultura T.Group — 2026 — Todos os direitos reservados.
        </div>

        <div style={{ marginTop: 10, textAlign: "center" }}>
          <a href="/api/auth/signout" style={{ opacity: 0.85 }}>
            Sair
          </a>
        </div>
      </GlassCard>
    </main>
  );
}
