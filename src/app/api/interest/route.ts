import { interestBuckets } from "@/lib/topics/classify";
import { bucketLabel } from "@/lib/topics/buckets";
import { failure, interestSchema, readBody, success } from "@/lib/game/http";

export const runtime = "nodejs";

// ★ CORE-SAFE-11: the interest text goes to the embeddings API only. It is
// never logged, stored, or passed to an LLM; only bucket IDs come back.
export async function POST(request: Request) {
  try {
    const { text } = interestSchema.parse(await readBody(request, 90));
    const buckets = await interestBuckets(text);
    return success({ buckets: buckets.map(id => ({ id, label: bucketLabel(id) })) });
  } catch (error) {
    return failure(error);
  }
}
