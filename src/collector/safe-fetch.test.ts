/**
 * 安全な HTTP 取得のテスト。外部ネットワークにはアクセスしない
 * （undici の MockAgent で応答を作り、名前解決は差し替えた関数で行う）。
 */
import type { LookupAddress } from "node:dns";

import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGuardedLookup, type ResolveAll } from "./dns-guard";
import { CollectorError } from "./errors";
import { Readable } from "node:stream";

import { createSafeAgent, discardBody, parseContentType, safeFetch, type SafeFetchOptions } from "./safe-fetch";

const PUBLIC_IP = "93.184.215.14";
const publicResolve: ResolveAll = async () => [{ address: PUBLIC_IP, family: 4 }];

let agent: MockAgent;

beforeEach(() => {
  agent = new MockAgent({ enableCallHistory: true });
  agent.disableNetConnect();
});

afterEach(async () => {
  await agent.close();
});

function options(overrides: Partial<SafeFetchOptions> = {}): SafeFetchOptions {
  return {
    dispatcher: agent,
    resolveAll: publicResolve,
    userAgent: "mirurikuBot/test (+https://example.com/bot)",
    accept: "text/html",
    allowedContentTypes: ["text/html", "application/xhtml+xml"],
    maxBytes: 1024,
    ...overrides,
  };
}

const HTML = { "content-type": "text/html; charset=utf-8" };

async function errorOf(promise: Promise<unknown>): Promise<CollectorError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CollectorError) return error;
    throw error;
  }
  throw new Error("例外が発生しませんでした");
}

