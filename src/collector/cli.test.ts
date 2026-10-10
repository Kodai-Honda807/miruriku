import { describe, expect, it } from "vitest";

import { parseCollectArgs, runCollectCli } from "./cli";

describe("parseCollectArgs", () => {
  it("既定は --fetch http --provider rule-based", () => {
    expect(parseCollectArgs(["--event", "demo-city-marathon"])).toEqual({
      kind: "run",
      options: {
        target: { kind: "event", slug: "demo-city-marathon" },
        fetchMode: "http",
        providerId: "rule-based",
        limit: 20,
        dryRun: false,
      },
    });
  });

  it("固定ファイルモード・ドライラン・上限を指定できる", () => {
    expect(
      parseCollectArgs(["--event=demo-city-marathon", "--fetch", "fixture", "--provider", "fixture", "--dry-run", "--limit", "5"]),
    ).toMatchObject({
      kind: "run",
      options: { fetchMode: "fixture", providerId: "fixture", dryRun: true, limit: 5 },
    });
    expect(parseCollectArgs(["--source", "src_1"])).toMatchObject({ options: { target: { kind: "source", sourceId: "src_1" } } });
    expect(parseCollectArgs(["--all"])).toMatchObject({ options: { target: { kind: "all" } } });
  });

  it("pnpm から渡される先頭の -- を無視する", () => {
    expect(parseCollectArgs(["--", "--all"])).toMatchObject({ kind: "run", options: { target: { kind: "all" } } });
  });

  it("ヘルプ", () => {
    expect(parseCollectArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseCollectArgs(["-h"])).toEqual({ kind: "help" });
  });

  it.each([
    [[]],
    [["--event", "a", "--all"]],
    [["--event", ""]],
    [["--url", "https://example.org/"]], // 任意の URL は受け付けない
    [["https://example.org/"]],
    [["--all", "--fetch", "ftp"]],
    [["--all", "--limit", "0"]],
    [["--all", "--limit", "51"]],
    [["--all", "--limit", "abc"]],
  ])("不正な引数 %j はエラー", (argv) => {
    expect(parseCollectArgs(argv).kind).toBe("error");
  });
});

describe("runCollectCli（DB に接続しない範囲）", () => {
  function io() {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
  }

  it("--help は終了コード 0", async () => {
    const t = io();
    expect(await runCollectCli(["--help"], { io: t.io, createDb: () => { throw new Error("DB に接続しないこと"); } })).toBe(0);
    expect(t.out.join("\n")).toContain("pnpm collect");
  });

  it("不正な引数・未登録のプロバイダ・fixture プロバイダと HTTP の組み合わせは終了コード 1（DB に接続しない）", async () => {
    const noDb = () => {
      throw new Error("DB に接続しないこと");
    };
    for (const argv of [["--bogus"], ["--all", "--provider", "llm"], ["--all", "--provider", "fixture"]]) {
      const t = io();
      expect(await runCollectCli(argv, { io: t.io, createDb: noDb })).toBe(1);
      expect(t.err.length).toBeGreaterThan(0);
    }
  });
});
