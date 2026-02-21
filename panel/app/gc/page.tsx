"use client";
import { useState } from "react";
import { GlassCard, PrimaryButton, GhostButton, Input } from "../components/ui";

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
  const [days, setDays] = useState(5);
  const [out, setOut] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function run(action: string) {
    setLoading(true);
    try {
      const data = await callBot(action, competencia, days);
      setOut(data);
    } finally {
      setLoading(false);
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
            <Input value={competencia} onChange={(e)=>setCompetencia(e.target.value.toUpperCase())} />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Janela (dias)</div>
            <Input
              type="number"
              min={1}
              max={10}
              value={days}
              onChange={(e)=>setDays(Number(e.target.value || 5))}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          <GhostButton disabled={loading} onClick={()=>run("status")}>Status</GhostButton>
          <PrimaryButton disabled={loading} onClick={()=>run("start_closing")}>Iniciar Fechamento</PrimaryButton>
          <GhostButton disabled={loading} onClick={()=>run("run_now")}>Rodar Agora</GhostButton>
          <GhostButton disabled={loading} onClick={()=>run("stop_closing")}>Parar</GhostButton>
        </div>

        <div style={{
          marginTop: 16,
          padding: 12,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,.14)",
          background: "rgba(0,0,0,.25)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          overflowX: "auto"
        }}>
          {out ? JSON.stringify(out, null, 2) : "—"}
        </div>

        <p style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
          Dica: use <b>Rodar Agora</b> no último dia do fechamento para gerar a versão final das abas FIN_* antes do Finance pagar.
        </p>
      </GlassCard>
    </main>
  );
}
