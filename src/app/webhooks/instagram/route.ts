import { NextRequest, NextResponse } from "next/server";

import { generateReply } from "@/lib/ai/generateReply";
import { parseInstagramWebhook } from "@/lib/instagram/parseWebhook";
import { sendInstagramMessage } from "@/lib/instagram/sendMessage";
import { searchRelevantChunks } from "@/lib/rag/searchRelevantChunks";

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (!VERIFY_TOKEN) {
    return new NextResponse("Webhook verify token is not configured", {
      status: 500,
    });
  }

  if (verifyToken !== VERIFY_TOKEN || !challenge) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
    },
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to read Instagram webhook event:", error);

    return NextResponse.json(
      { error: "Invalid webhook payload" },
      { status: 400 },
    );
  }

  try {
    console.log(
      "Instagram webhook event received:",
      JSON.stringify(
        {
          receivedAt: new Date().toISOString(),
          body,
        },
        null,
        2,
      ),
    );

    const messages = parseInstagramWebhook(body);

    if (messages.length === 0) {
      return NextResponse.json({ received: true, processed: 0 }, { status: 200 });
    }

    for (const message of messages) {
      await processInstagramMessage(message);
    }

    return NextResponse.json(
      { received: true, processed: messages.length },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to process Instagram webhook event:", error);

    return NextResponse.json(
      { received: true, error: "Webhook processing failed" },
      { status: 200 },
    );
  }
}

async function processInstagramMessage(
  message: ReturnType<typeof parseInstagramWebhook>[number],
) {
  console.log(
    "Processing Instagram text message:",
    JSON.stringify(
      {
        senderId: message.senderId,
        recipientId: message.recipientId,
        messageId: message.messageId,
        timestamp: message.timestamp,
        text: message.text,
      },
      null,
      2,
    ),
  );

  const chunks = await searchRelevantChunks(message.text, 5);
  const aiReply = await generateReply({
    userMessage: message.text,
    chunks,
  });

  console.log(
    "Generated Instagram reply:",
    JSON.stringify(
      {
        messageId: message.messageId,
        chunks: chunks.map((chunk) => ({
          id: chunk.id,
          source: chunk.source,
          page: chunk.page,
        })),
        aiReply,
      },
      null,
      2,
    ),
  );

  await sendInstagramMessage({
    recipientId: message.senderId,
    text: aiReply,
  });
}
