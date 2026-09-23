/** Only return to a local page; never let a login URL send the browser elsewhere. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (/[\\\x00-\x20]/.test(value)) return "/";
  const url = new URL(value, "https://cockpit.invalid");
  if (url.origin !== "https://cockpit.invalid" || url.pathname.startsWith("//") || url.pathname === "/login" || url.pathname.startsWith("/api/auth/")) {
    return "/";
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
