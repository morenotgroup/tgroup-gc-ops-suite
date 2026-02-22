"use client";
import { useEffect, useMemo, useState } from "react";
import { GlassCard, Input, PrimaryButton, GhostButton, Chip } from "../components/ui";
import { toCSV, downloadText } from "../../lib/csv";

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

function companiesForRole(role: Role) {
  if (role === "gc") return ["T.Youth", "T.Brands", "T.Dreams", "T.Venues", "T.Group"];
  if (role === "finance_youth") return ["T.Youth"];
  if (role === "finance_core") return ["T.Brands", "T.Dreams", "T.Venues", "T.Group"];
  return [];
}

function finSheetName(company: string, comp: string) {
  const key = company.replace(".", "");
  return `FIN_${key}_${comp}`;
}

function parseMoney(v: any) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const cleaned = s.replace(/\s/g, "").replace("R$", "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function statusClass(s: string) {
  const t = (s || "").toLowerCase();
  if (t.includes("crít") || t.includes("crit")) return "crit";
  if (t.includes("pend")) return "pend";
  if (t.includes("ok") || t.includes("pago") || t.includes("liberado")) return "ok";
  return "unk";
}

function safeStr(v: any) {
  return String(v ?? "").trim();
}

async function fetchMeta() {
  const resp = await fetch("/api/meta", { cache: "no-store" });
  return await resp.json();
}

async function fetchSheet(sheetName: string, company: string) {
  const qs = new URLSearchParams({ sheetName, range: "A:Z", company });
  const resp = await fetch(`/api/sheets?${qs.toString()}`, { cache: "no-store" });
  return await resp.json();
}

async function fetchAuditSummary(comp: string, company: string) {
  const qs = new URLSearchParams({ comp, company });
  const resp = await fetch(`/api/audit-summary?${qs.toString()}`, { cache: "no-store" });
  return await resp.json();
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  }
}

function pickKey(sample: any, candidates: string[], fallback: string) {
  for (const k of candidates) if (sample && Object.prototype.hasOwnProperty.call(sample, k)) return k;
  return fallback;
}

function RowBadge({ kind }: { kind: "ok" | "pend" | "crit" | "unk" }) {
  const base: any = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,.14)",
    fontSize: 12,
    background: "rgba(0,0,0,.18)",
    whiteSpace: "nowrap",
  };
  const styles: Record<string, any> = {
    ok: { ...base, background: "rgba(20,180,120,.18)" },
    pend: { ...base, background: "rgba(240,180,40,.18)" },
    crit: { ...base, background: "rgba(240,80,80,.18)" },
    unk: base,
  };
  const label = kind === "ok" ? "OK" : kind === "pend" ? "PENDÊNCIA" : kind === "crit" ? "CRÍTICO" : "—";
  const dot = kind === "ok" ? "🟢" : kind === "pend" ? "🟡" : kind === "crit" ? "🔴" : "⚪";
  return <span style={styles[kind]}>{dot} {label}</span>;
}

