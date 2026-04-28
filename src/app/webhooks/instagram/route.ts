import { NextRequest, NextResponse } from "next/server";

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

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
  try {
    const body = await request.json();

    console.log("Instagram webhook event received:", {
      receivedAt: new Date().toISOString(),
      body,
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to read Instagram webhook event:", error);

    return NextResponse.json(
      { error: "Invalid webhook payload" },
      { status: 400 },
    );
  }
}
