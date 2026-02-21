export function toCSV(rows: any[], headers: string[]) {
  const escape = (v: any) => {
    const s = (v ?? "").toString();
    const needs = /[",\n]/.test(s);
    const out = s.replace(/"/g, '""');
    return needs ? `"${out}"` : out;
  };

  const lines = [];
  lines.push(headers.map(escape).join(","));
  for (const r of rows) {
    lines.push(headers.map((h) => escape((r as any)[h])).join(","));
  }
  return lines.join("\n");
}

export function downloadText(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8"
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