export default function FinanceClient({ role }: { role: Role }) {
  const companies = useMemo(() => companiesForRole(role), [role]);

  const [company, setCompany] = useState(companies[0] || "");
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [comp, setComp] = useState("FEV-26");

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const [onlyIssues, setOnlyIssues] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);

  const [sortBy, setSortBy] = useState<"valor" | "nome">("valor");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Auditoria summary (GC)
  const [audit, setAudit] = useState<any>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const meta = await fetchMeta();
      if (meta.ok) {
        const fins: string[] = meta.fins || [];
        const comps = Array.from(new Set(fins.map((t) => t.split("_").slice(-1)[0]))).sort();
        setCompetencias(comps);
        if (comps.includes("FEV-26")) setComp("FEV-26");
        else if (comps.length) setComp(comps[comps.length - 1]);
      }
    })();
  }, []);

  useEffect(() => {
    if (companies.length && !company) setCompany(companies[0]);
  }, [role]);

  async function load() {
    if (!company) return;
    setLoading(true);
    setLoadError(null);

    try {
      const sheetName = finSheetName(company, comp);
      const data = await fetchSheet(sheetName, company);

      if (!data.ok) {
        setRows([]);
        setLoadError(data.error || "Falha ao ler FIN (api/sheets).");
        return;
      }

      const values: any[][] = data.values || [];
      if (values.length < 2) {
        setRows([]);
        return;
      }

      const header = values[0].map((v) => (v || "").toString().trim());
      const objs = values.slice(1).map((r) => {
        const o: any = {};
        header.forEach((h, i) => (o[h] = r[i]));
        return o;
      });

      setRows(objs);
    } finally {
      setLoading(false);
    }
  }

  async function loadAudit() {
    if (!company) return;
    setAuditLoading(true);
    try {
      const a = await fetchAuditSummary(comp, company);
      setAudit(a);
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    if (company) {
      load();
      loadAudit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, comp]);

  const keys = useMemo(() => {
    const s = rows[0] || {};
    return {
      nome: pickKey(s, ["Nome", "COLABORADOR", "Colaborador"], "Nome"),
      valor: pickKey(s, ["Valor Esperado", "VALOR ESPERADO", "VALOR", "Valor"], "Valor Esperado"),
      nf: pickKey(s, ["NF(planilha)", "NF (planilha)", "NF", "NFS-e"], "NF(planilha)"),
      link: pickKey(s, ["Link(planilha)", "Link (planilha)", "LINK", "Link"], "Link(planilha)"),
      status: pickKey(s, ["Status", "STATUS"], "Status"),
      pix: pickKey(s, ["PIX", "Chave Pix", "CHAVE PIX"], "PIX"),
      banco: pickKey(s, ["Banco", "BANCO"], "Banco"),
      agencia: pickKey(s, ["Agência", "AGÊNCIA", "Agencia", "AGENCIA"], "Agência"),
      conta: pickKey(s, ["Conta", "CONTA"], "Conta"),
      obs: pickKey(s, ["Observações", "OBS", "Observacao", "OBSERVAÇÕES"], "Observações"),
    };
  }, [rows]);

  const enriched = useMemo(() => {
    return rows.map((r) => {
      const link = safeStr(r[keys.link]);
      const nf = safeStr(r[keys.nf]);
      const st = safeStr(r[keys.status]);
      const cls = statusClass(st);

      const missingLink = !link;
      const missingNF = !nf;

      const isCrit = cls === "crit" || missingLink || missingNF;
      const isPend = cls === "pend" && !isCrit;
      const kind: "ok" | "pend" | "crit" | "unk" = isCrit ? "crit" : isPend ? "pend" : cls === "ok" ? "ok" : "unk";

      const reasons: string[] = [];
      if (missingNF) reasons.push("sem NF");
      if (missingLink) reasons.push("sem link");
      if (cls === "pend") reasons.push("pendência");
      if (cls === "crit") reasons.push("crítico");
      if (!reasons.length && kind === "unk") reasons.push("status indefinido");

      return { ...r, __kind: kind, __reasons: reasons };
    });
  }, [rows, keys]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = enriched;

    if (onlyCritical) list = list.filter((r: any) => r.__kind === "crit");
    else if (onlyIssues) list = list.filter((r: any) => r.__kind === "crit" || r.__kind === "pend");

    if (!qq) return list;
    return list.filter((r: any) => JSON.stringify(r).toLowerCase().includes(qq));
  }, [enriched, q, onlyIssues, onlyCritical]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a: any, b: any) => {
      if (sortBy === "nome") {
        const an = safeStr(a[keys.nome]).toLowerCase();
        const bn = safeStr(b[keys.nome]).toLowerCase();
        return sortDir === "asc" ? an.localeCompare(bn) : bn.localeCompare(an);
      } else {
        const av = parseMoney(a[keys.valor]);
        const bv = parseMoney(b[keys.valor]);
        return sortDir === "asc" ? av - bv : bv - av;
      }
    });
    return copy;
  }, [filtered, sortBy, sortDir, keys]);

  const totals = useMemo(() => {
    const total = sorted.reduce((acc: number, r: any) => acc + parseMoney(r[keys.valor]), 0);
    const crit = sorted.filter((r: any) => r.__kind === "crit").length;
    const pend = sorted.filter((r: any) => r.__kind === "pend").length;
    const ok = sorted.filter((r: any) => r.__kind === "ok").length;
    const count = sorted.length;
    const progress = count ? Math.round((ok / count) * 100) : 0;
    const semaforo = crit > 0 ? "🔴" : pend > 0 ? "🟡" : "🟢";
    return { total, crit, pend, ok, count, progress, semaforo };
  }, [sorted, keys]);

  function exportFullCSV() {
    if (!sorted.length) return;
    const allKeys = Array.from(new Set(sorted.reduce<string[]>((acc, r: any) => acc.concat(Object.keys(r || {})), [])))
      .filter((k) => !k.startsWith("__"));
    const csv = toCSV(sorted, allKeys);
    downloadText(`FIN_${company.replace(".", "")}_${comp}_FULL.csv`, csv);
  }

  function exportPagamentoCSV() {
    if (!sorted.length) return;
    const out = sorted.map((r: any) => ({
      Nome: r[keys.nome] ?? "",
      Valor: r[keys.valor] ?? "",
      PIX: r[keys.pix] ?? "",
      Banco: r[keys.banco] ?? "",
      "Agência": r[keys.agencia] ?? "",
      Conta: r[keys.conta] ?? "",
    }));
    const headers = ["Nome", "Valor", "PIX", "Banco", "Agência", "Conta"];
    const csv = toCSV(out, headers);
    downloadText(`FIN_${company.replace(".", "")}_${comp}_PAGAMENTO.csv`, csv);
  }

  function exportPendenciasCSV() {
    const pend = sorted.filter((r: any) => r.__kind === "crit" || r.__kind === "pend");
    if (!pend.length) return;
    const headers = [keys.nome, keys.valor, keys.nf, keys.link, keys.status, keys.obs].filter(Boolean);
    const csv = toCSV(pend, headers);
    downloadText(`FIN_${company.replace(".", "")}_${comp}_PENDENCIAS.csv`, csv);
  }

  async function copyCobrancaFinance() {
    const pend = sorted.filter((r: any) => r.__kind === "crit" || r.__kind === "pend");
    if (!pend.length) {
      setToast("Sem pendências pra copiar ✅");
      setTimeout(() => setToast(null), 2200);
      return;
    }
    const lines = pend.map((r: any) => `• ${safeStr(r[keys.nome])} — ${(r.__reasons || []).join(", ")}`);
    const text =
      `📌 Pendências PJ — ${company} — ${comp}\n` +
      `Total pendências: ${pend.length}\n\n` +
      lines.join("\n") +
      `\n\n(gerado via Finance Panel)`;
    await copyToClipboard(text);
    setToast("Cobrança (Finance) copiada ✅");
    setTimeout(() => setToast(null), 2200);
  }

  async function copyCobrancaGC() {
    if (!audit?.ok) {
      setToast("Auditoria GC indisponível agora.");
      setTimeout(() => setToast(null), 2200);
      return;
    }
    const crit = (audit.topCrit || []) as { nome: string; empresa: string; motivo: string }[];
    if (!crit.length) {
      setToast("Sem críticos GC ✅");
      setTimeout(() => setToast(null), 2200);
      return;
    }
    const lines = crit.map((x) => `• ${x.nome} — ${x.motivo}`);
    const text =
      `🚨 Travas GC (Auditoria) — ${company} — ${comp}\n` +
      `Críticos: ${audit.totals?.crit || 0}\n\n` +
      lines.join("\n") +
      `\n\n(gerado via Auditoria Summary)`;
    await copyToClipboard(text);
    setToast("Cobrança (GC críticos) copiada ✅");
    setTimeout(() => setToast(null), 2200);
  }

  const rowStyle = (kind: string) => {
    if (kind === "crit") return { background: "rgba(240,80,80,.10)" };
    if (kind === "pend") return { background: "rgba(240,180,40,.10)" };
    return {};
  };

  const auditChip = useMemo(() => {
    if (auditLoading) return <Chip text="Auditoria: carregando…" />;
    if (!audit?.ok) return <Chip text="Auditoria: indisponível" />;
    const sem = audit.semaforo === "red" ? "🔴" : audit.semaforo === "yellow" ? "🟡" : "🟢";
    return <Chip text={`${sem} GC críticos: ${audit.totals?.crit ?? 0}`} />;
  }, [audit, auditLoading]);

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px" }}>
      <style>{`
        .kpiGrid { display: grid; grid-template-columns: repeat(6, minmax(150px, 1fr)); gap: 12px; }
        @media (max-width: 1100px) { .kpiGrid { grid-template-columns: repeat(2, minmax(160px, 1fr)); } }
        .btnRow { display: flex; gap: 10px; flex-wrap: wrap; align-items: end; }
        .tableWrap { margin-top: 14px; overflow-x: auto; }
      `}</style>

      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Finance • Pagamentos PJ</h2>
            <p style={{ opacity: 0.85, marginTop: 6 }}>
              Agora com “travas GC” (Auditoria) direto aqui — sem abrir outra tela.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Chip text={`${totals.semaforo} ${totals.progress}% pronto`} />
            {auditChip}
          </div>
        </div>

        {loadError ? <p style={{ marginTop: 10, color: "rgba(255,180,180,.95)" }}>⚠️ {loadError}</p> : null}
        {toast ? <p style={{ marginTop: 10, color: "rgba(180,255,210,.95)" }}>✅ {toast}</p> : null}

        <div className="btnRow" style={{ marginTop: 12 }}>
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
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Competência</div>
            <select
              value={comp}
              onChange={(e) => setComp(e.target.value)}
              style={{
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(10,15,30,.35)",
                color: "rgba(255,255,255,.92)",
              }}
            >
              {competencias.length ? competencias.map((c) => <option key={c} value={c}>{c}</option>) : <option value={comp}>{comp}</option>}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Busca</div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, NF, status..." />
          </div>

          <GhostButton disabled={loading} onClick={() => { load(); loadAudit(); }}>Atualizar</GhostButton>

          <GhostButton onClick={() => { setOnlyCritical(false); setOnlyIssues((v) => !v); }}>
            {onlyIssues ? "Mostrando pendências" : "Somente pendências"}
          </GhostButton>

          <GhostButton onClick={() => { setOnlyIssues(false); setOnlyCritical((v) => !v); }}>
            {onlyCritical ? "Mostrando críticos" : "Somente críticos"}
          </GhostButton>

          <PrimaryButton disabled={!sorted.length} onClick={copyCobrancaFinance}>Copiar cobrança</PrimaryButton>
          <GhostButton onClick={copyCobrancaGC} disabled={auditLoading || !audit?.ok}>Copiar críticos GC</GhostButton>

          {role === "gc" ? (
            <GhostButton onClick={() => (window.location.href = `/auditoria?comp=${encodeURIComponent(comp)}&company=${encodeURIComponent(company)}&level=crit`)}>
              Abrir Auditoria
            </GhostButton>
          ) : null}
        </div>

        <div className="kpiGrid" style={{ marginTop: 14 }}>
          <GlassCard>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Total a pagar</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>R$ {totals.total.toFixed(2)}</div>
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>Soma de Valor Esperado</div>
          </GlassCard>

          <GlassCard>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Linhas</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>{totals.count}</div>
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>Prestadores</div>
          </GlassCard>

          <GlassCard>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Críticos (Finance)</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>{totals.crit}</div>
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>Sem link/NF ou status crítico</div>
          </GlassCard>

          <GlassCard>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Pendências (Finance)</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>{totals.pend}</div>
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>Status pendente</div>
          </GlassCard>

          <GlassCard>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Críticos (GC)</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>{audit?.ok ? (audit.totals?.crit ?? 0) : "—"}</div>
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>Travando fechamento</div>
          </GlassCard>

          <GlassCard>
            <div style={{ fontSize: 12, opacity: 0.75 }}>% pronto</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>{totals.progress}%</div>
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>OK / Total</div>
          </GlassCard>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <GhostButton disabled={!sorted.length} onClick={exportFullCSV}>Export CSV (full)</GhostButton>
          <GhostButton disabled={!sorted.length} onClick={exportPagamentoCSV}>Export CSV (pagamento)</GhostButton>
          <GhostButton disabled={!sorted.length} onClick={exportPendenciasCSV}>Export CSV (pendências)</GhostButton>
        </div>

        <div className="tableWrap">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.9 }}>Nome</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.9 }}>Valor</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.9 }}>NF</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.9 }}>Link</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.9 }}>Situação</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.9 }}>Motivo</th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((r: any, i: number) => {
                const kind = r.__kind as "ok" | "pend" | "crit" | "unk";
                const reasons = (r.__reasons || []).join(", ");

                return (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.08)", ...rowStyle(kind) }}>
                    <td style={{ padding: "10px 8px" }}>{safeStr(r[keys.nome])}</td>
                    <td style={{ padding: "10px 8px" }}>{r[keys.valor] ?? ""}</td>
                    <td style={{ padding: "10px 8px" }}>{safeStr(r[keys.nf]) || <span style={{ opacity: 0.65 }}>—</span>}</td>
                    <td style={{ padding: "10px 8px" }}>
                      {safeStr(r[keys.link]) ? <a href={safeStr(r[keys.link])} target="_blank">abrir</a> : <span style={{ opacity: 0.65 }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 8px" }}><RowBadge kind={kind} /></td>
                    <td style={{ padding: "10px 8px", opacity: 0.85 }}>{reasons}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
          Aqui o Finance já enxerga “Críticos GC” (Auditoria). Isso evita pagar com pendência travando o fechamento.
        </p>
      </GlassCard>
    </main>
  );
}
