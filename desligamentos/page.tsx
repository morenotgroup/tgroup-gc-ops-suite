import { getServerSession } from "next-auth";

export default async function Desligamentos() {
  const session: any = await getServerSession();
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2>Desligamentos (PJ)</h2>
      <p>Fase 1: leitura da aba DESLIG_ (a ser gerada pelo Apps Script).</p>
      <p>Fase 2: formulário + geração do PDF do extrato automaticamente.</p>
      <p>Role atual: <b>{session?.role}</b></p>
    </main>
  );
}
