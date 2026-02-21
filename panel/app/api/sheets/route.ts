import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { canSeeCompany } from "@/lib/rbac";

const Query = z.object({
  sheetName: z.string(),
  range: z.string().default("A:Z"),
  company: z.string().optional(),
});

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

export async function GET(req: Request) {
  const session: any = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = Query.safeParse({
    sheetName: url.searchParams.get("sheetName"),
    range: url.searchParams.get("range") || "A:Z",
    company: url.searchParams.get("company") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });

  const role = session.role || "viewer";
  const company = parsed.data.company;
  if (company && !canSeeCompany(role, company)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SPREADSHEET_ID!;
  const range = `${parsed.data.sheetName}!${parsed.data.range}`;

  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return NextResponse.json({ ok: true, values: resp.data.values || [] });
}
