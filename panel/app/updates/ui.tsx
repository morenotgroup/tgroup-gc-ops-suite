"use client";

import { useEffect, useMemo, useState } from "react";
import { GlassCard, Input, GhostButton, PrimaryButton, Chip } from "../components/ui";
import { toCSV, downloadText } from "../../lib/csv";

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

function normalize(s: string) {
  return (s || "").toUpperCase().replace(/\s+/g, " ").replace(/[.]/g, "").trim();
}

function matchCompany(sheetEmpresa: string, selected: string) {
  if (!selected || selected === "TODAS") return true;
  const sel = normalize(selected);
  const e = normalize(sheetEmpresa);
  const parts = e.split(" - ").map((p) => p.trim());

  const has = (needle: string) => parts.some((p) => p.includes(needle)) || e.includes(needle);

  // aceita nomes antigos e novos
  if (sel === "TYOUTH") return has("TYOUTH") || has("TOY") || has("FORMATURAS") || has("NEO") || has("MED");
  if (sel === "TBRANDS") return has("TBRANDS") || has("TAJ BRANDS") || has("BRANDS") || has("CONSULTORIA");
  if (sel === "TDREAMS") return has("TDREAMS") || has("DREAMS") || has("MIRANTE") || has("PEOPLE");
  if (sel === "TVENUES") return has("TVENUES") || has("VENUES") || has("T VENUES");
  if (sel === "TGROUP") return has("TGROUP") || has("HOLDING") || has("THOLDING") || has("GRUPO T");

  return has(sel);
}

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function parseMoneyBR(v: any) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const cleaned = s.replace(/\s/g, "").replace("R$", "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyBR(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pickKey(header: string[], candidates: string[], fallback: string) {
  const set = new Set(header);
  for (const c of candidates) if (set.has(c)) return c;
  return fallback;
}

async function fetchMeta() {
  const resp = await fetch("/api/meta", { cache: "no-store" });
  return await resp.json();
}

async function fetchSheet(sheetName: string) {
  const qs = new URLSearchParams({ sheetName, range: "A:Z" });
  const resp = await fetch(`/api/sheets?${qs.toString()}`, { cache: "no-store" });
  return await resp.json();
}

