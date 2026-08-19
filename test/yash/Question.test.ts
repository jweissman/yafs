import { expect, spyOn, test } from "bun:test";
import { createInterface } from "node:readline/promises";

import { question } from "../../src/yash/question";

function fakeReadline(
  answer: () => Promise<string>,
): ReturnType<typeof createInterface> {
  return { question: answer } as unknown as ReturnType<typeof createInterface>;
}

test("question returns the typed answer", async () => {
  const readline = fakeReadline(() => Promise.resolve("hello"));
  const answer = await question(readline, "> ", new AbortController());
  expect(answer).toBe("hello");
});

test("an aborted question resolves to undefined without logging anything", async () => {
  const interruption = new AbortController();
  interruption.abort();
  const readline = fakeReadline(() => Promise.reject(new Error("aborted")));
  const spy = spyOn(console, "error").mockImplementation(() => undefined);
  try {
    expect(await question(readline, "> ", interruption)).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

test("a rejecting (non-abort) question logs and resolves to undefined, not throw", async () => {
  const readline = fakeReadline(() => Promise.reject(new Error("boom")));
  const spy = spyOn(console, "error").mockImplementation(() => undefined);
  try {
    expect(
      await question(readline, "> ", new AbortController()),
    ).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("boom");
  } finally {
    spy.mockRestore();
  }
});

test("a synchronously throwing question logs and resolves to undefined, not crash", async () => {
  const readline = {
    question: () => {
      throw new Error("sync failure");
    },
  } as unknown as ReturnType<typeof createInterface>;
  const spy = spyOn(console, "error").mockImplementation(() => undefined);
  try {
    expect(
      await question(readline, "> ", new AbortController()),
    ).toBeUndefined();
    expect(spy.mock.calls[0][0]).toContain("sync failure");
  } finally {
    spy.mockRestore();
  }
});
