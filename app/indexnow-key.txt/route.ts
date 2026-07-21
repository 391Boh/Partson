import { createAiTextResponse } from "app/lib/ai-discovery";

export const dynamic = "force-dynamic";

const readIndexNowKey = () => (process.env.INDEXNOW_KEY || "").trim();

export function GET() {
  const key = readIndexNowKey();
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
    return new Response("Not configured\n", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  const response = createAiTextResponse(key);
  response.headers.set("Cache-Control", "public, max-age=300, s-maxage=3600");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
