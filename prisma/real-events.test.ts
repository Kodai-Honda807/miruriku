/**
 * 実在の大会データ（data/real-events.ts）の定義検証。DB には接続しない。
 */
import { describe, expect, it } from "vitest";

import { REAL_EVENTS } from "../data/real-events";
import { parseRealEvents, type RealEventDef } from "./real-events";

function clone(): RealEventDef[] {
  return structuredClone(REAL_EVENTS);
}

describe("data/real-events.ts", () => {
  it("登録済みの定義はすべて検証を通る", () => {
    expect(parseRealEvents(REAL_EVENTS).length).toBe(REAL_EVENTS.length);
  });

  it("確認済みの枠にはすべて出典と確認日時がある", () => {
    for (const event of REAL_EVENTS) {
      for (const slot of event.slots) {
        if (slot.verificationStatus !== "CONFIRMED") continue;
        expect(slot.sourceKey, `${event.slug}/${slot.key}`).toBeTruthy();
        expect(slot.verifiedAt, `${event.slug}/${slot.key}`).toBeTruthy();
      }
    }
  });
});

describe("parseRealEvents の検証", () => {
  it("確認済みの枠に出典がない定義を拒否する", () => {
    const defs = clone();
    defs[0]!.slots[0]!.sourceKey = null;
    expect(() => parseRealEvents(defs)).toThrow(/確認済みの枠には出典/);
  });

  it("確認済みの枠に確認日時がない定義を拒否する", () => {
    const defs = clone();
    defs[0]!.slots[0]!.verifiedAt = null;
    expect(() => parseRealEvents(defs)).toThrow(/確認日時/);
  });

  it("定義されていない情報源を参照する枠を拒否する", () => {
    const defs = clone();
    defs[0]!.slots[0]!.sourceKey = "missing";
    expect(() => parseRealEvents(defs)).toThrow(/情報源 missing が定義されていません/);
  });

  it("デモ用ドメインや http(s) 以外の URL を拒否する", () => {
    const demo = clone();
    demo[0]!.officialUrl = "https://example.com/demo";
    expect(() => parseRealEvents(demo)).toThrow(/デモ用のドメイン/);
    const js = clone();
    js[0]!.slots[0]!.watchUrl = "javascript:alert(1)";
    expect(() => parseRealEvents(js)).toThrow(/http\(s\)/);
  });

  it("「放送・配信なし」なのに今年の枠がある定義を拒否する", () => {
    const defs = clone();
    defs[0]!.broadcastInfoStatus = "NO_BROADCAST";
    expect(() => parseRealEvents(defs)).toThrow(/放送・配信なし/);
  });

  it("時刻だけあって放送日がない枠、終了時刻だけの枠を拒否する", () => {
    const noDate = clone();
    noDate[0]!.slots[0]!.airDate = null;
    expect(() => parseRealEvents(noDate)).toThrow(/放送日/);
    const endOnly = clone();
    endOnly[0]!.slots[0]!.startTime = null;
    expect(() => parseRealEvents(endOnly)).toThrow(/終了時刻だけ/);
  });

  it("タイムゾーンのない確認日時・slug の重複を拒否する", () => {
    const noTz = clone();
    noTz[0]!.slots[0]!.verifiedAt = "2026-10-16T06:00:00";
    expect(() => parseRealEvents(noTz)).toThrow(/タイムゾーン/);
    const dup = clone();
    dup[1]!.slug = dup[0]!.slug;
    expect(() => parseRealEvents(dup)).toThrow(/slug が重複/);
  });
});
