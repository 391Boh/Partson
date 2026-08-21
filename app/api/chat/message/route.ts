import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, setRateLimitHeaders } from "app/api/_lib/rateLimit";
import { readJsonObject } from "app/api/_lib/requestValidation";
import { createChatMessageServer, type ChatMessageType } from "app/lib/chat-message";

const readString = (source: Record<string, unknown>, key: string, max = 500) => {
  const value = source[key];
  return typeof value === "string" ? value.trim().slice(0, max) : "";
};

const readMessageType = (source: Record<string, unknown>): ChatMessageType | null => {
  const type = readString(source, "type", 40);
  if (type === "text" || type === "image") return type;
  return null;
};

export async function POST(req: NextRequest) {
  const rateResult = checkRateLimit({
    req,
    key: "chat:message",
    limit: 25,
    windowMs: 60_000,
  });

  if (!rateResult.ok) {
    const limited = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    setRateLimitHeaders(limited.headers, rateResult);
    return limited;
  }

  const bodyResult = await readJsonObject(req, { maxBytes: 1_100_000 });
  if (!bodyResult.ok) {
    const badBody = NextResponse.json(
      { error: bodyResult.error },
      { status: bodyResult.status }
    );
    setRateLimitHeaders(badBody.headers, rateResult);
    return badBody;
  }

  const body = bodyResult.value;
  const userId = readString(body, "userId", 160);
  const text = readString(body, "text", 1200);
  const type = readMessageType(body);
  const clientMessageId = readString(body, "clientMessageId", 120);

  if (!userId || !type || !text) {
    const invalid = NextResponse.json(
      { error: "Invalid chat message payload" },
      { status: 400 }
    );
    setRateLimitHeaders(invalid.headers, rateResult);
    return invalid;
  }

  let imageUrl = "";
  let imageName = "";
  if (type === "image") {
    imageUrl = readString(body, "imageUrl", 950_000);
    imageName = readString(body, "imageName", 180) || "Фото";

    if (!imageUrl.startsWith("data:image/")) {
      const invalidImage = NextResponse.json(
        { error: "Invalid image payload" },
        { status: 400 }
      );
      setRateLimitHeaders(invalidImage.headers, rateResult);
      return invalidImage;
    }
  }

  const result = await createChatMessageServer({
    userId,
    text,
    type,
    imageUrl: imageUrl || undefined,
    imageName: imageName || undefined,
    clientMessageId: clientMessageId || undefined,
  });

  if (!result.ok) {
    const failed = NextResponse.json({ error: result.error }, { status: 500 });
    setRateLimitHeaders(failed.headers, rateResult);
    return failed;
  }

  const response = NextResponse.json({
    success: true,
    id: result.id,
    notificationQueued: true,
  });
  setRateLimitHeaders(response.headers, rateResult);
  return response;
}
