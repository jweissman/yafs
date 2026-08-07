type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function sseFetch(chunks: string[]): Fetch {
  return async () => sse(chunks);
}

export function sse(chunks: string[]) {
  return new Response(sseStream(chunks), {
    headers: { "content-type": "text/event-stream" },
  });
}

function sseStream(chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(event(chunk)));
        await Promise.resolve();
      }
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

function event(content: string) {
  const payload = JSON.stringify({ choices: [{ delta: { content } }] });
  return `data: ${payload}\n\n`;
}
