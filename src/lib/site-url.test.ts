import { describe, expect, it } from "vitest";

import { absoluteUrl, getSiteUrl } from "./site-url";

describe("getSiteUrl", () => {
  it("https のオリジンを返す（末尾のスラッシュやパスはオリジンに揃える）", () => {
    expect(getSiteUrl({ MIRURIKU_SITE_URL: "https://example.com/" })?.toString()).toBe("https://example.com/");
    expect(getSiteUrl({ MIRURIKU_SITE_URL: " https://example.com/foo " })?.toString()).toBe("https://example.com/");
  });

  it("未設定・不正・http（localhost 以外）・認証情報付きは null", () => {
    expect(getSiteUrl({})).toBeNull();
    expect(getSiteUrl({ MIRURIKU_SITE_URL: "" })).toBeNull();
    expect(getSiteUrl({ MIRURIKU_SITE_URL: "not a url" })).toBeNull();
    expect(getSiteUrl({ MIRURIKU_SITE_URL: "http://example.com" })).toBeNull();
    expect(getSiteUrl({ MIRURIKU_SITE_URL: "javascript:alert(1)" })).toBeNull();
    expect(getSiteUrl({ MIRURIKU_SITE_URL: "https://u:p@example.com" })).toBeNull();
    expect(getSiteUrl({ MIRURIKU_SITE_URL: "https://example.com/?a=1" })).toBeNull();
  });

  it("ローカル確認用に http://localhost は許可する", () => {
    expect(getSiteUrl({ MIRURIKU_SITE_URL: "http://localhost:3000" })?.toString()).toBe("http://localhost:3000/");
  });
});

describe("absoluteUrl", () => {
  it("サイト URL を基準に絶対 URL を作る。未設定なら null", () => {
    const site = new URL("https://example.com");
    expect(absoluteUrl("/events/a", site)).toBe("https://example.com/events/a");
    expect(absoluteUrl("/", null)).toBeNull();
  });
});
