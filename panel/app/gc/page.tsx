"use client";
import { useState } from "react";
import { GlassCard, PrimaryButton, GhostButton, Input, Chip } from "../components/ui";

async function callBot(action: string, competencia?: string, days?: number, rows?: any[]) {
  const resp = await fetch("/api/bot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, competencia, days, rows }),
  });
  return await resp.json();
}

async function fetchSheet(sheetName: string, range = "A:Z") {
  const resp = await fetch(
    `/api/sheets?sheetName=${encodeURIComponent(sheetName)}&range=${encodeURIComponent(range)}`
  );
  return await resp.json();
}

async function parseOne(link: string) {
  const resp = await fetch("/api/parse-nf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ link }),
  });
  return await resp.json();
}

export default function GCConsole() {
  const [competencia, setCompetencia] = useState("FEV-26");
  const [days, setDays] = useState(5);
  const [out, setOut] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  async function run(action: string) {
    setLoading(true);
    try {
      const data = await callBot(action as any, competencia, days);
      setOut(data);
    } finally {
      setLoading(false);
    }
  }

  async function runBatchParse() {
    setBatchRunning(true);
    setOut(null);

    try {
      const auditSheet = `AUDITORIA_${competencia}`;
      const data = await fetchSheet(auditSheet, "A:K");

      if (!data.ok) {
        setOut(data);
        return;
      }

      const values: any[][] = data.values || [];
      if (values.length < 2) {
        setOut({ ok: false, error: "AUDITORIA vazia" });
        return;
      }

      const header = values[0].map((v) => (v || "").toString());
      const idxNome = header.indexOf("Nome");
      const idxLink =
        header.indexOf("Link(planilha)") !== -1
          ? header.indexOf("Link(planilha)")
          : header.indexOf("Link (planilha)");

      if (idxNome === -1 || idxLink === -1) {
        setOut({
          ok: false,
          error: "Cabeçalhos não encontrados. Esperado: Nome e Link(planilha)",
        });
        return;
      }

      const rowsToParse = values.slice(1).filter((r) => r[idxLink]);
      setBatchProgress({ done: 0, total: rowsToParse.length });

      const results: any[] = [];
      let done = 0;

      for (const r of rowsToParse) {
        const nome = r[idxNome];
        const link = r[idxLink];

        const parsed = await parseOne(String(link));
        results.push({
          Nome: nome,
          Competencia: competencia,
          Link: link,
          NumeroNF: parsed.numeroNf || "",
          CNPJTomador: parsed.cnpjTomador || "",
          DataEmissao: parsed.dataEmissao || "",
          ValorTotal: parsed.valorTotal ?? "",
          Confidence: parsed.confidence || "",
          Skipped: parsed.skipped ? "SIM" : "",
          Reason: parsed.reason || "",
          Timestamp: new Date().toISOString(),
        });

        done += 1;
        setBatchProgress({ done, total: rowsToParse.length });
      }

      // grava em PDF_PARSE_<COMP> via Apps Script
      const outWrite = await callBot("write_parse_results" as any, competencia, undefined, results);
      setOut({ ok: true, parsed: results.length, write: outWrite });
    } finally {
      setBatchRunning(false);
    }
  }

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <GlassCard>
        <h2 style={{ marginTop: 0 }}>GC Console • Fechamento PJ</h2>
        <p style={{ opacity: 0.85, marginTop: 6 }}>
          Controle total: você inicia a janela do robô, roda manualmente quando quiser e para quando acabar.
        </p>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Competência</div>
            <Input value={competencia} onChange={(e) => setCompetencia(e.target.value.toUpperCase())} />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Janela (dias)</div>
            <Input
              type="number"
              min={1}
              max={10}
              value={days}
              onChange={(e) => setDays(Number(e.target.value || 5))}
            />
          </div>

          {batchRunning ? <Chip text={`Validando PDFs ${batchProgress.done}/${batchProgress.total}`} /> : null}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          <GhostButton disabled={loading} onClick={() => run("status")}>
            Status
          </GhostButton>
          <PrimaryButton disabled={loading} onClick={() => run("start_closing")}>
            Iniciar Fechamento
          </PrimaryButton>
          <GhostButton disabled={loading} onClick={() => run("run_now")}>
            Rodar Agora
          </GhostButton>
          <GhostButton disabled={loading} onClick={() => run("stop_closing")}>
            Parar
          </GhostButton>
          <GhostButton disabled={batchRunning} onClick={() => runBatchParse()}>
            Validar PDFs (batch)
          </GhostButton>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,.14)",
            background: "rgba(0,0,0,.25)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 12,
            overflowX: "auto",
          }}
        >
          {out ? JSON.stringify(out, null, 2) : "—"}
        </div>

        <p style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
          Dica: rode <b>Validar PDFs (batch)</b> somente durante a janela de fechamento. O resultado vai para{" "}
          <b>PDF_PARSE_{competencia}</b>.
        </p>
      </GlassCard>
    </main>
  );
}
