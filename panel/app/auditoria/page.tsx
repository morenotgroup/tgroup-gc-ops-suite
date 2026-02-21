export default function AuditoriaPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2>Auditorias</h2>
      <p>Este painel lê as abas AUDITORIA_&lt;COMP&gt; geradas pelo Apps Script.</p>
      <p>
        Exemplo: <code>/api/sheets?sheetName=AUDITORIA_FEV-26&amp;range=A:K</code>
      </p>
    </main>
  );
}
