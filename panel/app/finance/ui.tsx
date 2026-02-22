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

function pickFirstKey(obj: any, keys: string[]) {
  for (const k of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return k;
  return keys[0];
}

function parseMoney(v: any) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  // "R$ 3.050,00" -> 3050.00
  const cleaned = s
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".");
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

function StatusChip({ text }: { text: string }) {
  const cls = statusClass(text);
  const styleBase: any = {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,.16)",
    fontSize: 12,
    display: "inline-block",
    whiteSpace: "nowrap",
    background: "rgba(0,0,0,.18)",
  };
  const styles: Record<string, any> = {
    ok: { ...styleBase, background: "rgba(20,180,120,.18)" },
    pend: { ...styleBase, background: "rgba(240,180,40,.18)" },
    crit: { ...styleBase, background: "rgba(240,80,80,.18)" },
    unk: styleBase,
  };
  return <span style={styles[cls]}>{text || "—"}</span>;
}

async function fetchMeta() {
  const resp = await fetch("/api/meta", { cache: "no-store" });
  return await resp.json();
}

async function fetchSheet(sheetName: string, company: string) {
  // company param reforça RBAC no /api/sheets
  const qs = new URLSearchParams({
    sheetName,
    range: "A:Z",
    company,
  });
  const resp = await fetch(`/api/sheets?${qs.toString()}`, { cache: "no-store" });
  return await resp.json();
}

