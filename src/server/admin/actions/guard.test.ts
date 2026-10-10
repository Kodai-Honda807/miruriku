/**
 * すべての管理用 Server Action が、管理機能が無効な環境では入力の解析や DB アクセスより前に拒否することを確かめる。
 * Server Action は action ID を知っていればどのページからでも POST できるため、画面の制御とは独立に検証する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  getPrisma: vi.fn(() => {
    throw new Error("テスト: DB にアクセスしてはいけない");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("テスト: redirect してはいけない");
  }),
  notFound: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AdminDisabledError } from "@/server/admin-guard";
import { getPrisma } from "@/server/db";

import { initialFormState } from "../form-state";
import { approveCandidateAction, rejectCandidateAction } from "./candidates";
import { createEventAction, setEventStatusAction, updateEventAction } from "./events";
import { createSessionAction, deleteSessionAction } from "./sessions";
import { createSlotAction, deleteSlotAction, setSlotStatusAction, updateSlotAction } from "./slots";
import { createSourceAction, deleteSourceAction, updateSourceAction } from "./sources";

function formData(entries: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

/** 正しい形の入力（拒否が入力の検証によるものではないことを確かめるため） */
const EVENT_INPUT = formData({
  seriesMode: "existing",
  seriesId: "series-1",
  name: "大会",
  slug: "event-1",
  seasonYear: "2026",
  category: "MARATHON",
  countryCode: "JP",
  timezone: "Asia/Tokyo",
  startDate: "2026-10-11",
  endDate: "2026-10-11",
  broadcastInfoStatus: "UNVERIFIED",
});

const ACTIONS: [string, () => Promise<unknown>][] = [
  ["createEventAction", () => createEventAction(initialFormState, EVENT_INPUT)],
  ["updateEventAction", () => updateEventAction("event-1", initialFormState, EVENT_INPUT)],
  ["setEventStatusAction", () => setEventStatusAction("event-1", "PUBLISHED")],
  ["createSlotAction", () => createSlotAction("event-1", initialFormState, formData())],
  ["updateSlotAction", () => updateSlotAction("event-1", "slot-1", initialFormState, formData())],
  ["deleteSlotAction", () => deleteSlotAction("event-1", "slot-1")],
  ["setSlotStatusAction", () => setSlotStatusAction("event-1", "slot-1", "PUBLISHED")],
  ["createSourceAction", () => createSourceAction("event-1", initialFormState, formData({ kind: "OTHER", url: "https://example.com/" }))],
  ["updateSourceAction", () => updateSourceAction("event-1", "source-1", initialFormState, formData())],
  ["deleteSourceAction", () => deleteSourceAction("event-1", "source-1")],
  ["createSessionAction", () => createSessionAction("event-1", initialFormState, formData({ name: "1日目", date: "2026-10-11" }))],
  ["deleteSessionAction", () => deleteSessionAction("event-1", "session-1")],
  ["approveCandidateAction", () => approveCandidateAction("candidate-1", initialFormState, formData())],
  ["rejectCandidateAction", () => rejectCandidateAction("candidate-1", initialFormState, formData())],
  // 不正な入力でも、入力の解析より前に拒否される（Zod のエラーではなく AdminDisabledError）
  ["setEventStatusAction（不正な入力）", () => setEventStatusAction("../../etc", "ARCHIVED")],
  ["deleteSlotAction（不正な入力）", () => deleteSlotAction("' OR 1=1 --", "")],
];

const DISABLED_ENVS: { label: string; NODE_ENV: string; MIRURIKU_ADMIN_ENABLED: string | undefined }[] = [
  { label: "本番モード（MIRURIKU_ADMIN_ENABLED=true でも無効）", NODE_ENV: "production", MIRURIKU_ADMIN_ENABLED: "true" },
  { label: "開発モードで未設定", NODE_ENV: "development", MIRURIKU_ADMIN_ENABLED: undefined },
  { label: "表記ゆれ（TRUE）", NODE_ENV: "test", MIRURIKU_ADMIN_ENABLED: "TRUE" },
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe.each(DISABLED_ENVS)("管理機能が無効: $label", ({ NODE_ENV, MIRURIKU_ADMIN_ENABLED }) => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", NODE_ENV);
    vi.stubEnv("MIRURIKU_ADMIN_ENABLED", MIRURIKU_ADMIN_ENABLED);
  });

  it.each(ACTIONS)("%s は DB に触れずに拒否する", async (_name, call) => {
    await expect(call()).rejects.toBeInstanceOf(AdminDisabledError);
    expect(getPrisma).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("管理機能が有効（開発モード + MIRURIKU_ADMIN_ENABLED=true）", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MIRURIKU_ADMIN_ENABLED", "true");
  });

  it("入力エラーは DB に触れず、項目ごとのエラーとして返す", async () => {
    const state = await createEventAction(initialFormState, formData({ slug: "Bad Slug", officialUrl: "javascript:alert(1)" }));
    expect(state.status).toBe("error");
    expect(state.fieldErrors.name).toBeDefined();
    expect(state.fieldErrors.slug).toBeDefined();
    expect(state.fieldErrors.officialUrl).toBeDefined();
    expect(state.values.slug).toBe("Bad Slug");
    expect(state.attempt).toBe(1);
    expect(getPrisma).not.toHaveBeenCalled();
  });

  it("日付なしの時刻を含む放送枠は DB に触れずにエラー", async () => {
    const state = await createSlotAction(
      "event-1",
      initialFormState,
      formData({
        medium: "INTERNET",
        providerName: "配信",
        startTime: "10:00",
        cost: "FREE",
        viewingType: "LIVE",
        region: "NATIONWIDE",
        verificationStatus: "UNVERIFIED",
        status: "DRAFT",
      }),
    );
    expect(state.status).toBe("error");
    expect(state.fieldErrors.airDate).toBeDefined();
    expect(getPrisma).not.toHaveBeenCalled();
  });

  it("不正な ID は DB に触れずにエラー", async () => {
    const state = await approveCandidateAction("../candidate", initialFormState, formData());
    expect(state.status).toBe("error");
    expect(getPrisma).not.toHaveBeenCalled();
  });
});
