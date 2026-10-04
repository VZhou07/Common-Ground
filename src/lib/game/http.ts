// Route-handler helpers. Endpoints accept game actions, never prompts.
import { z } from "zod";
import { isBucket } from "../topics/buckets";
import { parseProfile } from "../model/profile";

export class UserError extends Error {}

// ★ CORE-SAFE-10: best-effort per-instance, per-IP rate limit and a hard
// body-size cap. (Hosting-level limits are still needed at scale.)
const counters = new Map<string, { count: number; until: number }>();
export async function readBody(request: Request, limit = 40): Promise<unknown> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  if (counters.size > 2000) for (const [k, v] of counters) if (v.until < now) counters.delete(k);
  const cur = counters.get(ip);
  if (cur && cur.until > now && cur.count >= limit) throw new UserError("A few too many requests. Try again in a minute.");
  counters.set(ip, cur && cur.until > now ? { ...cur, count: cur.count + 1 } : { count: 1, until: now + 60_000 });
  const raw = await request.text();
  if (raw.length > 150_000) throw new UserError("This request is too large.");
  try { return JSON.parse(raw); } catch { throw new UserError("The request format is invalid."); }
}

const bucketList = z.array(z.string().max(20)).max(2).transform(xs => xs.filter(isBucket));
export const startSchema = z.object({
  mode: z.enum(["daily", "unlimited"]),
  difficulty: z.enum(["easy", "normal", "hard"]),
  day: z.string().max(10).optional(),
  stated: bucketList.default([]),
  profile: z.unknown().optional(),
}).strict();
export const thinkSchema = z.object({ token: z.string().max(100_000), profile: z.unknown().optional() }).strict();
export const moveSchema = z.object({ token: z.string().max(100_000), move: z.string().min(1).max(200), profile: z.unknown().optional() }).strict();
export const interestSchema = z.object({ text: z.string().max(30) }).strict();

export const profileFrom = (raw: unknown) => parseProfile(raw);

export function failure(error: unknown) {
  const message = error instanceof UserError ? error.message
    : error instanceof z.ZodError ? "The request format is invalid."
    : error instanceof Error && /token|profile|playable|deciding|over|step back|pairs|Unknown pair/i.test(error.message) ? error.message
    : "Something went wrong. Try again.";
  if (!(error instanceof UserError) && !(error instanceof z.ZodError)) console.error(error);
  return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
}
export const success = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store" } });
