import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";
import { GlassCard } from "./components/ui";

export default async function Home() {
  const session: any = await getServerSession(authOptions);
  const role = session?.role ?? "viewer";

  if (!session?.user?.email) {
    return (
      <main style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
        <GlassCard>
          <h1 style={{ marginTop: 0 }}>T.Group • GC + Finance Panel</h1>
          <p>Faça login com sua conta do Workspace para acessar.</p>
          <a href="/api/auth/signin">Entrar</a>
        </GlassCard>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <GlassCard>
        <h1 style={{ marginTop: 0 }}>T.Group • GC + Finance Panel</h1>
        <p style={{ marginTop: 6, opacity: 0.85 }}>
          Logado como: <b>{session.user.email}</b> • role: <b>{role}</b>
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          <Link href="/gc">GC Console (Start/Stop)</Link>
          <Link href="/auditoria">Auditorias</Link>
          <Link href="/finance">Finance</Link>
          <Link href="/desligamentos">Desligamentos (PJ)</Link>
        </div>

        <div style={{ marginTop: 18, opacity: 0.8 }}>
          <a href="/api/auth/signout">Sair</a>
        </div>
      </GlassCard>

      <div style={{ marginTop: 14, textAlign: "center", opacity: 0.65, fontSize: 12 }}>
        Gente e Cultura T.Group — 2026 — Todos os direitos reservados.
      </div>
    </main>
  );
}
