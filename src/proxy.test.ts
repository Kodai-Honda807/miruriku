import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NOT_FOUND_REWRITE_PATH, config, handleProxy, proxy } from "./proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

const request = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));

/** 大会詳細の判定に DB を使わないための差し替え */
const neverPublished = { isPublished: vi.fn(async () => false) };

describe("proxy（/admin の多層防御）", () => {
  it.each([
    { NODE_ENV: "production", MIRURIKU_ADMIN_ENABLED: "true" },
    { NODE_ENV: "development", MIRURIKU_ADMIN_ENABLED: undefined },
    { NODE_ENV: "development", MIRURIKU_ADMIN_ENABLED: "TRUE" },
  ])("管理機能が無効なら 404（$NODE_ENV / $MIRURIKU_ADMIN_ENABLED）", async ({ NODE_ENV, MIRURIKU_ADMIN_ENABLED }) => {
    vi.stubEnv("NODE_ENV", NODE_ENV);
    vi.stubEnv("MIRURIKU_ADMIN_ENABLED", MIRURIKU_ADMIN_ENABLED);
    const response = await proxy(request("/admin/candidates"));
    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(await response.text()).toBe("Not Found");
  });

  it("管理機能が有効なら通過させる", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MIRURIKU_ADMIN_ENABLED", "true");
    const response = await proxy(request("/admin"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["/admin", "/admin/", "/admin/events", "/admin/events/abc/slots/new", "/admin/candidates/x", "/api/admin", "/api/admin/x"])(
    "%s に適用される",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    },
  );

  it.each(["/", "/events", "/events/demo-city-marathon/extra", "/administrator", "/api/events", "/_next/static/chunk.js"])(
    "%s には適用されない",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    },
  );
});

describe("proxy（大会詳細の 404）", () => {
  it("/events/[slug] に適用される", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/events/demo-city-marathon" })).toBe(true);
  });

  it("公開中の大会なら通過させる", async () => {
    const isPublished = vi.fn(async () => true);
    const response = await handleProxy(request("/events/demo-city-marathon"), { isPublished });
    expect(isPublished).toHaveBeenCalledWith("demo-city-marathon");
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("下書き・存在しない slug は not-found ページへ rewrite する", async () => {
    const response = await handleProxy(request("/events/demo-draft-ekiden"), neverPublished);
    expect(response.headers.get("x-middleware-rewrite")).toBe(`http://localhost:3000${NOT_FOUND_REWRITE_PATH}`);
  });

  it("不正なエンコードの slug も not-found", async () => {
    const response = await handleProxy(request("/events/%E0%A4%A"), neverPublished);
    expect(response.headers.get("x-middleware-rewrite")).toContain(NOT_FOUND_REWRITE_PATH);
  });

  it("DB に接続できない場合は判定せず素通しする（ページ側のエラー表示に任せる）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleProxy(request("/events/demo-city-marathon"), {
      isPublished: async () => {
        throw new Error("connection refused");
      },
    });
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("管理機能が無効でも公開ページの判定には影響しない", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await handleProxy(request("/events/demo-city-marathon"), { isPublished: async () => true });
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
