import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

type Action = "start_closing" | "run_now" | "stop_closing" | "status";

export async function POST(req: Request) {
  const session: any = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (session.role !== "gc") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { action, competencia, days } = await req.json() as { action: Action; competencia?: string; days?: number };

  const url = process.env.APPS_SCRIPT_WEBAPP_URL;
  const key = process.env.BOT_API_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "missing server config" }, { status: 500 });

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key,
      action,
      competencia,
      days,
      initiator: session.user.email,
      ts: new Date().toISOString(),
    }),
  });

  const data = await resp.json().catch(() => ({}));
  return NextResponse.json(data);
}
