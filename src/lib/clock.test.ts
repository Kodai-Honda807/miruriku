import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getFixedNow, getNow } from "./clock";

const REAL_NOW = new Date("2030-01-02T03:04:05.000Z");

describe("getNow", () => {
  beforeEach(() => {
    // 「実時刻」も固定して、実行日に依存しないようにする
    vi.useFakeTimers({ now: REAL_NOW, toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("開発・テストでは MIRURIKU_FIXED_NOW の時刻を返す", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      expect(getNow({ NODE_ENV: nodeEnv, MIRURIKU_FIXED_NOW: "2026-10-10T12:00:00+09:00" }).toISOString()).toBe(
        "2026-10-10T03:00:00.000Z",
      );
    }
  });

  it("前後の空白は無視する", () => {
    expect(getNow({ NODE_ENV: "development", MIRURIKU_FIXED_NOW: "  2026-10-10T03:00:00Z  " }).toISOString()).toBe(
      "2026-10-10T03:00:00.000Z",
    );
  });

  it("NODE_ENV=production では MIRURIKU_FIXED_NOW を無視して実時刻を返す", () => {
    expect(getNow({ NODE_ENV: "production", MIRURIKU_FIXED_NOW: "2026-10-10T12:00:00+09:00" })).toEqual(REAL_NOW);
  });

  it.each(["not-a-date", "2026-13-45T99:99:99Z", "   "])("不正な値 %j は無視して実時刻を返す", (value) => {
    expect(getNow({ NODE_ENV: "development", MIRURIKU_FIXED_NOW: value })).toEqual(REAL_NOW);
  });

  it("未設定・空文字なら実時刻", () => {
    expect(getNow({ NODE_ENV: "development" })).toEqual(REAL_NOW);
    expect(getNow({ NODE_ENV: "development", MIRURIKU_FIXED_NOW: "" })).toEqual(REAL_NOW);
  });

  it("引数を省略すると process.env を参照する", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("MIRURIKU_FIXED_NOW", "2026-10-10T00:00:00Z");
    expect(getNow().toISOString()).toBe("2026-10-10T00:00:00.000Z");
    vi.stubEnv("NODE_ENV", "production");
    expect(getNow()).toEqual(REAL_NOW);
  });

  it("返した Date を変更しても次の呼び出しに影響しない", () => {
    const env = { NODE_ENV: "development", MIRURIKU_FIXED_NOW: "2026-10-10T00:00:00Z" };
    const a = getNow(env);
    a.setUTCFullYear(1999);
    expect(getNow(env).toISOString()).toBe("2026-10-10T00:00:00.000Z");
  });

  it("NEXT_PUBLIC_MIRURIKU_FIXED_NOW は本番ビルド（静的ビルドの E2E 用）でも有効", () => {
    const fixed = "2026-10-10T12:00:00+09:00";
    expect(getNow({ NODE_ENV: "production", NEXT_PUBLIC_MIRURIKU_FIXED_NOW: fixed }).toISOString()).toBe(
      "2026-10-10T03:00:00.000Z",
    );
    // 両方あれば NEXT_PUBLIC_ を優先する（ビルド時の描画とブラウザで同じ時刻にするため）
    expect(
      getNow({ NODE_ENV: "development", MIRURIKU_FIXED_NOW: "2030-01-01T00:00:00Z", NEXT_PUBLIC_MIRURIKU_FIXED_NOW: fixed }),
    ).toEqual(new Date(fixed));
    expect(getNow({ NODE_ENV: "production", NEXT_PUBLIC_MIRURIKU_FIXED_NOW: "not-a-date" })).toEqual(REAL_NOW);
  });

  it("getFixedNow は固定されていなければ null", () => {
    expect(getFixedNow({ NODE_ENV: "production" })).toBeNull();
    expect(getFixedNow({ NODE_ENV: "production", MIRURIKU_FIXED_NOW: "2026-10-10T00:00:00Z" })).toBeNull();
    expect(getFixedNow({ NODE_ENV: "development", MIRURIKU_FIXED_NOW: "2026-10-10T00:00:00Z" })).toEqual(
      new Date("2026-10-10T00:00:00Z"),
    );
  });
});
