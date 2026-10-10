/**
 * 管理用 Server Actions の DB 統合テスト（TEST_DATABASE_URL の _test DB を使用）。
 * getPrisma() をテスト用 DB の Prisma Client に差し替え、redirect() は遷移先を持つ例外にする。
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", async () => {
  const { createTestPrisma } = await import("../../../../test/db");
  const prisma = createTestPrisma();
  return { getPrisma: () => prisma };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { redirectUrl: url });
  }),
  notFound: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { parseAndNormalizeExtraction } from "@/domain/candidate";
import { computeCandidateDiff } from "@/domain/diff";
import type { Prisma } from "@/generated/prisma/client";
import { loadCurrentEventState } from "@/lib/event-state";
import { getPrisma } from "@/server/db";

import { seedDemoData } from "../../../../prisma/demo-seed";
import { resetDatabase } from "../../../../test/db";
import { initialFormState } from "../form-state";
import { approveCandidateAction, rejectCandidateAction } from "./candidates";
import { createEventAction, setEventStatusAction, updateEventAction } from "./events";
import { createSessionAction } from "./sessions";
import { createSlotAction, deleteSlotAction, updateSlotAction } from "./slots";
import { createSourceAction, updateSourceAction } from "./sources";

const prisma = getPrisma();
const FIXED_NOW = "2026-10-10T03:00:00.000Z";

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("MIRURIKU_ADMIN_ENABLED", "true");
  vi.stubEnv("MIRURIKU_FIXED_NOW", FIXED_NOW);
  vi.clearAllMocks();
  await resetDatabase(prisma);
  await seedDemoData(prisma, { baseDate: "2026-10-10" });
});

function fd(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [k, v] of Object.entries(entries)) formData.append(k, v);
  return formData;
}

/** redirect() による遷移先を返す（遷移しなければ null と戻り値） */
async function redirectOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    const url = (error as { redirectUrl?: string }).redirectUrl;
    if (url) return url;
    throw error;
  }
}

async function eventBySlug(slug: string) {
  return prisma.event.findUniqueOrThrow({ where: { slug }, include: { sources: true, broadcasts: true } });
}

const NEW_EVENT = {
  seriesMode: "new",
  newSeriesName: "テスト新シリーズ",
  newSeriesSlug: "test-new-series",
  name: "テスト大会 2026",
  slug: "test-event-2026",
  editionLabel: "第1回",
  seasonYear: "2026",
  category: "TRACK",
  countryCode: "us",
  timezone: "America/New_York",
  startDate: "2026-11-01",
  endDate: "2026-11-02",
  startTime: "09:30",
  officialUrl: "https://example.com/test-event",
  broadcastInfoStatus: "NOT_ANNOUNCED",
  markBroadcastChecked: "on",
};

