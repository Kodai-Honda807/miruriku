/**
 * 抽出プロバイダの出力は信頼しない。パイプラインが必ず通す parseAndNormalizeExtraction が
 * 悪意ある・壊れた出力を拒否することを確かめる（LLM プロバイダを追加した場合の安全網）。
 */
import { describe, expect, it } from "vitest";

import { MAX_EXTRACTED_BROADCASTS, parseAndNormalizeExtraction } from "@/domain/candidate";

const validSlot = {
  medium: "INTERNET",
  providerName: "デモ配信",
  date: "2026-10-11",
  startTime: "08:50",
  endTime: "11:30",
  cost: "FREE",
  viewingType: "LIVE",
  region: "NATIONWIDE",
  watchUrl: "https://example.com/watch",
};

function rejects(raw: unknown): boolean {
  return !parseAndNormalizeExtraction(raw, "Asia/Tokyo").success;
}

describe("悪意ある・不正なプロバイダ出力の拒否", () => {
  it("正常な出力は受け付ける（比較用）", () => {
    expect(rejects({ broadcastStatus: "CONFIRMED", broadcasts: [validSlot] })).toBe(false);
  });

  it.each([
    "javascript:alert(document.cookie)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "https://user:pass@example.com/",
    "//evil.example.net/",
  ])("http/https 以外・認証情報付きの URL（%s）を拒否する", (url) => {
    expect(rejects({ broadcastStatus: "CONFIRMED", broadcasts: [{ ...validSlot, watchUrl: url }] })).toBe(true);
    expect(rejects({ broadcastStatus: "CONFIRMED", broadcasts: [{ ...validSlot, infoUrl: url }] })).toBe(true);
  });

  it("想定外のキーを拒否する（命令やフラグを紛れ込ませない）", () => {
    expect(rejects({ broadcastStatus: "CONFIRMED", broadcasts: [], publishAllEvents: true })).toBe(true);
    expect(rejects({ broadcastStatus: "CONFIRMED", broadcasts: [{ ...validSlot, status: "PUBLISHED" }] })).toBe(true);
    expect(rejects({ broadcastStatus: "CONFIRMED", broadcasts: [{ ...validSlot, verificationStatus: "CONFIRMED" }] })).toBe(true);
    expect(rejects({ broadcastStatus: "CONFIRMED", event: { startDate: null, status: "PUBLISHED" } })).toBe(true);
    expect(rejects({ broadcastStatus: "CONFIRMED", broadcasts: [], tool_call: "rm -rf /" })).toBe(true);
    // JSON.parse は "__proto__" を自身のキーとして作る（LLM の JSON 出力を想定）
    expect(rejects(JSON.parse('{"broadcastStatus":"CONFIRMED","__proto__":{"polluted":true}}'))).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("長すぎる文字列を拒否する", () => {
    expect(rejects({ broadcasts: [{ ...validSlot, providerName: "あ".repeat(101) }] })).toBe(true);
    expect(rejects({ broadcasts: [{ ...validSlot, note: "x".repeat(501) }] })).toBe(true);
    expect(rejects({ broadcasts: [{ ...validSlot, evidence: "x".repeat(301) }] })).toBe(true);
    expect(rejects({ notes: "x".repeat(1001) })).toBe(true);
    expect(rejects({ broadcasts: [{ ...validSlot, watchUrl: `https://example.com/${"a".repeat(2100)}` }] })).toBe(true);
  });

  it("NO_BROADCAST と放送・配信枠の同時指定を拒否する", () => {
    expect(rejects({ broadcastStatus: "NO_BROADCAST", broadcasts: [validSlot] })).toBe(true);
  });

  it("枠の数の上限を超えたら拒否する", () => {
    const many = Array.from({ length: MAX_EXTRACTED_BROADCASTS + 1 }, (_, i) => ({ ...validSlot, providerName: `局${i}` }));
    expect(rejects({ broadcastStatus: "CONFIRMED", broadcasts: many })).toBe(true);
  });

  it("型・列挙値・日付・時刻が不正なら拒否する", () => {
    expect(rejects(null)).toBe(true);
    expect(rejects("CONFIRMED")).toBe(true);
    expect(rejects([])).toBe(true);
    expect(rejects({ broadcastStatus: "PUBLISH_ALL" })).toBe(true);
    expect(rejects({ broadcasts: [{ ...validSlot, medium: "SATELLITE" }] })).toBe(true);
    expect(rejects({ broadcasts: [{ ...validSlot, date: "2026-02-30" }] })).toBe(true);
    expect(rejects({ broadcasts: [{ ...validSlot, startTime: "25:00" }] })).toBe(true);
    expect(rejects({ broadcasts: [{ ...validSlot, date: null }] })).toBe(true); // 時刻があるのに日付がない
    expect(rejects({ broadcasts: [{ ...validSlot, providerName: "   " }] })).toBe(true);
  });
});
