/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/actions/staff.actions";
import { BotRuntimeManager } from "@/lib/core/bot-runtime-manager";
import { resolveBotIdentityId } from "@/lib/actions/chat.actions";
import { MediaHandlerService } from "@/lib/core/services/media-handler";
import supabase from "@/lib/supabaseServer";
import { MediaType } from "@/lib/types/zalo.types";

export async function POST(req: NextRequest) {
  const reqId = `req_${Date.now()}`;
  console.log(`[API SendMedia][${reqId}] Incoming...`);

  try {
    const session = await getStaffSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const type = formData.get("type") as MediaType;
    const botId = formData.get("botId") as string;
    const threadUuid = formData.get("threadId") as string;
    const metadataStr = formData.get("metadata") as string;

    if (!file || !type || !botId || !threadUuid) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const metadata = metadataStr ? JSON.parse(metadataStr) : {};

    // 1. Resolve Ids
    const realBotId = await resolveBotIdentityId(botId);

    // Query DB lấy Zalo External ID
    const { data: member } = await supabase
      .from("conversation_members")
      .select("thread_id")
      .eq("conversation_id", threadUuid)
      .eq("identity_id", realBotId)
      .single();

    if (!member || !member.thread_id) {
      return NextResponse.json(
        { error: "Cannot resolve Zalo Thread ID" },
        { status: 400 },
      );
    }
    const zaloThreadId = member.thread_id;

    // 2. Runtime
    const api = await BotRuntimeManager.getInstance().getBotAPI(realBotId);
    if (!api)
      return NextResponse.json({ error: "Bot offline" }, { status: 503 });

    // 3. Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // 4. Process
    const handler = MediaHandlerService.getInstance();
    const result = await handler.processSendMedia({
      api,
      botId: realBotId,
      threadId: zaloThreadId,
      conversationId: threadUuid,
      file: buffer,
      type,
      metadata,
      staffId: session.id,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error(`[API SendMedia][${reqId}] Error:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