export default function FinanceClient({ role }: { role: Role }) {
  const companies = useMemo(() => companiesForRole(role), [role]);

  const [company, setCompany] = useState(companies[0] || "");
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [comp, setComp] = useState("FEV-26");

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const [sortBy, setSortBy] = useState<"valor" | "nome">("valor");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [loadError, setLoadError] = useState<string | null>(null);

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

  useEffect(() => {
    if (company) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, comp]);

  const schemaKeys = useMemo(() => {
    const sample = rows[0] || {};
    return {
      nome: pickFirstKey(sample, ["Nome", "COLABORADOR", "Colaborador"]),
      valor: pickFirstKey(sample, ["Valor Esperado", "VALOR ESPERADO", "VALOR", "Valor"]),
      nf: pickFirstKey(sample, ["NF(planilha)", "NF (planilha)", "NF", "NFS-e"]),
      link: pickFirstKey(sample, ["Link(planilha)", "Link (planilha)", "LINK", "Link"]),
      status: pickFirstKey(sample, ["Status", "STATUS"]),
      pix: pickFirstKey(sample, ["PIX", "Chave Pix", "CHAVE PIX"]),
      banco: pickFirstKey(sample, ["Banco", "BANCO"]),
      agencia: pickFirstKey(sample, ["Agência", "AGÊNCIA", "Agencia", "AGENCIA"]),
      conta: pickFirstKey(sample, ["Conta", "CONTA"]),
      obs: pickFirstKey(sample, ["Observações", "OBS", "Observacao", "OBSERVAÇÕES"]),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(qq));
  }, [rows, q]);

  const sorted = useMemo(() => {
    const kNome = schemaKeys.nome;
    const kValor = schemaKeys.valor;

    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortBy === "nome") {
        const an = String(a[kNome] || "").toLowerCase();
        const bn = String(b[kNome] || "").toLowerCase();
        return sortDir === "asc" ? an.localeCompare(bn) : bn.localeCompare(an);
      } else {
        const av = parseMoney(a[kValor]);
        const bv = parseMoney(b[kValor]);
        return sortDir === "asc" ? av - bv : bv - av;
      }
    });
    return copy;
  }, [filtered, sortBy, sortDir, schemaKeys]);

  const totals = useMemo(() => {
    const kValor = schemaKeys.valor;
    const kLink = schemaKeys.link;
    const kNF = schemaKeys.nf;
    const kStatus = schemaKeys.status;

    const total = sorted.reduce((acc, r) => acc + parseMoney(r[kValor]), 0);

    const crit = sorted.filter((r) => {
      const link = String(r[kLink] || "").trim();
      const nf = String(r[kNF] || "").trim();
      const st = String(r[kStatus] || "");
      return !link || !nf || statusClass(st) === "crit";
    }).length;

    const pend = sorted.filter((r) => statusClass(String(r[kStatus] || "")) === "pend").length;
    const ok = sorted.filter((r) => statusClass(String(r[kStatus] || "")) === "ok").length;

    const progress = sorted.length ? Math.round((ok / sorted.length) * 100) : 0;

    return { total, crit, pend, ok, progress, count: sorted.length };
  }, [sorted, schemaKeys]);

  function exportFullCSV() {
    if (!sorted.length) return;

    // tenta exportar um conjunto “bom” de colunas (e ainda inclui extras se existirem)
    const baseHeaders = [
      schemaKeys.nome,
      schemaKeys.valor,
      schemaKeys.nf,
      schemaKeys.link,
      schemaKeys.status,
      schemaKeys.pix,
      schemaKeys.banco,
      schemaKeys.agencia,
      schemaKeys.conta,
      schemaKeys.obs,
    ].filter(Boolean);

    // inclui colunas extras do dataset sem duplicar
    const allKeys = Array.from(
      new Set(
        sorted.reduce<string[]>((acc, r) => acc.concat(Object.keys(r || {})), [] as string[])
      )
    );
    const headers = Array.from(new Set(baseHeaders.concat(allKeys)));

    const csv = toCSV(sorted, headers);
    downloadText(`FIN_${company.replace(".", "")}_${comp}_FULL.csv`, csv);
  }

  function exportPagamentoCSV() {
    if (!sorted.length) return;

    const kNome = schemaKeys.nome;
    const kValor = schemaKeys.valor;
    const kPix = schemaKeys.pix;
    const kBanco = schemaKeys.banco;
    const kAg = schemaKeys.agencia;
    const kConta = schemaKeys.conta;

    const headers = ["Nome", "Valor", "PIX", "Banco", "Agência", "Conta"];

    const out = sorted.map((r) => ({
      Nome: r[kNome] ?? "",
      Valor: r[kValor] ?? "",
      PIX: r[kPix] ?? "",
      Banco: r[kBanco] ?? "",
      "Agência": r[kAg] ?? "",
      Conta: r[kConta] ?? "",
    }));

    const csv = toCSV(out, headers);
    downloadText(`FIN_${company.replace(".", "")}_${comp}_PAGAMENTO.csv`, csv);
  }

  function toggleSort(next: "valor" | "nome") {
    if (sortBy !== next) {
      setSortBy(next);
      setSortDir(next === "valor" ? "desc" : "asc");
      return;
    }
    setSortDir(sortDir === "asc" ? "desc" : "asc");
  }

  const semaforo = useMemo(() => {
    if (totals.crit > 0) return "🔴";
    if (totals.pend > 0) return "🟡";
    return "🟢";
  }, [totals]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Finance • Pagamentos PJ</h2>
            <p style={{ opacity: 0.85, marginTop: 6 }}>
              Visão por empresa (RBAC). Total, pendências e export pronto pro fluxo do Finance.
            </p>
          </div>
          <Chip text={`${semaforo} ${totals.progress}% pronto`} />
        </div>

        {loadError ? (
          <p style={{ marginTop: 10, color: "rgba(255,180,180,.95)" }}>⚠️ {loadError}</p>
        ) : null}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 12 }}>
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
              {companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
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
              {competencias.length ? (
                competencias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))
              ) : (
                <option value={comp}>{comp}</option>
              )}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Busca</div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, NF, status..." />
          </div>

          <GhostButton disabled={loading} onClick={load}>
            Atualizar
          </GhostButton>

          <PrimaryButton disabled={!sorted.length} onClick={exportFullCSV}>
            Export CSV (full)
          </PrimaryButton>

          <GhostButton disabled={!sorted.length} onClick={exportPagamentoCSV}>
            Export CSV (pagamento)
          </GhostButton>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          <Chip text={`Linhas: ${totals.count}`} />
          <Chip text={`Total a pagar: R$ ${totals.total.toFixed(2)}`} />
          <Chip text={`OK: ${totals.ok}`} />
          <Chip text={`Pendências: ${totals.pend}`} />
          <Chip text={`Críticos: ${totals.crit}`} />
        </div>

        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th
                  style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.9, cursor: "pointer" }}
                  onClick={() => toggleSort("nome")}
                  title="Ordenar por Nome"
                >
                  Nome {sortBy === "nome" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>

                <th
                  style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.9, cursor: "pointer" }}
                  onClick={() => toggleSort("valor")}
                  title="Ordenar por Valor"
                >
                  Valor {sortBy === "valor" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>

                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.9 }}>
                  NF
                </th>

                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.9 }}>
                  Link
                </th>

                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", opacity: 0.9 }}>
                  Status
                </th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((r, i) => {
                const nome = r[schemaKeys.nome] ?? "";
                const valor = r[schemaKeys.valor] ?? "";
                const nf = r[schemaKeys.nf] ?? "";
                const link = r[schemaKeys.link] ?? "";
                const st = String(r[schemaKeys.status] ?? "");

                const missingLink = !String(link).trim();
                const missingNF = !String(nf).trim();

                const signal = missingLink || missingNF ? "⚠️" : "✅";

                return (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                    <td style={{ padding: "10px 8px" }}>
                      <span style={{ marginRight: 8 }}>{signal}</span>
                      {nome}
                    </td>
                    <td style={{ padding: "10px 8px" }}>{valor}</td>
                    <td style={{ padding: "10px 8px" }}>{nf}</td>
                    <td style={{ padding: "10px 8px" }}>
                      {String(link).trim() ? (
                        <a href={String(link)} target="_blank" style={{ opacity: 0.95 }}>
                          abrir
                        </a>
                      ) : (
                        <span style={{ opacity: 0.65 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <StatusChip text={st || (missingLink || missingNF ? "crítico" : "—")} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
          Regra prática: se tiver <b>⚠️</b>, normalmente é falta de Link ou NF. Isso vira crítico e trava o fechamento.
        </p>
      </GlassCard>
    </main>
  );
}
