import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";

type Action =
  | "start_closing"
  | "run_now"
  | "stop_closing"
  | "status"
  | "write_parse_results";

export async function POST(req: Request) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user?.email)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (session.role !== "gc")
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { action, competencia, days, rows } = body as {
    action: Action;
    competencia?: string;
    days?: number;
    rows?: any[];
  };

  const url = process.env.APPS_SCRIPT_WEBAPP_URL;
  const key = process.env.BOT_API_KEY;
  if (!url || !key)
    return NextResponse.json({ ok: false, error: "missing server config" }, { status: 500 });

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key,
      action,
      competencia,
      days,
      rows,
      initiator: session.user.email,
      ts: new Date().toISOString(),
    }),
  });

  const data = await resp.json().catch(() => ({}));
  return NextResponse.json(data);
}
