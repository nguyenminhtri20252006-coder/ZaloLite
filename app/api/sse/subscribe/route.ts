import { NextRequest, NextResponse } from "next/server";
import { sseManager } from "@/lib/core/sse-manager";
import { getStaffSession } from "@/lib/actions/staff.actions";

export async function POST(req: NextRequest) {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { topic, action } = await req.json();

    if (!topic)
      return NextResponse.json({ error: "Missing topic" }, { status: 400 });

    if (action === "unsubscribe") {
      sseManager.unsubscribe(session.id, topic);
    } else {
      sseManager.subscribe(session.id, topic);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }
}
