/**
 * 承認・却下サービスの DB 統合テスト（TEST_DATABASE_URL の _test DB を使用）。
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { parseAndNormalizeExtraction, type ExtractionResultInput } from "@/domain/candidate";
import { computeCandidateDiff } from "@/domain/diff";
import type { Prisma } from "@/generated/prisma/client";
import { loadCurrentEventState } from "@/lib/event-state";
import { seedDemoData } from "../../../prisma/demo-seed";
import { createTestPrisma, resetDatabase } from "../../../test/db";
import { CandidateReviewError, approveCandidate, rejectCandidate } from "./review-service";

const prisma = createTestPrisma();
const BASE_DATE = "2026-10-10";
const NOW = new Date("2026-10-10T03:00:00.000Z"); // 2026-10-10 12:00 JST

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDemoData(prisma, { baseDate: BASE_DATE });
});

async function getEvent(slug: string) {
  return prisma.event.findUniqueOrThrow({ where: { slug }, include: { sources: true } });
}

/** 収集 CLI と同じ手順（検証・正規化 → 差分スナップショット）で候補を保存する */
async function createCandidate(slug: string, raw: ExtractionResultInput) {
  const event = await getEvent(slug);
  const parsed = parseAndNormalizeExtraction(raw, event.timezone);
  if (!parsed.success) throw parsed.error;
  const current = await loadCurrentEventState(prisma, event.id);
  if (!current) throw new Error("event not found");
  const diff = computeCandidateDiff(current, parsed.data);
  const source = event.sources.find((s) => s.collectEnabled) ?? event.sources[0] ?? null;
  return prisma.extractionCandidate.create({
    data: {
      eventId: event.id,
      sourceId: source?.id ?? null,
      fetchMode: "FIXTURE",
      providerId: "test-fixture",
      providerKind: "FIXTURE",
      payload: parsed.data as unknown as Prisma.InputJsonValue,
      diff: diff as unknown as Prisma.InputJsonValue,
    },
  });
}

async function snapshot(slug: string) {
  return prisma.event.findUniqueOrThrow({
    where: { slug },
    include: { broadcasts: { orderBy: { id: "asc" } }, sessions: { orderBy: { id: "asc" } } },
  });
}

async function expectReviewError(promise: Promise<unknown>, code: CandidateReviewError["code"]) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CandidateReviewError);
  expect((error as CandidateReviewError).code).toBe(code);
}

const CITY_MARATHON_RAW: ExtractionResultInput = {
  broadcastStatus: "CONFIRMED",
  event: { startDate: "2026-10-11", startTime: "09:00", venueName: null },
  broadcasts: [
    {
      medium: "TERRESTRIAL",
      providerName: "デモ地方テレビ（架空）",
      date: "2026-10-11",
      startTime: "08:55",
      endTime: "11:30",
      cost: "FREE",
      viewingType: "LIVE",
      region: "REGIONAL",
      regionNote: "デモ県内のみ",
      evidence: "当日 8:55 から生中継（デモ）",
    },
    {
      medium: "INTERNET",
      providerName: "デモ配信プラス（架空）",
      date: "2026-10-11",
      startTime: "08:55",
      cost: "FREE",
      viewingType: "LIVE",
      region: "NATIONWIDE",
      watchUrl: "https://example.com/miruriku-demo/watch/city-marathon",
    },
  ],
  notes: "テスト用の抽出結果",
};

