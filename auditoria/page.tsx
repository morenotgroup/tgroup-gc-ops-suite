import { getServerSession } from "next-auth";

export default async function Auditoria() {
  const session: any = await getServerSession();
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2>Auditorias</h2>
      <p>Este painel lê as abas AUDITORIA_<COMP> geradas pelo Apps Script.</p>
      <p>Exemplo de chamada: <code>/api/sheets?sheetName=AUDITORIA_FEV-26&range=A:K</code></p>
      <p>Role atual: <b>{session?.role}</b></p>
    </main>
  );
}
