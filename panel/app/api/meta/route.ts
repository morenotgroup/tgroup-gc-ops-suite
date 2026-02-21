import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";

function getServiceAccountAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  const creds = JSON.parse(raw);
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function isUpdatesSheet(title: string) {
  const t = (title || "").trim();
  const up = t.toUpperCase();

  // pega qualquer aba que contenha UPDATE/UPDATES no nome,
  // mesmo que tenha prefixo/sufixo ("Update Colaboradores Jan-26", "UPDATES - Jan-26", etc)
  if (up.includes("UPDATE")) return true;
  if (up.includes("UPDATES")) return true;

  // caso você use "ATUALIZAÇÕES"
  if (up.includes("ATUALIZA")) return true;

  return false;
}

export async function GET() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SPREADSHEET_ID!;
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title))",
  });

  const titles =
    (meta.data.sheets?.map((s) => s.properties?.title).filter(Boolean) as string[]) || [];

  const auditorias = titles
    .filter((t) => t.startsWith("AUDITORIA_"))
    .map((t) => t.replace("AUDITORIA_", ""))
    .sort();

  const fins = titles.filter((t) => t.startsWith("FIN_")).sort();

  const updates = titles.filter(isUpdatesSheet).sort();

  return NextResponse.json({ ok: true, auditorias, fins, updates });
}
