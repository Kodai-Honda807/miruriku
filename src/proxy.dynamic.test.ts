import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { config, proxy } from "./proxy.dynamic";

afterEach(() => {
  vi.unstubAllEnvs();
});

const request = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));

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

  it.each(["/", "/events", "/events/demo-city-marathon", "/events/demo-city-marathon/extra", "/administrator", "/api/events", "/_next/static/chunk.js"])(
    "%s には適用されない",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    },
  );
});
