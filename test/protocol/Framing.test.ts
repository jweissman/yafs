import { expect, test } from "bun:test";
import {
  attachLines,
  parseRequest,
  persistenceFailure,
  requestFailure,
  respond,
} from "../../src/protocol/Framing";
import type { ExecutionResult } from "../../src/types/ExecutionResult";

test("framing helpers validate protocol input and report version mismatches", () => {
  expect(() => parseRequest("{")).toThrow();
  expect(requestFailure(new Error("no"))).toBeUndefined();
  expect(persistenceFailure(3, "disk").error.code).toBe("persistence_error");
  assertSocketWrite();
  assertVersionMismatch();
});

function assertSocketWrite() {
  const writes: string[] = [];
  const socket = {
    destroyed: false,
    write: (value: string) => writes.push(value),
    on: () => undefined,
  };
  const result: ExecutionResult = {
    stdout: "",
    stderr: "",
    status: 0,
    session: { user: "root", cwd: "/" },
  };
  respond(socket as never, { version: 1, id: 1, result });
  attachLines(socket as never, () => undefined);
  expect(writes[0]).toContain('"id":1');
}

function assertVersionMismatch() {
  try {
    parseRequest('{"version":2,"id":1,"command":"pwd"}');
  } catch (error) {
    expect(requestFailure(error)).toEqual({
      version: 1,
      id: 1,
      error: {
        code: "unsupported_version",
        message: "Unsupported protocol version: 2",
      },
    });
  }
}