describe("safeFetch: 通常の取得", () => {
  it("HTML を取得し、Cookie や認証ヘッダーを送らない", async () => {
    agent.get("https://www.example.org").intercept({ path: "/broadcast", method: "GET" }).reply(200, "<p>放送予定</p>", {
      headers: HTML,
    });
    const result = await safeFetch("https://www.example.org/broadcast", options());
    expect(result.status).toBe(200);
    expect(result.url).toBe("https://www.example.org/broadcast");
    expect(result.mimeType).toBe("text/html");
    expect(result.charset).toBe("utf-8");
    expect(new TextDecoder().decode(result.body!)).toBe("<p>放送予定</p>");

    const call = agent.getCallHistory()!.lastCall()!;
    const headers = Object.fromEntries(Object.entries(call.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    expect(headers["user-agent"]).toBe("mirurikuBot/test (+https://example.com/bot)");
    expect(headers["accept-encoding"]).toBe("identity");
    expect(headers).not.toHaveProperty("cookie");
    expect(headers).not.toHaveProperty("authorization");
  });

  it("2xx 以外は本文を読まずにステータスだけ返す", async () => {
    agent.get("https://example.org").intercept({ path: "/missing" }).reply(404, "not found", { headers: HTML });
    const result = await safeFetch("https://example.org/missing", options());
    expect(result.status).toBe(404);
    expect(result.body).toBeNull();
  });

  it("各リクエストの前後でフックを呼ぶ", async () => {
    const pool = agent.get("https://example.org");
    pool.intercept({ path: "/a" }).reply(302, "", { headers: { location: "/b" } });
    pool.intercept({ path: "/b" }).reply(200, "ok", { headers: HTML });
    const before: string[] = [];
    const after: string[] = [];
    await safeFetch(
      "https://example.org/a",
      options({
        beforeRequest: async (url) => {
          before.push(url.pathname);
        },
        afterRequest: (url) => after.push(url.pathname),
      }),
    );
    expect(before).toEqual(["/a", "/b"]);
    expect(after).toEqual(["/a", "/b"]);
  });
});

describe("safeFetch: URL とホストの検査", () => {
  it.each([
    ["ftp://example.org/", "UNSUPPORTED_SCHEME"],
    ["https://user:pw@example.org/", "CREDENTIALS_IN_URL"],
    ["https://example.org:8443/", "PORT_NOT_ALLOWED"],
    ["http://localhost/", "BLOCKED_HOST"],
    ["http://169.254.169.254/latest/meta-data/", "BLOCKED_ADDRESS"],
  ])("%s は名前解決も通信もせずに拒否する（%s）", async (url, code) => {
    const resolveAll = vi.fn(publicResolve);
    const error = await errorOf(safeFetch(url, options({ resolveAll })));
    expect(error.code).toBe(code);
    expect(resolveAll).not.toHaveBeenCalled();
    expect(agent.getCallHistory()!.calls()).toHaveLength(0);
  });

  it("名前解決の結果に 1 つでも禁止範囲のアドレスがあれば拒否する", async () => {
    const resolveAll: ResolveAll = async () => [
      { address: PUBLIC_IP, family: 4 },
      { address: "10.0.0.5", family: 4 },
    ];
    const error = await errorOf(safeFetch("https://example.org/", options({ resolveAll })));
    expect(error.code).toBe("BLOCKED_ADDRESS");
    expect(agent.getCallHistory()!.calls()).toHaveLength(0);
  });

  it.each(["::1", "fd00:ec2::254", "::ffff:169.254.169.254"])("IPv6 の禁止アドレス %s に解決されたら拒否する", async (address) => {
    const resolveAll: ResolveAll = async () => [{ address, family: 6 }];
    const error = await errorOf(safeFetch("https://example.org/", options({ resolveAll })));
    expect(error.code).toBe("BLOCKED_ADDRESS");
  });

  it("名前解決に失敗したら DNS_FAILED", async () => {
    const resolveAll: ResolveAll = async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    };
    const error = await errorOf(safeFetch("https://example.org/", options({ resolveAll })));
    expect(error.code).toBe("DNS_FAILED");
  });
});

describe("safeFetch: リダイレクト", () => {
  it("同一ホスト（www. の有無の違い）へのリダイレクトは追跡する", async () => {
    agent.get("https://example.org").intercept({ path: "/old" }).reply(301, "", {
      headers: { location: "https://www.example.org/new" },
    });
    agent.get("https://www.example.org").intercept({ path: "/new" }).reply(200, "moved", { headers: HTML });
    const result = await safeFetch("https://example.org/old", options());
    expect(result.status).toBe(200);
    expect(result.url).toBe("https://www.example.org/new");
    expect(result.redirects).toEqual(["https://www.example.org/new"]);
  });

  it("http から https への同一ホストのリダイレクトは追跡する", async () => {
    agent.get("http://example.org").intercept({ path: "/" }).reply(301, "", { headers: { location: "https://example.org/" } });
    agent.get("https://example.org").intercept({ path: "/" }).reply(200, "secure", { headers: HTML });
    const result = await safeFetch("http://example.org/", options());
    expect(result.url).toBe("https://example.org/");
  });

  it("他のホストへのリダイレクトは失敗扱い", async () => {
    agent.get("https://example.org").intercept({ path: "/go" }).reply(302, "", {
      headers: { location: "https://other.example.net/page" },
    });
    const error = await errorOf(safeFetch("https://example.org/go", options()));
    expect(error.code).toBe("REDIRECT_NOT_ALLOWED");
    expect(error.details.httpStatus).toBe(302);
    expect(agent.getCallHistory()!.calls()).toHaveLength(1);
  });

  it("サブドメインへのリダイレクトも他のホストとして扱う", async () => {
    agent.get("https://example.org").intercept({ path: "/go" }).reply(302, "", {
      headers: { location: "https://news.example.org/page" },
    });
    const error = await errorOf(safeFetch("https://example.org/go", options()));
    expect(error.code).toBe("REDIRECT_NOT_ALLOWED");
  });

  it("禁止 IP へのリダイレクトは拒否する", async () => {
    agent.get("https://example.org").intercept({ path: "/go" }).reply(302, "", {
      headers: { location: "http://169.254.169.254/latest/meta-data/" },
    });
    const error = await errorOf(safeFetch("https://example.org/go", options()));
    expect(error.code).toBe("BLOCKED_ADDRESS");
  });

  it("リダイレクト先の名前解決が禁止範囲に変わったら拒否する", async () => {
    agent.get("https://example.org").intercept({ path: "/go" }).reply(302, "", { headers: { location: "/next" } });
    let calls = 0;
    const resolveAll: ResolveAll = async () => {
      calls += 1;
      return [{ address: calls === 1 ? PUBLIC_IP : "127.0.0.1", family: 4 }];
    };
    const error = await errorOf(safeFetch("https://example.org/go", options({ resolveAll })));
    expect(error.code).toBe("BLOCKED_ADDRESS");
    expect(agent.getCallHistory()!.calls()).toHaveLength(1);
  });

  it.each([
    ["javascript:alert(1)", "UNSUPPORTED_SCHEME"],
    ["https://example.org:8080/x", "PORT_NOT_ALLOWED"],
    ["https://user:pw@example.org/x", "CREDENTIALS_IN_URL"],
    ["http://localhost/x", "BLOCKED_HOST"],
  ])("不正なリダイレクト先 %s を拒否する", async (location, code) => {
    agent.get("https://example.org").intercept({ path: "/go" }).reply(302, "", { headers: { location } });
    const error = await errorOf(safeFetch("https://example.org/go", options()));
    expect(error.code).toBe(code);
  });

  it("https から http への格下げは追跡しない", async () => {
    agent.get("https://example.org").intercept({ path: "/go" }).reply(302, "", {
      headers: { location: "http://example.org/plain" },
    });
    const error = await errorOf(safeFetch("https://example.org/go", options()));
    expect(error.code).toBe("REDIRECT_NOT_ALLOWED");
  });

  it("リダイレクトが 3 回を超えたら失敗", async () => {
    const pool = agent.get("https://example.org");
    for (let i = 0; i < 4; i++) {
      pool.intercept({ path: `/r${i}` }).reply(302, "", { headers: { location: `/r${i + 1}` } });
    }
    pool.intercept({ path: "/r4" }).reply(200, "final", { headers: HTML });
    const error = await errorOf(safeFetch("https://example.org/r0", options()));
    expect(error.code).toBe("REDIRECT_LIMIT");
    expect(agent.getCallHistory()!.calls()).toHaveLength(4);
  });

  it("3 回までのリダイレクトは追跡する", async () => {
    const pool = agent.get("https://example.org");
    for (let i = 0; i < 3; i++) {
      pool.intercept({ path: `/r${i}` }).reply(307, "", { headers: { location: `/r${i + 1}` } });
    }
    pool.intercept({ path: "/r3" }).reply(200, "final", { headers: HTML });
    const result = await safeFetch("https://example.org/r0", options());
    expect(result.redirects).toHaveLength(3);
  });

  it("Location のないリダイレクトは失敗", async () => {
    agent.get("https://example.org").intercept({ path: "/go" }).reply(301, "");
    const error = await errorOf(safeFetch("https://example.org/go", options()));
    expect(error.code).toBe("REDIRECT_NOT_ALLOWED");
  });
});

describe("safeFetch: 応答の検査", () => {
  it("Content-Length が上限を超える応答は本文を読まずに失敗", async () => {
    agent.get("https://example.org").intercept({ path: "/big" }).reply(200, "x".repeat(10), {
      headers: { ...HTML, "content-length": "5000" },
    });
    const error = await errorOf(safeFetch("https://example.org/big", options({ maxBytes: 1024 })));
    expect(error.code).toBe("RESPONSE_TOO_LARGE");
  });

  it("本文が上限を超えたら読み込みを中断して失敗", async () => {
    agent.get("https://example.org").intercept({ path: "/big" }).reply(200, "あ".repeat(2000), { headers: HTML });
    const error = await errorOf(safeFetch("https://example.org/big", options({ maxBytes: 1024 })));
    expect(error.code).toBe("RESPONSE_TOO_LARGE");
    expect(error.details.httpStatus).toBe(200);
  });

  it.each([
    ["application/json", "UNSUPPORTED_CONTENT_TYPE"],
    ["application/pdf", "UNSUPPORTED_CONTENT_TYPE"],
    ["text/plain", "UNSUPPORTED_CONTENT_TYPE"],
    ["image/svg+xml", "UNSUPPORTED_CONTENT_TYPE"],
  ])("Content-Type %s は拒否する", async (contentType, code) => {
    agent.get("https://example.org").intercept({ path: "/x" }).reply(200, "{}", { headers: { "content-type": contentType } });
    const error = await errorOf(safeFetch("https://example.org/x", options()));
    expect(error.code).toBe(code);
    expect(error.details.contentType).toBe(contentType);
  });

  it("Content-Type がない応答は拒否する", async () => {
    agent.get("https://example.org").intercept({ path: "/x" }).reply(200, "<p>x</p>");
    const error = await errorOf(safeFetch("https://example.org/x", options()));
    expect(error.code).toBe("UNSUPPORTED_CONTENT_TYPE");
  });

  it("application/xhtml+xml は許可する", async () => {
    agent.get("https://example.org").intercept({ path: "/x" }).reply(200, "<p>x</p>", {
      headers: { "content-type": "application/xhtml+xml; charset=Shift_JIS" },
    });
    const result = await safeFetch("https://example.org/x", options());
    expect(result.mimeType).toBe("application/xhtml+xml");
    expect(result.charset).toBe("shift_jis");
  });

  it("圧縮された応答は扱わない", async () => {
    agent.get("https://example.org").intercept({ path: "/x" }).reply(200, "....", {
      headers: { ...HTML, "content-encoding": "gzip" },
    });
    const error = await errorOf(safeFetch("https://example.org/x", options()));
    expect(error.code).toBe("UNSUPPORTED_CONTENT_ENCODING");
  });

  it("タイムアウトしたら TIMEOUT", async () => {
    agent.get("https://example.org").intercept({ path: "/slow" }).reply(200, "late", { headers: HTML }).delay(500);
    const error = await errorOf(safeFetch("https://example.org/slow", options({ timeoutMs: 50 })));
    expect(error.code).toBe("TIMEOUT");
  });

  it("通信エラーは NETWORK_ERROR（再試行しない）", async () => {
    agent.get("https://example.org").intercept({ path: "/err" }).replyWithError(new Error("socket hang up"));
    const error = await errorOf(safeFetch("https://example.org/err", options()));
    expect(error.code).toBe("NETWORK_ERROR");
    expect(agent.getCallHistory()!.calls()).toHaveLength(1);
  });
});

describe("parseContentType", () => {
  it("MIME タイプと charset を取り出す", () => {
    expect(parseContentType('Text/HTML; Charset="EUC-JP"')).toEqual({ mimeType: "text/html", charset: "euc-jp" });
    expect(parseContentType(null)).toEqual({ mimeType: null, charset: null });
  });
});

describe("接続時の名前解決の検査（DNS リバインディング対策）", () => {
  it("createGuardedLookup は禁止範囲のアドレスを返さない", async () => {
    const lookup = createGuardedLookup(async () => [{ address: "127.0.0.1", family: 4 }]);
    const error = await new Promise<unknown>((resolve) => lookup("rebind.example.org", { all: true }, (err) => resolve(err)));
    expect(error).toBeInstanceOf(CollectorError);
    expect((error as CollectorError).code).toBe("BLOCKED_ADDRESS");
  });

  it("createGuardedLookup は all / family の指定に従って返す", async () => {
    const lookup = createGuardedLookup(async () => [
      { address: PUBLIC_IP, family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
    const all = await new Promise<LookupAddress[]>((resolve, reject) =>
      lookup("example.org", { all: true }, (err, addresses) => (err ? reject(err) : resolve(addresses as LookupAddress[]))),
    );
    expect(all).toHaveLength(2);
    const v6 = await new Promise<[string, number | undefined]>((resolve, reject) =>
      lookup("example.org", { family: 6 }, (err, address, family) => (err ? reject(err) : resolve([address as string, family]))),
    );
    expect(v6).toEqual(["2606:4700:4700::1111", 6]);
  });

  it("取得前の検査を通過しても、接続時に禁止アドレスへ解決されたら接続しない", async () => {
    // 1 回目（取得前の検査）は公開アドレス、2 回目（接続時）はループバックを返す
    const answers = [PUBLIC_IP, "127.0.0.1"];
    const resolveAll = vi.fn<ResolveAll>(async () => [{ address: answers.shift() ?? "127.0.0.1", family: 4 }]);
    const realAgent = createSafeAgent(resolveAll);
    try {
      const error = await errorOf(
        safeFetch(
          "http://rebind.example.org/",
          options({ dispatcher: realAgent, resolveAll, timeoutMs: 5_000 }),
        ),
      );
      expect(error.code).toBe("BLOCKED_ADDRESS");
      expect(resolveAll).toHaveBeenCalledTimes(2);
    } finally {
      await realAgent.close();
    }
  });
});

describe("discardBody", () => {
  it("破棄時に発生する 'error' イベントでプロセスを落とさない（実サイトの 404 robots.txt で発生した不具合の回帰テスト）", async () => {
    const body = new Readable({ read() {} });
    // undici の BodyReadable と同じく、destroy 時にエラーを発行するストリーム
    body._destroy = (_err, cb) => cb(new Error("Request aborted"));
    const unhandled = vi.fn();
    process.once("uncaughtException", unhandled);
    discardBody(body as unknown as Parameters<typeof discardBody>[0]);
    await new Promise((resolve) => setImmediate(resolve));
    process.removeListener("uncaughtException", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(body.destroyed).toBe(true);
  });
});