describe("approveCandidate", () => {
  it("放送枠を追加して公開状態にし、確認日時を now にする", async () => {
    const candidate = await createCandidate("demo-city-marathon", CITY_MARATHON_RAW);

    const result = await approveCandidate(prisma, candidate.id, { now: NOW, note: "  確認しました  " });

    expect(result).toMatchObject({ added: 2, updated: 0, unchanged: 0, untouched: 0, eventFieldsChanged: 1 });

    const event = await snapshot("demo-city-marathon");
    expect(event.status).toBe("PUBLISHED");
    expect(event.broadcastInfoStatus).toBe("CONFIRMED");
    expect(event.broadcastCheckedAt).toEqual(NOW);
    expect(event.broadcasts).toHaveLength(2);

    const tv = event.broadcasts.find((s) => s.medium === "TERRESTRIAL")!;
    expect(tv).toMatchObject({
      providerName: "デモ地方テレビ（架空）",
      status: "PUBLISHED",
      verificationStatus: "CONFIRMED",
      verifiedAt: NOW,
      cost: "FREE",
      viewingType: "LIVE",
      region: "REGIONAL",
      regionNote: "デモ県内のみ",
      sourceId: candidate.sourceId,
      originCandidateId: candidate.id,
    });
    // 日本時間 2026-10-11 08:55〜11:30
    expect(tv.startAt).toEqual(new Date("2026-10-10T23:55:00.000Z"));
    expect(tv.endAt).toEqual(new Date("2026-10-11T02:30:00.000Z"));
    expect(tv.airDate).toEqual(new Date("2026-10-11T00:00:00.000Z"));
    expect(new Set(event.broadcasts.map((s) => s.sortOrder)).size).toBe(2);

    const reviewed = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(reviewed).toMatchObject({ reviewStatus: "APPROVED", reviewedAt: NOW, reviewNote: "確認しました" });
  });

  it("追加する枠は既存の並び順の後ろに置く", async () => {
    const candidate = await createCandidate("demo-seaside-marathon", {
      broadcastStatus: "CONFIRMED",
      broadcasts: [{ medium: "RADIO", providerName: "デモラジオ（架空）", date: "2026-10-12" }],
    });
    await approveCandidate(prisma, candidate.id, { now: NOW });
    const event = await snapshot("demo-seaside-marathon");
    const radio = event.broadcasts.find((s) => s.medium === "RADIO")!;
    expect(radio.sortOrder).toBe(4); // seed の枠は 0〜3
  });

  it("同じ候補を 2 回承認すると 2 回目はエラーになり、枠の数は変わらない", async () => {
    const candidate = await createCandidate("demo-city-marathon", CITY_MARATHON_RAW);
    await approveCandidate(prisma, candidate.id, { now: NOW });
    const before = await snapshot("demo-city-marathon");

    await expectReviewError(approveCandidate(prisma, candidate.id, { now: new Date() }), "NOT_PENDING");

    const after = await snapshot("demo-city-marathon");
    expect(after.broadcasts).toHaveLength(2);
    expect(after).toEqual(before);
  });

  it("同じ候補を同時に承認しても 1 つだけ成功し、枠が重複しない", async () => {
    const candidate = await createCandidate("demo-city-marathon", CITY_MARATHON_RAW);

    const results = await Promise.allSettled([
      approveCandidate(prisma, candidate.id, { now: NOW }),
      approveCandidate(prisma, candidate.id, { now: NOW }),
      approveCandidate(prisma, candidate.id, { now: NOW }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(2);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(CandidateReviewError);
      expect((r.reason as CandidateReviewError).code).toBe("NOT_PENDING");
    }
    const event = await snapshot("demo-city-marathon");
    expect(event.broadcasts).toHaveLength(2);
  });

  it("同じ内容の別の候補を承認しても枠は重複せず、変更なしとして扱う", async () => {
    const first = await createCandidate("demo-city-marathon", CITY_MARATHON_RAW);
    const second = await createCandidate("demo-city-marathon", CITY_MARATHON_RAW);

    await approveCandidate(prisma, first.id, { now: NOW });
    const later = new Date(NOW.getTime() + 60_000);
    const result = await approveCandidate(prisma, second.id, { now: later });

    expect(result).toMatchObject({ added: 0, updated: 0, unchanged: 2, eventFieldsChanged: 0 });
    const event = await snapshot("demo-city-marathon");
    expect(event.broadcasts).toHaveLength(2);
    // 2 回目の承認で確認日時は更新される
    expect(event.broadcastCheckedAt).toEqual(later);
    for (const slot of event.broadcasts) {
      expect(slot.verifiedAt).toEqual(later);
      expect(slot.originCandidateId).toBe(first.id);
    }
  });

  it("同じ内容の別の候補を同時に承認しても枠が重複しない", async () => {
    const first = await createCandidate("demo-city-marathon", CITY_MARATHON_RAW);
    const second = await createCandidate("demo-city-marathon", CITY_MARATHON_RAW);

    const results = await Promise.allSettled([
      approveCandidate(prisma, first.id, { now: NOW }),
      approveCandidate(prisma, second.id, { now: NOW }),
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const event = await snapshot("demo-city-marathon");
    expect(event.broadcasts).toHaveLength(2);
  });

  it("候補で不明（UNKNOWN / null）の値は既存値を上書きしない", async () => {
    const before = await snapshot("demo-seaside-marathon");
    const candidate = await createCandidate("demo-seaside-marathon", {
      broadcastStatus: "UNKNOWN",
      event: { venueName: null, startDate: null, startTime: null },
      // 料金・視聴形態・地域・時刻・URL は不明
      broadcasts: [{ medium: "TERRESTRIAL", providerName: "デモ放送（架空）", date: "2026-10-12" }],
    });

    const result = await approveCandidate(prisma, candidate.id, { now: NOW });
    expect(result).toMatchObject({ added: 0, updated: 0, unchanged: 1, untouched: 3, eventFieldsChanged: 0 });

    const after = await snapshot("demo-seaside-marathon");
    const tvBefore = before.broadcasts.find((s) => s.id === "seed-demo-seaside-marathon-slot-tv")!;
    const tvAfter = after.broadcasts.find((s) => s.id === "seed-demo-seaside-marathon-slot-tv")!;
    expect(tvAfter).toMatchObject({
      cost: tvBefore.cost,
      viewingType: tvBefore.viewingType,
      region: tvBefore.region,
      startAt: tvBefore.startAt,
      endAt: tvBefore.endAt,
      infoUrl: tvBefore.infoUrl,
      watchUrl: tvBefore.watchUrl,
      providerName: tvBefore.providerName,
      verifiedAt: NOW,
    });
    expect(after.venueName).toBe(before.venueName);
    expect(after.startAt).toEqual(before.startAt);
    expect(after.broadcastInfoStatus).toBe("CONFIRMED");

    // 候補に含まれない既存枠は削除も変更もしない（下書きの枠も下書きのまま）
    const others = (e: typeof before) => e.broadcasts.filter((s) => s.id !== "seed-demo-seaside-marathon-slot-tv");
    expect(others(after)).toEqual(others(before));
    expect(after.broadcasts.find((s) => s.id === "seed-demo-seaside-marathon-slot-draft")?.status).toBe("DRAFT");
  });

  it("broadcastStatus が UNKNOWN で枠もない候補は大会の放送情報状態を変えない", async () => {
    const before = await snapshot("demo-record-challenge");
    const candidate = await createCandidate("demo-record-challenge", { broadcastStatus: "UNKNOWN" });

    await approveCandidate(prisma, candidate.id, { now: NOW });

    const after = await snapshot("demo-record-challenge");
    expect(after.broadcastInfoStatus).toBe("NO_BROADCAST");
    expect(after.broadcastNote).toBe(before.broadcastNote);
    expect(after.broadcastCheckedAt).toEqual(NOW);
  });

  it("既存枠の判明した項目を更新し、確認済み・公開にする", async () => {
    const candidate = await createCandidate("demo-europe-grand-prix", {
      broadcastStatus: "CONFIRMED",
      broadcasts: [
        {
          medium: "INTERNET",
          providerName: "デモ国際陸上ストリーム（架空）",
          date: "2026-10-18",
          startTime: "02:55",
          cost: "FREE",
          viewingType: "LIVE",
          region: "NATIONWIDE",
        },
      ],
    });

    const result = await approveCandidate(prisma, candidate.id, { now: NOW });
    expect(result).toMatchObject({ added: 0, updated: 1, unchanged: 0, untouched: 1 });

    const slot = await prisma.broadcastSlot.findUniqueOrThrow({
      where: { id: "seed-demo-europe-grand-prix-slot-intl-stream" },
    });
    expect(slot).toMatchObject({
      cost: "FREE",
      region: "NATIONWIDE",
      verificationStatus: "CONFIRMED",
      status: "PUBLISHED",
      verifiedAt: NOW,
      airDate: new Date("2026-10-18T00:00:00.000Z"),
    });
    // 変更前と同じ瞬間（現地 19:55 = 日本時間 翌 2:55）
    expect(slot.startAt).toEqual(new Date("2026-10-17T17:55:00.000Z"));
    // 不明な値（regionNote）は変えない
    expect(slot.note).toBe("主催者による国際配信。日本からの視聴可否は確認できていません（デモ）。");
  });

  it("下書きの大会は承認後も下書きのまま", async () => {
    const candidate = await createCandidate("demo-draft-ekiden", {
      broadcastStatus: "CONFIRMED",
      broadcasts: [{ medium: "INTERNET", providerName: "デモ配信（架空）", date: "2026-10-11", cost: "FREE" }],
    });

    await approveCandidate(prisma, candidate.id, { now: NOW });

    const event = await snapshot("demo-draft-ekiden");
    expect(event.status).toBe("DRAFT");
    const added = event.broadcasts.find((s) => s.originCandidateId === candidate.id)!;
    expect(added.status).toBe("PUBLISHED");
  });

  it("保存された payload が読めない候補は承認できず、未レビューのまま残る", async () => {
    const event = await getEvent("demo-city-marathon");
    const candidate = await prisma.extractionCandidate.create({
      data: {
        eventId: event.id,
        fetchMode: "FIXTURE",
        providerId: "test-fixture",
        providerKind: "FIXTURE",
        payload: { schemaVersion: 999, injected: "<script>alert(1)</script>" },
        diff: {},
      },
    });
    const before = await snapshot("demo-city-marathon");

    await expectReviewError(approveCandidate(prisma, candidate.id, { now: NOW }), "INVALID_PAYLOAD");

    const stored = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(stored.reviewStatus).toBe("PENDING");
    expect(await snapshot("demo-city-marathon")).toEqual(before);
  });

  it("存在しない候補は NOT_FOUND", async () => {
    await expectReviewError(approveCandidate(prisma, "missing-candidate", { now: NOW }), "NOT_FOUND");
  });
});

describe("rejectCandidate", () => {
  it("却下しても公開データは変わらず、却下済みの候補は承認できない", async () => {
    const candidate = await createCandidate("demo-city-marathon", CITY_MARATHON_RAW);
    const before = await snapshot("demo-city-marathon");

    await rejectCandidate(prisma, candidate.id, { now: NOW, note: "放送局名が誤っている" });

    expect(await snapshot("demo-city-marathon")).toEqual(before);
    const reviewed = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(reviewed).toMatchObject({ reviewStatus: "REJECTED", reviewedAt: NOW, reviewNote: "放送局名が誤っている" });

    await expectReviewError(approveCandidate(prisma, candidate.id, { now: NOW }), "NOT_PENDING");
    expect(await snapshot("demo-city-marathon")).toEqual(before);
  });

  it("レビュー済みの候補は却下できない", async () => {
    const candidate = await createCandidate("demo-city-marathon", CITY_MARATHON_RAW);
    await approveCandidate(prisma, candidate.id, { now: NOW });

    await expectReviewError(rejectCandidate(prisma, candidate.id, { now: NOW }), "NOT_PENDING");
    const stored = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(stored.reviewStatus).toBe("APPROVED");
  });

  it("存在しない候補は NOT_FOUND", async () => {
    await expectReviewError(rejectCandidate(prisma, "missing-candidate", { now: NOW }), "NOT_FOUND");
  });
});
