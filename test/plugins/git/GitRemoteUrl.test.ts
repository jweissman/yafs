import { expect, test } from "bun:test";

import {
  gitAuthHeader,
  gitRemoteUrl,
} from "../../../src/plugins/git/GitRemoteUrl";

test("gitRemoteUrl builds a clone URL from the configured host, with no token embedded", () => {
  const url = gitRemoteUrl(
    { apiUrl: "https://api.example.com", webUrl: "https://example.com" },
    "acme/widget",
  );
  expect(url).toBe("https://example.com/acme/widget.git");
});

test("gitAuthHeader is undefined without a configured token", () => {
  const header = gitAuthHeader({
    apiUrl: "https://api.example.com",
    webUrl: "https://example.com",
  });
  expect(header).toBeUndefined();
});

test("gitAuthHeader base64-encodes an x-access-token credential", () => {
  const header = gitAuthHeader({
    apiUrl: "https://api.example.com",
    webUrl: "https://example.com",
    token: "secret",
  });
  const expected = Buffer.from("x-access-token:secret").toString("base64");
  expect(header).toBe(`AUTHORIZATION: basic ${expected}`);
});
