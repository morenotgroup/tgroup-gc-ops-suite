"use client";
import { useState } from "react";

async function callBot(action: string, competencia?: string, days?: number) {
  const resp = await fetch("/api/bot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, competencia, days }),
  });
  return await resp.json();
}

export default function GCConsole() {
  const [competencia, setCompetencia] = useState("FEV-26");
  const [out, setOut] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function run(action: string) {
    setLoading(true);
    try {
      const data = await callBot(action, competencia, 5);
      setOut(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2>GC Console • Fechamento PJ</h2>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <label>Competência:</label>
        <input value={competencia} onChange={(e)=>setCompetencia(e.target.value.toUpperCase())} />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button disabled={loading} onClick={()=>run("status")}>Status</button>
        <button disabled={loading} onClick={()=>run("start_closing")}>Iniciar Fechamento (5 dias)</button>
        <button disabled={loading} onClick={()=>run("run_now")}>Rodar Agora</button>
        <button disabled={loading} onClick={()=>run("stop_closing")}>Parar Fechamento</button>
      </div>

      <pre style={{ marginTop: 18, padding: 12, background: "#111", color: "#0f0", borderRadius: 8, overflowX: "auto" }}>
        {out ? JSON.stringify(out, null, 2) : "—"}
      </pre>
    </main>
  );
}
