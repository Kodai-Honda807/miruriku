import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStaticServer, loadViewerRequestHandler } from "./serve-static.mjs";

type CfRequest = { uri: string; headers: { host?: { value: string } }; rawQueryString?: () => string | undefined };
type CfResponse = { statusCode: number; headers: Record<string, { value: string }> };

const handler = loadViewerRequestHandler() as (event: { request: CfRequest }) => CfRequest | CfResponse;

function run(uri: string, { host = "miruriku.com", query }: { host?: string; query?: string } = {}) {
  return handler({ request: { uri, headers: { host: { value: host } }, rawQueryString: () => query } });
}

describe("CloudFront Functions（deploy/static/viewer-request.js）", () => {
  it("末尾が / のパスは index.html を返す", () => {
    expect(run("/")).toMatchObject({ uri: "/index.html" });
    expect(run("/events/hakone-2026/")).toMatchObject({ uri: "/events/hakone-2026/index.html" });
  });

  it("拡張子のないパスは末尾に / を付けて 301。クエリは受け取ったまま引き継ぐ", () => {
    expect(run("/events/hakone-2026")).toMatchObject({
      statusCode: 301,
      headers: { location: { value: "/events/hakone-2026/" } },
    });
    expect(run("/events/hakone-2026", { query: "q=%E9%A7%85%E4%BC%9D" })).toMatchObject({
      headers: { location: { value: "/events/hakone-2026/?q=%E9%A7%85%E4%BC%9D" } },
    });
  });

  it("拡張子のあるファイルはそのまま", () => {
    for (const uri of ["/sitemap.xml", "/_next/static/chunks/a.js", "/events/x/__next._tree.txt", "/favicon.ico"]) {
      expect(run(uri)).toMatchObject({ uri });
    }
  });

  it("www 付きのホストは www なしへ 301（パスとクエリはそのまま）", () => {
    expect(run("/events/x/", { host: "www.miruriku.com", query: "period=week&category=ekiden" })).toMatchObject({
      statusCode: 301,
      headers: { location: { value: "https://miruriku.com/events/x/?period=week&category=ekiden" } },
    });
    expect(run("/", { host: "WWW.miruriku.com" })).toMatchObject({
      headers: { location: { value: "https://miruriku.com/" } },
    });
  });

  it("CloudFront の配布ドメイン（*.cloudfront.net）でもそのまま動く", () => {
    expect(run("/", { host: "d111111abcdef8.cloudfront.net" })).toMatchObject({ uri: "/index.html" });
  });

  it("rawQueryString が無い環境（コンソールのテストなど）でも動く", () => {
    const result = handler({ request: { uri: "/events/x", headers: {} } }) as CfResponse;
    expect(result.headers.location.value).toBe("/events/x/");
  });
});

describe("ローカルの静的サーバー", () => {
  let dir: string;
  let base: string;
  let close: () => void;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "miruriku-static-"));
    mkdirSync(path.join(dir, "events/a"), { recursive: true });
    writeFileSync(path.join(dir, "index.html"), "<p>top</p>");
    writeFileSync(path.join(dir, "events/a/index.html"), "<p>a</p>");
    writeFileSync(path.join(dir, "404.html"), "<p>not found</p>");
    writeFileSync(path.join(dir, "sitemap.xml"), "<urlset/>");
    const server = createStaticServer(dir);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });

  afterAll(() => {
    close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("index.html・ファイルを返し、無いものは 404.html を 404 で返す", async () => {
    expect(await (await fetch(`${base}/?period=week`)).text()).toBe("<p>top</p>");
    expect(await (await fetch(`${base}/events/a/`)).text()).toBe("<p>a</p>");
    const xml = await fetch(`${base}/sitemap.xml`);
    expect(xml.headers.get("content-type")).toBe("application/xml");
    const missing = await fetch(`${base}/events/missing/`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("<p>not found</p>");
  });

  it("末尾の / がなければ 301、ディレクトリの外は読めない", async () => {
    const res = await fetch(`${base}/events/a`, { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/events/a/");
    expect((await fetch(`${base}/..%2F..%2Fetc%2Fpasswd`)).status).toBe(404);
  });
});