describe("大会", () => {
  it("新しいシリーズと大会を作成し、下書きとして編集画面へ遷移する", async () => {
    const url = await redirectOf(createEventAction(initialFormState, fd(NEW_EVENT)));
    const event = await prisma.event.findUniqueOrThrow({ where: { slug: "test-event-2026" }, include: { series: true } });
    expect(url).toBe(`/admin/events/${event.id}?notice=event-created`);
    expect(event).toMatchObject({
      status: "DRAFT",
      isDemo: false,
      countryCode: "US",
      timezone: "America/New_York",
      broadcastInfoStatus: "NOT_ANNOUNCED",
      broadcastCheckedAt: new Date(FIXED_NOW),
      // ニューヨーク 2026-11-01 09:30（夏時間終了日。EST = UTC-5）
      startAt: new Date("2026-11-01T14:30:00.000Z"),
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      endDate: new Date("2026-11-02T00:00:00.000Z"),
    });
    expect(event.series).toMatchObject({ name: "テスト新シリーズ", slug: "test-new-series" });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("slug の重複は項目エラーにして作成しない", async () => {
    const state = await createEventAction(initialFormState, fd({ ...NEW_EVENT, slug: "demo-bay-ekiden" }));
    expect(state.status).toBe("error");
    expect(state.fieldErrors.slug).toEqual(["この slug は他の大会で使われています"]);
    expect(await prisma.eventSeries.count({ where: { slug: "test-new-series" } })).toBe(0);
  });

  it("更新では確認日時をチェックした場合だけ更新し、公開状態は変えない", async () => {
    const before = await eventBySlug("demo-seaside-marathon");
    const base = {
      seriesMode: "existing",
      seriesId: before.seriesId,
      name: before.name,
      slug: before.slug,
      seasonYear: "2026",
      category: before.category,
      countryCode: "JP",
      timezone: "Asia/Tokyo",
      startDate: "2026-10-12",
      endDate: "2026-10-12",
      startTime: "",
      broadcastInfoStatus: "CONFIRMED",
    };
    const url = await redirectOf(updateEventAction(before.id, initialFormState, fd({ ...base, venueName: "新しい会場" })));
    expect(url).toBe(`/admin/events/${before.id}?notice=event-saved`);
    const after = await eventBySlug("demo-seaside-marathon");
    expect(after).toMatchObject({ venueName: "新しい会場", startAt: null, status: "PUBLISHED" });
    expect(after.broadcastCheckedAt).toEqual(before.broadcastCheckedAt);

    await redirectOf(updateEventAction(before.id, initialFormState, fd({ ...base, markBroadcastChecked: "on" })));
    expect((await eventBySlug("demo-seaside-marathon")).broadcastCheckedAt).toEqual(new Date(FIXED_NOW));
  });

  it("公開状態を切り替える", async () => {
    const draft = await eventBySlug("demo-draft-ekiden");
    const url = await redirectOf(setEventStatusAction(draft.id, "PUBLISHED"));
    expect(url).toBe(`/admin/events/${draft.id}?notice=event-published`);
    expect((await eventBySlug("demo-draft-ekiden")).status).toBe("PUBLISHED");
  });
});

const SLOT = {
  medium: "INTERNET",
  providerName: "テスト配信",
  airDate: "2026-10-12",
  startTime: "23:30",
  endTime: "00:30",
  cost: "FREE",
  viewingType: "LIVE",
  region: "NATIONWIDE",
  verificationStatus: "CONFIRMED",
  status: "PUBLISHED",
};

describe("放送・配信枠", () => {
  it("同じ大会の情報源だけを根拠にでき、並び順は最後になる", async () => {
    const seaside = await eventBySlug("demo-seaside-marathon");
    const otherSource = (await eventBySlug("demo-bay-ekiden")).sources[0]!;

    const rejected = await createSlotAction(seaside.id, initialFormState, fd({ ...SLOT, sourceId: otherSource.id }));
    expect(rejected.fieldErrors.sourceId).toBeDefined();

    const url = await redirectOf(
      createSlotAction(seaside.id, initialFormState, fd({ ...SLOT, sourceId: seaside.sources[0]!.id, markVerified: "on" })),
    );
    expect(url).toBe(`/admin/events/${seaside.id}?notice=slot-created`);
    const slot = await prisma.broadcastSlot.findFirstOrThrow({ where: { providerName: "テスト配信" } });
    expect(slot).toMatchObject({
      sortOrder: 4,
      sourceId: seaside.sources[0]!.id,
      verifiedAt: new Date(FIXED_NOW),
      // 日本時間 23:30〜翌 0:30
      startAt: new Date("2026-10-12T14:30:00.000Z"),
      endAt: new Date("2026-10-12T15:30:00.000Z"),
    });
  });

  it("別の大会の枠は更新・削除できない", async () => {
    const seaside = await eventBySlug("demo-seaside-marathon");
    const bay = await eventBySlug("demo-bay-ekiden");
    const bayslot = bay.broadcasts[0]!;

    const state = await updateSlotAction(seaside.id, bayslot.id, initialFormState, fd(SLOT));
    expect(state.status).toBe("error");
    expect(await prisma.broadcastSlot.findUniqueOrThrow({ where: { id: bayslot.id } })).toEqual(bayslot);

    await redirectOf(deleteSlotAction(seaside.id, bayslot.id));
    expect(await prisma.broadcastSlot.count({ where: { id: bayslot.id } })).toBe(1);
  });

  it("更新では確認日時をチェックした場合だけ更新する", async () => {
    const slot = await prisma.broadcastSlot.findUniqueOrThrow({ where: { id: "seed-demo-seaside-marathon-slot-draft" } });
    await redirectOf(updateSlotAction(slot.eventId, slot.id, initialFormState, fd({ ...SLOT, providerName: "更新後" })));
    const updated = await prisma.broadcastSlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(updated).toMatchObject({ providerName: "更新後", status: "PUBLISHED", verifiedAt: slot.verifiedAt });
  });
});

describe("情報源・セッション", () => {
  it("同じ大会での URL の重複は項目エラー", async () => {
    const city = await eventBySlug("demo-city-marathon");
    const existing = city.sources.find((s) => s.collectEnabled)!;

    const created = await createSourceAction(city.id, initialFormState, fd({ kind: "OTHER", url: existing.url }));
    expect(created.fieldErrors.url).toEqual(["この大会には同じ URL の情報源が既に登録されています"]);

    const other = city.sources.find((s) => !s.collectEnabled)!;
    const updated = await updateSourceAction(city.id, other.id, initialFormState, fd({ kind: "OTHER", url: existing.url }));
    expect(updated.fieldErrors.url).toBeDefined();

    // 別の大会なら同じ URL でも登録できる
    const bay = await eventBySlug("demo-bay-ekiden");
    expect(await redirectOf(createSourceAction(bay.id, initialFormState, fd({ kind: "OTHER", url: existing.url })))).toBe(
      `/admin/events/${bay.id}?notice=source-created`,
    );
  });

  it("セッションの時刻は大会のタイムゾーンで保存する", async () => {
    const europe = await eventBySlug("demo-europe-grand-prix");
    await redirectOf(createSessionAction(europe.id, initialFormState, fd({ name: "決勝", date: "2026-10-17", startTime: "20:00" })));
    const session = await prisma.eventSession.findFirstOrThrow({ where: { eventId: europe.id, name: "決勝" } });
    expect(session.startAt).toEqual(new Date("2026-10-17T18:00:00.000Z"));
  });
});

describe("候補の承認・却下", () => {
  async function createCandidate() {
    const city = await eventBySlug("demo-city-marathon");
    const parsed = parseAndNormalizeExtraction(
      {
        broadcastStatus: "CONFIRMED",
        broadcasts: [{ medium: "TERRESTRIAL", providerName: "テストテレビ", date: "2026-10-11", startTime: "08:50" }],
      },
      city.timezone,
    );
    if (!parsed.success) throw parsed.error;
    const diff = computeCandidateDiff((await loadCurrentEventState(prisma, city.id))!, parsed.data);
    return prisma.extractionCandidate.create({
      data: {
        eventId: city.id,
        sourceId: city.sources[0]!.id,
        fetchMode: "FIXTURE",
        providerId: "test",
        providerKind: "FIXTURE",
        payload: parsed.data as unknown as Prisma.InputJsonValue,
        diff: diff as unknown as Prisma.InputJsonValue,
      },
    });
  }

  it("承認すると反映件数付きで候補ページへ遷移し、再承認・却下はレビュー済みとして扱う", async () => {
    const candidate = await createCandidate();
    const url = await redirectOf(approveCandidateAction(candidate.id, initialFormState, fd({})));
    expect(url).toBe(`/admin/candidates/${candidate.id}?notice=approved&added=1&updated=0&unchanged=0&eventFields=1`);
    expect(await prisma.broadcastSlot.count({ where: { originCandidateId: candidate.id } })).toBe(1);

    expect(await redirectOf(approveCandidateAction(candidate.id, initialFormState, fd({})))).toBe(
      `/admin/candidates/${candidate.id}?notice=already-reviewed`,
    );
    expect(await redirectOf(rejectCandidateAction(candidate.id, initialFormState, fd({ note: "x" })))).toBe(
      `/admin/candidates/${candidate.id}?notice=already-reviewed`,
    );
    expect(await prisma.broadcastSlot.count({ where: { originCandidateId: candidate.id } })).toBe(1);
  });

  it("却下は理由メモを保存し、存在しない候補はエラーを返す", async () => {
    const candidate = await createCandidate();
    expect(await redirectOf(rejectCandidateAction(candidate.id, initialFormState, fd({ note: "誤り" })))).toBe(
      `/admin/candidates/${candidate.id}?notice=rejected`,
    );
    expect(await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).toMatchObject({
      reviewStatus: "REJECTED",
      reviewNote: "誤り",
      reviewedAt: new Date(FIXED_NOW),
    });

    const missing = await approveCandidateAction("missing-candidate", initialFormState, fd({}));
    expect(missing).toMatchObject({ status: "error", message: "候補が見つかりません。" });
  });
});
