import { getServerSession } from "next-auth";

export default async function Finance() {
  const session: any = await getServerSession();
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2>Finance</h2>
      <p>Este painel lê as abas FIN_<EMPRESA>_<COMP>.</p>
      <p>Exemplos:</p>
      <ul>
        <li><code>/api/sheets?sheetName=FIN_TYouth_FEV-26&range=A:G&company=T.Youth</code></li>
        <li><code>/api/sheets?sheetName=FIN_TBrands_FEV-26&range=A:G&company=T.Brands</code></li>
      </ul>
      <p>Role atual: <b>{session?.role}</b></p>
    </main>
  );
}
