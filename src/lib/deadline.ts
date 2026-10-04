// Bound the whole SDK operation, including tool execution and response parsing.
// An abort signal alone is insufficient if a transport/tool ignores cancellation.
export async function withDeadline<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("Model operation timed out.");
      error.name = "TimeoutError";
      controller.abort(error);
      reject(error);
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), expired]);
  } finally {
    clearTimeout(timer!);
  }
}
