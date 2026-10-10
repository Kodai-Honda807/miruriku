import { describe, expect, it } from "vitest";

import {
  MAX_URL_LENGTH,
  httpUrlSchema,
  isHttpUrl,
  optionalHttpUrlSchema,
  parseHttpUrl,
  safeExternalHref,
} from "./url";

describe("parseHttpUrl / isHttpUrl", () => {
  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "ftp://example.com/file",
    "mailto:info@example.com",
    "vbscript:msgbox(1)",
    "/relative/path",
    "relative/path",
    "//example.com/protocol-relative",
    "https://user:pass@example.com/",
    "https://user@example.com/",
    "https://:pass@example.com/",
    "http://",
    "https://",
    "",
    "   ",
    "not a url",
  ])("拒否: %j", (input) => {
    expect(parseHttpUrl(input)).toBeNull();
    expect(isHttpUrl(input)).toBe(false);
  });

  it("null / undefined / 文字列以外は拒否", () => {
    expect(parseHttpUrl(null)).toBeNull();
    expect(parseHttpUrl(undefined)).toBeNull();
    expect(parseHttpUrl(123 as unknown as string)).toBeNull();
  });

  it.each(["http://example.com", "https://example.com/path?q=1#frag", "https://example.org:8443/a", "  https://example.com/  "])(
    "許可: %j",
    (input) => {
      expect(parseHttpUrl(input)).toBeInstanceOf(URL);
      expect(isHttpUrl(input)).toBe(true);
    },
  );

  it(`${MAX_URL_LENGTH} 文字までは許可し、それを超えると拒否`, () => {
    const prefix = "https://example.com/";
    const atLimit = prefix + "a".repeat(MAX_URL_LENGTH - prefix.length);
    expect(atLimit).toHaveLength(MAX_URL_LENGTH);
    expect(isHttpUrl(atLimit)).toBe(true);
    expect(isHttpUrl(atLimit + "a")).toBe(false);
  });
});

describe("safeExternalHref", () => {
  it("正規化した href を返す", () => {
    expect(safeExternalHref("https://EXAMPLE.com")).toBe("https://example.com/");
    expect(safeExternalHref("  https://example.com/a b  ")).toBe("https://example.com/a%20b");
  });

  it("使えない URL は null（リンクを出さない）", () => {
    expect(safeExternalHref("javascript:alert(1)")).toBeNull();
    expect(safeExternalHref("data:text/html,x")).toBeNull();
    expect(safeExternalHref("/admin")).toBeNull();
    expect(safeExternalHref(null)).toBeNull();
    expect(safeExternalHref(undefined)).toBeNull();
  });
});

describe("httpUrlSchema", () => {
  it("http(s) を受け付けて正規化する", () => {
    expect(httpUrlSchema.parse(" https://Example.com/x ")).toBe("https://example.com/x");
  });

  it("http(s) 以外・長すぎる URL を拒否する", () => {
    expect(httpUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(httpUrlSchema.safeParse("ftp://example.com").success).toBe(false);
    expect(httpUrlSchema.safeParse(`https://example.com/${"a".repeat(MAX_URL_LENGTH)}`).success).toBe(false);
    expect(httpUrlSchema.safeParse("").success).toBe(false);
  });
});

describe("optionalHttpUrlSchema", () => {
  it("空文字・空白のみ・null・undefined は null", () => {
    expect(optionalHttpUrlSchema.parse("")).toBeNull();
    expect(optionalHttpUrlSchema.parse("   ")).toBeNull();
    expect(optionalHttpUrlSchema.parse(null)).toBeNull();
    expect(optionalHttpUrlSchema.parse(undefined)).toBeNull();
  });

  it("有効な URL は正規化した文字列", () => {
    expect(optionalHttpUrlSchema.parse("https://example.com")).toBe("https://example.com/");
  });

  it("不正な URL はエラー", () => {
    expect(optionalHttpUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(optionalHttpUrlSchema.safeParse("mailto:a@example.com").success).toBe(false);
  });
});
