import { describe, expect, it } from "vitest";

import { CollectorError } from "./errors";
import { assertFetchableUrl, isSameSiteHost } from "./url-policy";

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof CollectorError ? error.code : "NOT_COLLECTOR_ERROR";
  }
}

describe("assertFetchableUrl", () => {
  it("http / https の通常の URL は許可し、フラグメントを除く", () => {
    expect(assertFetchableUrl("https://www.example.org/news/broadcast?x=1#top").href).toBe(
      "https://www.example.org/news/broadcast?x=1",
    );
    expect(assertFetchableUrl("http://example.com/").href).toBe("http://example.com/");
    // 既定ポートの明示は許可（URL 上は省略される）
    expect(assertFetchableUrl("https://example.com:443/a").href).toBe("https://example.com/a");
    expect(assertFetchableUrl("http://example.com:80/a").href).toBe("http://example.com/a");
    // 公開 IP のリテラルは許可
    expect(assertFetchableUrl("http://93.184.215.14/").hostname).toBe("93.184.215.14");
  });

  it.each([
    ["javascript:alert(1)", "UNSUPPORTED_SCHEME"],
    ["file:///etc/passwd", "UNSUPPORTED_SCHEME"],
    ["ftp://example.com/", "UNSUPPORTED_SCHEME"],
    ["data:text/html,<p>x</p>", "UNSUPPORTED_SCHEME"],
    ["gopher://example.com/", "UNSUPPORTED_SCHEME"],
    ["not a url", "INVALID_URL"],
    ["", "INVALID_URL"],
    ["https://user:pass@example.com/", "CREDENTIALS_IN_URL"],
    ["https://user@example.com/", "CREDENTIALS_IN_URL"],
    ["https://example.com:8443/", "PORT_NOT_ALLOWED"],
    ["http://example.com:443/", "PORT_NOT_ALLOWED"],
    ["https://example.com:80/", "PORT_NOT_ALLOWED"],
    ["http://localhost/", "BLOCKED_HOST"],
    ["http://LOCALHOST./", "BLOCKED_HOST"],
    ["http://app.localhost/", "BLOCKED_HOST"],
    ["http://printer.local/", "BLOCKED_HOST"],
    ["http://service.internal/", "BLOCKED_HOST"],
    ["http://metadata.google.internal/computeMetadata/v1/", "BLOCKED_HOST"],
    ["http://metadata/", "BLOCKED_HOST"],
    ["http://metadata.example.com/", "BLOCKED_HOST"],
    ["http://instance-data/latest/", "BLOCKED_HOST"],
    ["http://intranet/", "BLOCKED_HOST"],
    ["http://router.home.arpa/", "BLOCKED_HOST"],
    ["http://127.0.0.1/", "BLOCKED_ADDRESS"],
    ["http://2130706433/", "BLOCKED_ADDRESS"], // 127.0.0.1 の 10 進表記
    ["http://0x7f.1/", "BLOCKED_ADDRESS"],
    ["http://169.254.169.254/latest/meta-data/", "BLOCKED_ADDRESS"],
    ["http://10.1.2.3/", "BLOCKED_ADDRESS"],
    ["http://[::1]/", "BLOCKED_ADDRESS"],
    ["http://[::ffff:127.0.0.1]/", "BLOCKED_ADDRESS"],
    ["http://[fd00:ec2::254]/", "BLOCKED_ADDRESS"],
    ["http://0.0.0.0/", "BLOCKED_ADDRESS"],
  ])("%s を拒否する（%s）", (url, code) => {
    expect(codeOf(() => assertFetchableUrl(url))).toBe(code);
  });
});

describe("isSameSiteHost", () => {
  it("先頭の www. の違いだけを許容する", () => {
    expect(isSameSiteHost("example.com", "www.example.com")).toBe(true);
    expect(isSameSiteHost("WWW.Example.com.", "example.com")).toBe(true);
    expect(isSameSiteHost("example.com", "news.example.com")).toBe(false);
    expect(isSameSiteHost("example.com", "example.org")).toBe(false);
    expect(isSameSiteHost("example.com", "evil-example.com")).toBe(false);
  });
});
