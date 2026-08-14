import { expect, test } from "bun:test";

import { ScopedMcpClient } from "../../src/mcp/ScopedMcpClient";
import { LocalYashClient } from "../../src/protocol/local";

test("permits an operation under an allowed root", async () => {
  const client = new LocalYashClient();
  await client.exec("mkdir work");
  await client.exec("echo hi > work/note.md");
  const scoped = new ScopedMcpClient(client, config(["/home/root/work"]));
  const result = await scoped.operation({
    name: "read",
    path: "/home/root/work/note.md",
  });
  expect(result.stdout).toBe("hi");
  await client.close();
});

test("rejects an operation outside the allowed roots", async () => {
  const client = new LocalYashClient();
  const scoped = new ScopedMcpClient(client, config(["/home/root/work"]));
  await expect(
    scoped.operation({ name: "read", path: "/home/root/secrets.md" }),
  ).rejects.toThrow("Path outside allowed roots");
  await client.close();
});

test("rejects a capture whose source is outside the allowed roots", async () => {
  const client = new LocalYashClient();
  const scoped = new ScopedMcpClient(client, config(["/home/root/work"]));
  await expect(
    scoped.operation({
      name: "capture",
      source: "/home/root/other",
      artifact: "/home/root/work/out",
    }),
  ).rejects.toThrow("Path outside allowed roots");
  await client.close();
});

test("rejects a diff whose either side is outside the allowed roots", async () => {
  const client = new LocalYashClient();
  const scoped = new ScopedMcpClient(client, config(["/home/root/work"]));
  await expect(
    scoped.operation({
      name: "diff",
      left: "/home/root/work/a.md",
      right: "/home/root/other/b.md",
    }),
  ).rejects.toThrow("Path outside allowed roots");
  await client.close();
});

test("rejects a .. traversal that would resolve outside the root", async () => {
  const client = new LocalYashClient();
  const scoped = new ScopedMcpClient(client, config(["/home/root/work"]));
  await expect(
    scoped.operation({
      name: "read",
      path: "/home/root/work/../secrets.md",
    }),
  ).rejects.toThrow("Path outside allowed roots");
  await client.close();
});

test("does not treat a sibling with a shared prefix as under the root", async () => {
  const client = new LocalYashClient();
  const scoped = new ScopedMcpClient(client, config(["/home/root/work"]));
  await expect(
    scoped.operation({ name: "read", path: "/home/root/work2/note.md" }),
  ).rejects.toThrow("Path outside allowed roots");
  await client.close();
});

test("rejects yafs.query entirely", async () => {
  const client = new LocalYashClient();
  const scoped = new ScopedMcpClient(client, config(["/home/root"]));
  await expect(scoped.execute("cat foo")).rejects.toThrow(
    "yafs.query is not permitted",
  );
  await client.close();
});

test("enforces a call-count budget", async () => {
  const client = new LocalYashClient();
  const scoped = new ScopedMcpClient(client, {
    ...config(["/home/root"]),
    maxCalls: 1,
  });
  await scoped.operation({ name: "list", path: "/home/root" });
  await expect(
    scoped.operation({ name: "list", path: "/home/root" }),
  ).rejects.toThrow("Tool call budget exceeded");
  await client.close();
});

test("enforces a deadline", async () => {
  const client = new LocalYashClient();
  let now = 1000;
  const scoped = new ScopedMcpClient(
    client,
    { ...config(["/home/root"]), deadlineMs: 10 },
    () => now,
  );
  now += 20;
  await expect(
    scoped.operation({ name: "list", path: "/home/root" }),
  ).rejects.toThrow("Tool call deadline exceeded");
  await client.close();
});

test("truncates a result exceeding the byte budget", async () => {
  const client = new LocalYashClient();
  await client.exec("echo 0123456789 > big.txt");
  const scoped = new ScopedMcpClient(client, {
    ...config(["/home/root"]),
    maxResultBytes: 5,
  });
  const result = await scoped.operation({
    name: "read",
    path: "/home/root/big.txt",
  });
  expect(result.stdout).toBe(
    "01234\n[truncated: result exceeded 5-byte tool budget]",
  );
  await client.close();
});

test("logs a budget/scope rejection instead of only returning it to the caller", async () => {
  const client = new LocalYashClient();
  const scoped = new ScopedMcpClient(client, config(["/home/root/work"]));
  const errors = await capturedErrors(() =>
    scoped
      .operation({ name: "read", path: "/home/root/secrets.md" })
      .catch(() => undefined),
  );
  expect(errors.some((args) => String(args[0]).includes("Path outside"))).toBe(
    true,
  );
  await client.close();
});

async function capturedErrors(run: () => Promise<unknown>) {
  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    await run();
  } finally {
    console.error = originalError;
  }
  return errors;
}

function config(roots: string[]) {
  return { roots, maxResultBytes: 20_000, maxCalls: 20, deadlineMs: 60_000 };
}
