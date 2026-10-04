import { startGame } from "@/lib/game/engine";
import { failure, profileFrom, readBody, startSchema, success } from "@/lib/game/http";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = startSchema.parse(await readBody(request));
    return success(await startGame({ mode: body.mode, difficulty: body.difficulty, day: body.day, profile: profileFrom(body.profile), stated: body.stated }));
  } catch (error) {
    return failure(error);
  }
}
