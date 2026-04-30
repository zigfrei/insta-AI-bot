export type InstagramTextMessage = {
  senderId: string;
  recipientId?: string;
  messageId: string;
  text: string;
  timestamp?: number;
};

type InstagramMessagingEvent = {
  sender?: { id?: unknown };
  recipient?: { id?: unknown };
  timestamp?: unknown;
  message?: {
    mid?: unknown;
    text?: unknown;
    is_echo?: unknown;
  };
  read?: unknown;
  delivery?: unknown;
};

type InstagramWebhookPayload = {
  entry?: Array<{
    messaging?: InstagramMessagingEvent[];
  }>;
};

export function parseInstagramWebhook(
  body: unknown,
): InstagramTextMessage[] {
  const messages: InstagramTextMessage[] = [];
  const payload = asInstagramWebhookPayload(body);

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (event.read) {
        console.log("Ignored Instagram read event");
        continue;
      }

      if (event.delivery) {
        console.log("Ignored Instagram delivery event");
        continue;
      }

      if (event.message?.is_echo) {
        console.log("Ignored Instagram echo message");
        continue;
      }

      const senderId = asString(event.sender?.id);
      const recipientId = asString(event.recipient?.id);
      const messageId = asString(event.message?.mid);
      const text = asString(event.message?.text)?.trim();
      const timestamp = asNumber(event.timestamp);

      if (!senderId || !messageId || !text) {
        console.log("Ignored Instagram event without message.text");
        continue;
      }

      messages.push({
        senderId,
        recipientId,
        messageId,
        text,
        timestamp,
      });
    }
  }

  return messages;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asInstagramWebhookPayload(body: unknown): InstagramWebhookPayload {
  if (!body || typeof body !== "object") {
    return {};
  }

  return body as InstagramWebhookPayload;
}
