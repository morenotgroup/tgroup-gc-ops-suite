import Link from "next/link";
import { getServerSession } from "next-auth";
import { signIn, signOut } from "next-auth/react";

export default async function Home() {
  const session: any = await getServerSession();

  if (!session?.user?.email) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>T.Group • GC + Finance Panel</h1>
        <p>Faça login com sua conta do Workspace para acessar.</p>
        <a href="/api/auth/signin">Entrar</a>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>T.Group • GC + Finance Panel</h1>
      <p>Logado como: <b>{session.user.email}</b> • role: <b>{session.role}</b></p>

      <ul>
        <li><Link href="/gc">GC Console (Start/Stop)</Link></li>
        <li><Link href="/auditoria">Auditorias</Link></li>
        <li><Link href="/finance">Finance</Link></li>
        <li><Link href="/desligamentos">Desligamentos (PJ)</Link></li>
      </ul>

      <p><a href="/api/auth/signout">Sair</a></p>
    </main>
  );
}