export default function UpdatesClient({ role }: { role: Role }) {
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState<string>("");

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [company, setCompany] = useState("TODAS");
  const [acao, setAcao] = useState("TODAS");
  const [q, setQ] = useState("");

  // carrega lista de abas Update
  useEffect(() => {
    (async () => {
      const meta = await fetchMeta();
      if (meta.ok) {
        const ups: string[] = meta.updates || [];
        // ordena “mais recente” primeiro por heurística simples (mantém como veio)
        setSheets(ups);
        // default: tenta Fev-26, senão Jan-26, senão primeiro
        const prefer = ups.find((x) => x.includes("Fev-26")) || ups.find((x) => x.includes("Jan-26")) || ups[0];
        setSheetName(prefer || "");
      }
    })();
  }, []);

  async function load() {
    if (!sheetName) return;
    setLoading(true);
    setErr(null);

    try {
      const data = await fetchSheet(sheetName);
      if (!data.ok) {
        setRows([]);
        setErr(data.error || "Falha ao ler aba de Updates.");
        return;
      }

      const values: any[][] = data.values || [];
      if (values.length < 2) {
        setRows([]);
        return;
      }

      const header = values[0].map((v) => String(v ?? "").trim());

      // mapeia chaves conforme a sua aba (com tolerância a pequenas variações)
      const K = {
        CONTRATO: pickKey(header, ["CONTRATO"], "CONTRATO"),
        COLABORADOR: pickKey(header, ["COLABORADOR", "Colaborador", "NOME"], "COLABORADOR"),
        EMPRESA: pickKey(header, ["EMPRESA", "Empresa"], "EMPRESA"),
        ÁREA: pickKey(header, ["ÁREA", "AREA"], "ÁREA"),
        AÇÃO: pickKey(header, ["AÇÃO", "ACAO"], "AÇÃO"),
        DATA: pickKey(header, ["DATA CONTRATAÇÃO", "DATA", "DATA ADMISSÃO"], "DATA CONTRATAÇÃO"),
        SAL_ATUAL: pickKey(header, ["SALÁRIO ATUAL", "SALARIO ATUAL"], "SALÁRIO ATUAL"),
        DAS: pickKey(header, ["DAS - R$ 50", "DAS", "DAS R$ 50"], "DAS - R$ 50"),
        SAL_PROP: pickKey(header, ["SALÁRIO PROP", "SALARIO PROP"], "SALÁRIO PROP"),
        SAL_REAJ: pickKey(header, ["SALÁRIO REAJUSTADO", "SALARIO REAJUSTADO"], "SALÁRIO REAJUSTADO"),
        SOMA_TOTAL: pickKey(header, ["SOMA SALÁRIO TOTAL + DAS (SEM DAS TOY FORMA)", "SOMA SALÁRIO TOTAL + DAS", "SOMA"], "SOMA SALÁRIO TOTAL + DAS (SEM DAS TOY FORMA)"),
        RESCISAO: pickKey(header, ["VALOR TOTAL DA RESCISÃO (SALÁRIO + SALDO FÉRIAS)", "VALOR TOTAL DA RESCISÃO", "RESCISÃO"], "VALOR TOTAL DA RESCISÃO (SALÁRIO + SALDO FÉRIAS)"),
        MES_REF: pickKey(header, ["MÊS DE REF", "MES DE REF"], "MÊS DE REF"),
        OBS: pickKey(header, ["OBSERVAÇÕES:", "OBSERVAÇÕES", "OBS"], "OBSERVAÇÕES:"),
      };

      const objs = values.slice(1).map((r) => {
        const o: any = {};
        header.forEach((h, i) => (o[h] = r[i]));
        // normaliza também pelas chaves “K”
        o.__K = K;
        return o;
      });

      setRows(objs);
    } finally {
      setLoading(false);
    }
  }

  // carrega quando troca aba
  useEffect(() => {
    if (sheetName) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetName]);

  const acoesDisponiveis = useMemo(() => {
    if (!rows.length) return [];
    const K = rows[0].__K;
    const set = new Set(rows.map((r) => safeStr(r[K.AÇÃO])).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  const enriched = useMemo(() => {
    if (!rows.length) return [];

    const K = rows[0].__K;

    return rows.map((r) => {
      const ac = normalize(safeStr(r[K.AÇÃO]));
      const salProp = parseMoneyBR(r[K.SAL_PROP]);
      const soma = parseMoneyBR(r[K.SOMA_TOTAL]);
      const salReaj = parseMoneyBR(r[K.SAL_REAJ]);
      const salAtual = parseMoneyBR(r[K.SAL_ATUAL]);
      const resc = parseMoneyBR(r[K.RESCISAO]);

      // REGRA DO "PAGAR NO MÊS" (pra refletir a realidade do Finance)
      // - Desligamento: usa RESCISÃO se tiver valor
      // - Contratação/Reajuste: usa SALÁRIO PROP se tiver, senão SOMA (sal + DAS), senão REAJ, senão ATUAL
      let pagar = 0;
      let fonte: "RESCISAO" | "PROP" | "SOMA" | "REAJ" | "ATUAL" | "ZERO" = "ZERO";

      const isDeslig = ac.includes("DESLIG") || ac.includes("ENCERRAMENTO");
      if (isDeslig) {
        if (resc > 0) { pagar = resc; fonte = "RESCISAO"; }
        else { pagar = 0; fonte = "ZERO"; }
      } else {
        if (salProp > 0) { pagar = salProp; fonte = "PROP"; }
        else if (soma > 0) { pagar = soma; fonte = "SOMA"; }
        else if (salReaj > 0) { pagar = salReaj; fonte = "REAJ"; }
        else if (salAtual > 0) { pagar = salAtual; fonte = "ATUAL"; }
        else { pagar = 0; fonte = "ZERO"; }
      }

      return {
        ...r,
        __pagarNoMes: pagar,
        __fontePagar: fonte,
      };
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = enriched;

    if (company !== "TODAS") {
      list = list.filter((r) => matchCompany(safeStr(r[r.__K.EMPRESA]), company));
    }

    if (acao !== "TODAS") {
      list = list.filter((r) => safeStr(r[r.__K.AÇÃO]) === acao);
    }

    if (qq) {
      list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(qq));
    }

    return list;
  }, [enriched, company, acao, q]);

  const stats = useMemo(() => {
    if (!filtered.length) return { linhas: 0, contrat: 0, reaj: 0, deslig: 0, totalPagar: 0 };

    const K = filtered[0].__K;
    let contrat = 0, reaj = 0, deslig = 0;
    let totalPagar = 0;

    for (const r of filtered) {
      const a = normalize(safeStr(r[K.AÇÃO]));
      if (a.includes("CONTRAT")) contrat++;
      if (a.includes("REAJUST")) reaj++;
      if (a.includes("DESLIG") || a.includes("ENCERRAMENTO")) deslig++;
      totalPagar += Number(r.__pagarNoMes || 0);
    }

    return { linhas: filtered.length, contrat, reaj, deslig, totalPagar };
  }, [filtered]);

  function exportCSV() {
    if (!filtered.length) return;

    const K = filtered[0].__K;

    // exporta TUDO + coluna calculada
    const out = filtered.map((r) => ({
      CONTRATO: r[K.CONTRATO] ?? "",
      COLABORADOR: r[K.COLABORADOR] ?? "",
      EMPRESA: r[K.EMPRESA] ?? "",
      "ÁREA": r[K.ÁREA] ?? "",
      "AÇÃO": r[K.AÇÃO] ?? "",
      "DATA CONTRATAÇÃO": r[K.DATA] ?? "",
      "SALÁRIO ATUAL": r[K.SAL_ATUAL] ?? "",
      "DAS - R$ 50": r[K.DAS] ?? "",
      "SALÁRIO PROP": r[K.SAL_PROP] ?? "",
      "SALÁRIO REAJUSTADO": r[K.SAL_REAJ] ?? "",
      "SOMA SALÁRIO TOTAL + DAS": r[K.SOMA_TOTAL] ?? "",
      "PAGAR NO MÊS (calc)": formatMoneyBR(Number(r.__pagarNoMes || 0)),
      "FONTE (calc)": r.__fontePagar ?? "",
      "VALOR TOTAL DA RESCISÃO": r[K.RESCISAO] ?? "",
      "MÊS DE REF": r[K.MES_REF] ?? "",
      "OBSERVAÇÕES": r[K.OBS] ?? "",
    }));

    const headers = Object.keys(out[0]);
    const csv = toCSV(out, headers);
    downloadText(`UPDATES_${sheetName.replaceAll(" ", "_")}_EXPORT.csv`, csv);
  }

  const fonteLabel = (f: string) => {
    if (f === "PROP") return "PROP";
    if (f === "SOMA") return "SOMA+DAS";
    if (f === "REAJ") return "REAJ";
    if (f === "ATUAL") return "ATUAL";
    if (f === "RESCISAO") return "RESCISÃO";
    return "—";
  };

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px" }}>
      <style>{`
        .btnRow { display: flex; gap: 10px; flex-wrap: wrap; align-items: end; }
        .chips { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
        .tableWrap { margin-top: 14px; overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,.12); opacity: .9; }
        td { padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,.08); vertical-align: top; }
        .mono { font-variant-numeric: tabular-nums; }
        .pill { display: inline-flex; gap: 8px; align-items: center; border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: 4px 10px; font-size: 12px; background: rgba(0,0,0,.18); }
        .pagar { font-weight: 900; }
        .muted { opacity: .75; font-size: 12px; }
      `}</style>

      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Updates (GC + Finance)</h2>
            <p style={{ opacity: 0.85, marginTop: 6 }}>
              Admissões, desligamentos, reajustes e movimentações — agora com <b>todos os campos</b> + <b>Pagar no mês</b> calculado.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <GhostButton disabled={!sheetName || loading} onClick={load}>Atualizar</GhostButton>
            <PrimaryButton disabled={!filtered.length} onClick={exportCSV}>Exportar CSV</PrimaryButton>
          </div>
        </div>

        {err ? <p style={{ marginTop: 10, color: "rgba(255,180,180,.95)" }}>⚠️ {err}</p> : null}

        <div className="btnRow" style={{ marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Mês (aba)</div>
            <select
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              style={{
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(10,15,30,.35)",
                color: "rgba(255,255,255,.92)",
                minWidth: 280,
              }}
            >
              {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Empresa</div>
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              style={{
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(10,15,30,.35)",
                color: "rgba(255,255,255,.92)",
              }}
            >
              {["TODAS", "T.Youth", "T.Brands", "T.Dreams", "T.Venues", "T.Group"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Ação</div>
            <select
              value={acao}
              onChange={(e) => setAcao(e.target.value)}
              style={{
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(10,15,30,.35)",
                color: "rgba(255,255,255,.92)",
                minWidth: 200,
              }}
            >
              <option value="TODAS">TODAS</option>
              {acoesDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Busca</div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Colaborador, observação, empresa..." />
          </div>
        </div>

        <div className="chips">
          <span className="pill">Linhas: <b>{stats.linhas}</b></span>
          <span className="pill">Contratações: <b>{stats.contrat}</b></span>
          <span className="pill">Reajustes: <b>{stats.reaj}</b></span>
          <span className="pill">Desligamentos: <b>{stats.deslig}</b></span>
          <span className="pill">Total “Pagar no mês”: <b>{formatMoneyBR(stats.totalPagar)}</b></span>
        </div>

        <div className="tableWrap">
          {!filtered.length ? (
            <p style={{ marginTop: 12, opacity: 0.75 }}>Sem dados no filtro atual.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>CONTRATO</th>
                  <th>COLABORADOR</th>
                  <th>EMPRESA</th>
                  <th>ÁREA</th>
                  <th>AÇÃO</th>
                  <th>DATA</th>
                  <th>SAL. ATUAL</th>
                  <th>DAS</th>
                  <th>SAL. PROP</th>
                  <th>SAL. REAJ</th>
                  <th>SOMA + DAS</th>
                  <th>PAGAR NO MÊS</th>
                  <th>RESCISÃO</th>
                  <th>MÊS REF</th>
                  <th>OBS</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((r: any, i: number) => {
                  const K = r.__K;
                  const pagar = Number(r.__pagarNoMes || 0);
                  const fonte = fonteLabel(String(r.__fontePagar || ""));

                  return (
                    <tr key={i}>
                      <td>{safeStr(r[K.CONTRATO])}</td>
                      <td style={{ fontWeight: 800 }}>{safeStr(r[K.COLABORADOR])}</td>
                      <td>{safeStr(r[K.EMPRESA])}</td>
                      <td>{safeStr(r[K.ÁREA])}</td>
                      <td>{safeStr(r[K.AÇÃO])}</td>
                      <td>{safeStr(r[K.DATA])}</td>

                      <td className="mono">{safeStr(r[K.SAL_ATUAL])}</td>
                      <td>{safeStr(r[K.DAS])}</td>
                      <td className="mono">{safeStr(r[K.SAL_PROP])}</td>
                      <td className="mono">{safeStr(r[K.SAL_REAJ])}</td>
                      <td className="mono">{safeStr(r[K.SOMA_TOTAL])}</td>

                      <td className="mono">
                        <div className="pagar">{formatMoneyBR(pagar)}</div>
                        <div className="muted">fonte: <b>{fonte}</b></div>
                      </td>

                      <td className="mono">{safeStr(r[K.RESCISAO])}</td>
                      <td>{safeStr(r[K.MES_REF])}</td>
                      <td style={{ minWidth: 320 }}>{safeStr(r[K.OBS])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
          Regra aplicada: em <b>Contratação/Reajuste</b>, o painel prioriza <b>SALÁRIO PROP</b> (quando existe). Em <b>Desligamento</b>, prioriza <b>RESCISÃO</b>.
        </p>
      </GlassCard>
    </main>
  );
}
