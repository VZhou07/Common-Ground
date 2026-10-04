// A fake Anthropic Messages API at the HTTP level, so the real AI SDK code
// path (request building, tool loop, response parsing) runs in tests.
export type Reply =
  | { toolUse: { name: string; input: unknown } }
  | { text: string }
  | { status: number }
  | { hang: true };

export function fakeAnthropic(replies: Reply[]) {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  let i = 0;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    requests.push({ url: String(url), body });
    const reply = replies[Math.min(i++, replies.length - 1)];
    if ("hang" in reply) {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" })));
      });
    }
    if ("status" in reply) return new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "boom" } }), { status: reply.status, headers: { "content-type": "application/json" } });
    const content = "toolUse" in reply
      ? [{ type: "tool_use", id: `toolu_${i}`, name: reply.toolUse.name, input: reply.toolUse.input }]
      : [{ type: "text", text: reply.text }];
    return new Response(JSON.stringify({
      id: `msg_${i}`, type: "message", role: "assistant", model: body.model, content,
      stop_reason: "toolUse" in reply ? "tool_use" : "end_turn", stop_sequence: null,
      usage: { input_tokens: 120, output_tokens: 40 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetcher, requests };
}
