type SendInstagramMessageInput = {
  recipientId: string;
  text: string;
};

const GRAPH_API_VERSION = "v23.0";

export async function sendInstagramMessage({
  recipientId,
  text,
}: SendInstagramMessageInput): Promise<void> {
  if (process.env.INSTAGRAM_SEND_ENABLED !== "true") {
    console.log(
      "Instagram send disabled. Reply preview:",
      JSON.stringify({ recipientId, text }, null, 2),
    );
    return;
  }

  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("META_ACCESS_TOKEN is not configured");
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages?access_token=${accessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    },
  );

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Instagram send failed: ${response.status} ${response.statusText} ${responseBody}`,
    );
  }
}
