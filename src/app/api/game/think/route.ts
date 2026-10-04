import { think } from "@/lib/game/engine";
import { failure, profileFrom, readBody, success, thinkSchema } from "@/lib/game/http";

export const runtime = "nodejs";
export const maxDuration = 30;

// Venn thinks after each reveal, while you read. 7-second internal deadline;
// it always returns a commitment.
export async function POST(request: Request) {
  try {
    const body = thinkSchema.parse(await readBody(request));
    return success(await think({ token: body.token, profile: profileFrom(body.profile), deadline: 7000 }));
  } catch (error) {
    return failure(error);
  }
}
