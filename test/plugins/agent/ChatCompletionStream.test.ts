import { expect, test } from "bun:test";

import { readStream } from "../../../src/plugins/agent/ChatCompletionStream";

test("a malformed SSE data line is ignored rather than throwing", async () => {
  const body = rawSse(["data: not-json\n\n", "data: [DONE]\n\n"]);
  const result = await readStream(body);
  expect(result.full).toBe("");
});

function rawSse(chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => {
        controller.enqueue(new TextEncoder().encode(chunk));
      });
      controller.close();
    },
  });
}
