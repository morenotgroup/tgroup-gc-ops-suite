import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "../../../lib/auth";

const Query = z.object({
  sheetName: z.string(),
  range: z.string().default("A:Z"),
  company: z.string().optional(),
});

type Role = "gc" | "finance_youth" | "finance_core" | "viewer";

function canSeeCompany(role: Role, company: string) {
  if (role === "gc") return true;
  if (role === "finance_youth") return company === "T.Youth";
  if (role === "finance_core") return ["T.Brands", "T.Dreams", "T.Venues", "T.Group"].includes(company);
  return false;
}

function getServiceAccountAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  const creds = JSON.parse(raw);
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

function quoteSheetName(name: string) {
  // A1 notation: se tiver espaço/hífen/char especial, garante com '...'
  // Se tiver aspas simples dentro, escapa duplicando (' -> '')
  const safe = name.replace(/'/g, "''");
  return `'${safe}'`;
}

export async function GET(req: Request) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = Query.safeParse({
    sheetName: url.searchParams.get("sheetName"),
    range: url.searchParams.get("range") || "A:Z",
    company: url.searchParams.get("company") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  const role = (session.role || "viewer") as Role;
  const company = parsed.data.company;
  if (company && !canSeeCompany(role, company)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const auth = getServiceAccountAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.SPREADSHEET_ID!;

    const sheetNameQuoted = quoteSheetName(parsed.data.sheetName);
    const a1range = `${sheetNameQuoted}!${parsed.data.range}`;

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: a1range,
    });

    return NextResponse.json({ ok: true, values: resp.data.values || [] });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 200 } // devolve ok:false sem quebrar UI
    );
  }
}
