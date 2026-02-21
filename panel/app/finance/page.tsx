export default function FinancePage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2>Finance</h2>
      <p>Este painel lê as abas FIN_&lt;EMPRESA&gt;_&lt;COMP&gt;.</p>
      <ul>
        <li>
          <code>/api/sheets?sheetName=FIN_TYouth_FEV-26&amp;range=A:G&amp;company=T.Youth</code>
        </li>
        <li>
          <code>/api/sheets?sheetName=FIN_TBrands_FEV-26&amp;range=A:G&amp;company=T.Brands</code>
        </li>
      </ul>
    </main>
  );
}
