import { move } from "@/lib/game/engine";
import { failure, moveSchema, profileFrom, readBody, success } from "@/lib/game/http";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = moveSchema.parse(await readBody(request));
    return success(await move({ token: body.token, move: body.move, profile: profileFrom(body.profile) }));
  } catch (error) {
    return failure(error);
  }
}
