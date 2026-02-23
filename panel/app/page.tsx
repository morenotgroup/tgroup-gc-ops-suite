// panel/app/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";
import HomeClient from "./home/ui";

export default async function Home() {
  const session: any = await getServerSession(authOptions);

  if (!session?.user?.email) {
    // mantém o login simples
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <div style={{
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,.18)",
          background: "linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.08))",
          boxShadow: "0 20px 60px rgba(0,0,0,.45)",
          backdropFilter: "blur(16px) saturate(140%)",
          padding: 18,
        }}>
          <h1 style={{ marginTop: 0 }}>GC + Finance Panel</h1>
          <p>Faça login com sua conta do Workspace para acessar.</p>
          <a href="/api/auth/signin">Entrar</a>
        </div>
      </main>
    );
  }

  const role = session?.role ?? "viewer";
  return <HomeClient role={role} email={session.user.email} />;
}
