import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./login-redirect";

describe("login return destination", () => {
  it.each([null, undefined, ["/wall"], "https://evil.test", "//evil.test", "/a/..//evil.test", "/\\evil.test", "/\nevil.test", "/login", "/a/../login", "/api/auth/logout"])("rejects an unsafe destination: %s", (input) => {
    expect(safeReturnTo(input)).toBe("/");
  });
  it("retains a local path, query and fragment", () => {
    expect(safeReturnTo("/infra/logs?source=pm2#latest")).toBe("/infra/logs?source=pm2#latest");
  });
});
