/**
 * 実在の大会データ（data/real-events.ts）を DB に反映する。
 *
 * - 定義は Zod で検証してから書き込む。確認済みの枠に出典・確認日時がない、URL が http(s) でない、
 *   デモ用のドメインが混ざっている、などの定義は書き込まずにエラーにする
 * - slug・固定 ID で upsert するため、何度実行しても重複しない
 * - データファイルで管理する項目（大会の基本情報・放送情報の状態・定義した枠・情報源）は、
 *   実行のたびにファイルの内容へ戻す。ファイルで管理する枠の ID は `real:<slug>:slot:<key>`
 * - 収集候補の承認などで追加された枠（ID が上記以外）は消さない。収集実行履歴・候補にも触れない
 * - デモ大会（isDemo=true）には触れない。removeDemo を指定したときだけ、デモ大会とデモのシリーズを削除する
 */
import { z } from "zod";

import {
  isValidLocalDate,
  isValidLocalTime,
  isValidTimeZone,
  JST,
  localDateToDbDate,
  zonedToUtc,
  type LocalDate,
} from "../src/domain/datetime";
import type { PrismaClient } from "../src/generated/prisma/client";

// ---------------------------------------------------------------------------
// 定義の型と検証
// ---------------------------------------------------------------------------

/** IANA の予約ドメイン（デモ用）。実在データに混ざっていたらエラーにする */
const DEMO_HOST_RE = /(^|\.)example\.(com|org|net)$/i;

const urlSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "http(s) の URL を指定してください")
  .refine((value) => !DEMO_HOST_RE.test(new URL(value).hostname), "デモ用のドメイン（example.*）は使えません");

const localDateSchema = z.string().refine(isValidLocalDate, "YYYY-MM-DD 形式の日付を指定してください");
const localTimeSchema = z.string().refine(isValidLocalTime, "HH:MM 形式の時刻を指定してください");
const instantSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/, "タイムゾーン付きの日時を指定してください")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "日時が不正です");
const keySchema = z.string().regex(/^[a-z0-9-]{1,40}$/, "key は英小文字・数字・ハイフンで指定してください");
const textSchema = (max: number) => z.string().trim().min(1).max(max);

const sourceSchema = z.strictObject({
  key: keySchema,
  kind: z.enum(["OFFICIAL_SITE", "BROADCAST_INFO", "OTHER"]),
  url: urlSchema,
  title: textSchema(200),
  note: textSchema(1000).optional(),
  /** 収集 CLI による取得を許可するか（robots.txt と利用条件を確認した情報源だけ true にする） */
  collectEnabled: z.boolean().optional(),
});

const sessionSchema = z.strictObject({
  key: keySchema,
  name: textSchema(200),
  date: localDateSchema,
  /** 開催地の現地時刻（不明なら null） */
  startTime: localTimeSchema.nullable(),
  note: textSchema(1000).nullable(),
});

const slotSchema = z
  .strictObject({
    key: keySchema,
    medium: z.enum(["TERRESTRIAL", "BS", "CS", "INTERNET", "RADIO"]),
    providerName: textSchema(100),
    /** 日本時間の放送日 */
    airDate: localDateSchema.nullable(),
    /** 日本時間の開始・終了時刻（不明なら null。終了が開始より前なら翌日とみなす） */
    startTime: localTimeSchema.nullable(),
    endTime: localTimeSchema.nullable(),
    cost: z.enum(["FREE", "PAID", "UNKNOWN"]),
    viewingType: z.enum(["LIVE", "DELAYED", "ON_DEMAND", "UNKNOWN"]),
    region: z.enum(["NATIONWIDE", "REGIONAL", "JAPAN_UNKNOWN", "UNKNOWN"]),
    regionNote: textSchema(200).nullable(),
    note: textSchema(1000).nullable(),
    watchUrl: urlSchema.nullable(),
    infoUrl: urlSchema.nullable(),
    verificationStatus: z.enum(["CONFIRMED", "UNVERIFIED", "PAST_REFERENCE"]),
    sourceKey: keySchema.nullable(),
    /** 人が出典を確認した日時 */
    verifiedAt: instantSchema.nullable(),
  })
  .superRefine((slot, ctx) => {
    if ((slot.startTime || slot.endTime) && !slot.airDate) {
      ctx.addIssue({ code: "custom", path: ["airDate"], message: "時刻を書くときは放送日（airDate）も必要です" });
    }
    if (slot.endTime && !slot.startTime) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "開始時刻なしで終了時刻だけを書くことはできません" });
    }
    if (slot.verificationStatus === "CONFIRMED") {
      if (!slot.sourceKey) {
        ctx.addIssue({ code: "custom", path: ["sourceKey"], message: "確認済みの枠には出典（sourceKey）が必要です" });
      }
      if (!slot.verifiedAt) {
        ctx.addIssue({ code: "custom", path: ["verifiedAt"], message: "確認済みの枠には確認日時（verifiedAt）が必要です" });
      }
    }
  });

const eventSchema = z
  .strictObject({
    slug: z.string().regex(/^[a-z0-9-]{3,100}$/, "slug は英小文字・数字・ハイフンで指定してください"),
    series: z.strictObject({
      slug: z.string().regex(/^[a-z0-9-]{3,100}$/),
      name: textSchema(200),
      officialUrl: urlSchema.nullable(),
    }),
    name: textSchema(200),
    editionLabel: textSchema(50).nullable(),
    category: z.enum(["EKIDEN", "MARATHON", "TRACK"]),
    description: textSchema(2000).nullable(),
    venueName: textSchema(200).nullable(),
    venueRegion: textSchema(200).nullable(),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    timezone: z.string().refine(isValidTimeZone, "IANA タイムゾーン名を指定してください"),
    /** 開催地の現地日付 */
    startDate: localDateSchema,
    endDate: localDateSchema,
    /** 競技開始の現地時刻（不明なら null） */
    startTime: localTimeSchema.nullable(),
    officialUrl: urlSchema.nullable(),
    broadcastInfoStatus: z.enum(["CONFIRMED", "NOT_ANNOUNCED", "UNVERIFIED", "NO_BROADCAST", "PAST_REFERENCE"]),
    broadcastNote: textSchema(1000).nullable(),
    /** 人が放送情報を最後に確認した日時 */
    broadcastCheckedAt: instantSchema.nullable(),
    sessions: z.array(sessionSchema).max(50).optional(),
    sources: z.array(sourceSchema).max(20),
    slots: z.array(slotSchema).max(30),
  })
  .superRefine((event, ctx) => {
    if (event.endDate < event.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "終了日が開始日より前です" });
    }
    const sourceKeys = new Set(event.sources.map((s) => s.key));
    if (sourceKeys.size !== event.sources.length) {
      ctx.addIssue({ code: "custom", path: ["sources"], message: "情報源の key が重複しています" });
    }
    if (new Set(event.sources.map((s) => s.url)).size !== event.sources.length) {
      ctx.addIssue({ code: "custom", path: ["sources"], message: "情報源の URL が重複しています" });
    }
    if (new Set(event.slots.map((s) => s.key)).size !== event.slots.length) {
      ctx.addIssue({ code: "custom", path: ["slots"], message: "放送枠の key が重複しています" });
    }
    if (event.sessions && new Set(event.sessions.map((s) => s.key)).size !== event.sessions.length) {
      ctx.addIssue({ code: "custom", path: ["sessions"], message: "セッションの key が重複しています" });
    }
    event.slots.forEach((slot, i) => {
      if (slot.sourceKey && !sourceKeys.has(slot.sourceKey)) {
        ctx.addIssue({ code: "custom", path: ["slots", i, "sourceKey"], message: `情報源 ${slot.sourceKey} が定義されていません` });
      }
    });
    const hasCurrentSlots = event.slots.some((s) => s.verificationStatus !== "PAST_REFERENCE");
    if (event.broadcastInfoStatus === "NO_BROADCAST" && hasCurrentSlots) {
      ctx.addIssue({ code: "custom", path: ["broadcastInfoStatus"], message: "「放送・配信なし」なのに今年の放送枠があります" });
    }
    if (event.broadcastInfoStatus === "CONFIRMED" && !event.slots.some((s) => s.verificationStatus === "CONFIRMED")) {
      ctx.addIssue({ code: "custom", path: ["broadcastInfoStatus"], message: "「確認済み」なのに確認済みの放送枠がありません" });
    }
    if (event.broadcastInfoStatus !== "UNVERIFIED" && !event.broadcastCheckedAt) {
      ctx.addIssue({ code: "custom", path: ["broadcastCheckedAt"], message: "放送情報の状態を確認したら確認日時が必要です" });
    }
  });

export type RealEventDef = z.input<typeof eventSchema>;
export type ParsedEvent = z.output<typeof eventSchema>;

export const realEventsSchema = z.array(eventSchema).superRefine((events, ctx) => {
  if (new Set(events.map((e) => e.slug)).size !== events.length) {
    ctx.addIssue({ code: "custom", message: "大会の slug が重複しています" });
  }
});

/** 定義を検証する。問題があれば、どの大会のどの項目かが分かるメッセージで例外を投げる */
export function parseRealEvents(defs: unknown): ParsedEvent[] {
  const result = realEventsSchema.safeParse(defs);
  if (result.success) return result.data;
  const lines = result.error.issues.map((issue) => {
    const [index, ...rest] = issue.path;
    const slug = typeof index === "number" ? ((defs as { slug?: string }[])[index]?.slug ?? `#${index}`) : "";
    return `- ${slug} ${rest.join(".")}: ${issue.message}`;
  });
  throw new Error(`data/real-events.ts の定義に問題があります:\n${lines.join("\n")}`);
}

// ---------------------------------------------------------------------------
// DB への反映
// ---------------------------------------------------------------------------

export function realChildId(slug: string, kind: "slot" | "session", key: string): string {
  return `real:${slug}:${kind}:${key}`;
}

/** 放送枠の開始・終了の瞬間（日本時間の放送日・時刻から。終了が開始以前なら翌日とみなす） */
export function slotInstants(slot: ParsedEvent["slots"][number]): { startAt: Date | null; endAt: Date | null } {
  if (!slot.airDate || !slot.startTime) return { startAt: null, endAt: null };
  const startAt = zonedToUtc(slot.airDate as LocalDate, slot.startTime, JST);
  if (!slot.endTime) return { startAt, endAt: null };
  let endAt = zonedToUtc(slot.airDate as LocalDate, slot.endTime, JST);
  // 終了が開始以前なら日付をまたぐ放送（例: 23:00〜1:30）
  if (endAt.getTime() <= startAt.getTime()) endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
  return { startAt, endAt };
}

export type LoadRealEventsResult = {
  eventCount: number;
  slotCount: number;
  removedDemoEventCount: number;
};

export async function loadRealEvents(
  prisma: PrismaClient,
  defs: unknown,
  opts: { removeDemo?: boolean } = {},
): Promise<LoadRealEventsResult> {
  const events = parseRealEvents(defs);
  let slotCount = 0;

  for (const def of events) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.event.findUnique({ where: { slug: def.slug }, select: { isDemo: true } });
      if (existing?.isDemo) throw new Error(`slug ${def.slug} はデモ大会として使われています`);

      const series = await tx.eventSeries.upsert({
        where: { slug: def.series.slug },
        create: { slug: def.series.slug, name: def.series.name, officialUrl: def.series.officialUrl, isDemo: false },
        update: { name: def.series.name, officialUrl: def.series.officialUrl },
      });

      const eventData = {
        seriesId: series.id,
        name: def.name,
        editionLabel: def.editionLabel,
        seasonYear: Number(def.startDate.slice(0, 4)),
        category: def.category,
        status: "PUBLISHED" as const,
        isDemo: false,
        description: def.description,
        venueName: def.venueName,
        venueRegion: def.venueRegion,
        countryCode: def.countryCode,
        timezone: def.timezone,
        startDate: localDateToDbDate(def.startDate as LocalDate),
        endDate: localDateToDbDate(def.endDate as LocalDate),
        startAt: def.startTime ? zonedToUtc(def.startDate as LocalDate, def.startTime, def.timezone) : null,
        officialUrl: def.officialUrl,
        broadcastInfoStatus: def.broadcastInfoStatus,
        broadcastNote: def.broadcastNote,
        broadcastCheckedAt: def.broadcastCheckedAt ? new Date(def.broadcastCheckedAt) : null,
      };
      const event = await tx.event.upsert({
        where: { slug: def.slug },
        create: { slug: def.slug, ...eventData },
        update: eventData,
      });

      // 情報源: (eventId, url) で upsert。定義から外した情報源は残す（承認済みの枠や収集履歴が参照しているため）
      const sourceIds = new Map<string, string>();
      for (const source of def.sources) {
        const data = {
          kind: source.kind,
          title: source.title,
          note: source.note ?? null,
          collectEnabled: source.collectEnabled ?? false,
        };
        const row = await tx.source.upsert({
          where: { eventId_url: { eventId: event.id, url: source.url } },
          create: { eventId: event.id, url: source.url, ...data },
          update: data,
        });
        sourceIds.set(source.key, row.id);
      }

      // セッション: ファイルで管理する ID のものだけを作り直す
      const sessionIds = (def.sessions ?? []).map((s) => realChildId(def.slug, "session", s.key));
      await tx.eventSession.deleteMany({
        where: { eventId: event.id, id: { startsWith: `real:${def.slug}:session:`, notIn: sessionIds } },
      });
      for (const [i, session] of (def.sessions ?? []).entries()) {
        const id = realChildId(def.slug, "session", session.key);
        const data = {
          name: session.name,
          date: localDateToDbDate(session.date as LocalDate),
          startAt: session.startTime ? zonedToUtc(session.date as LocalDate, session.startTime, def.timezone) : null,
          note: session.note,
          sortOrder: i,
        };
        await tx.eventSession.upsert({ where: { id }, create: { id, eventId: event.id, ...data }, update: data });
      }

      // 放送枠: ファイルで管理する ID のものだけを更新・削除する（承認で追加された枠は残す）
      const slotIds = def.slots.map((s) => realChildId(def.slug, "slot", s.key));
      await tx.broadcastSlot.deleteMany({
        where: { eventId: event.id, id: { startsWith: `real:${def.slug}:slot:`, notIn: slotIds } },
      });
      for (const [i, slot] of def.slots.entries()) {
        const id = realChildId(def.slug, "slot", slot.key);
        const data = {
          medium: slot.medium,
          providerName: slot.providerName,
          airDate: slot.airDate ? localDateToDbDate(slot.airDate as LocalDate) : null,
          ...slotInstants(slot),
          cost: slot.cost,
          viewingType: slot.viewingType,
          region: slot.region,
          regionNote: slot.regionNote,
          note: slot.note,
          watchUrl: slot.watchUrl,
          infoUrl: slot.infoUrl,
          verificationStatus: slot.verificationStatus,
          status: "PUBLISHED" as const,
          verifiedAt: slot.verifiedAt ? new Date(slot.verifiedAt) : null,
          sourceId: slot.sourceKey ? (sourceIds.get(slot.sourceKey) ?? null) : null,
          sortOrder: i,
        };
        await tx.broadcastSlot.upsert({ where: { id }, create: { id, eventId: event.id, ...data }, update: data });
        slotCount += 1;
      }
    });
  }

  let removedDemoEventCount = 0;
  if (opts.removeDemo) {
    removedDemoEventCount = await prisma.$transaction(async (tx) => {
      // 子レコード（枠・セッション・情報源・収集履歴・候補）は外部キーの Cascade で削除される
      const { count } = await tx.event.deleteMany({ where: { isDemo: true } });
      await tx.eventSeries.deleteMany({ where: { isDemo: true, events: { none: {} } } });
      return count;
    });
  }

  return { eventCount: events.length, slotCount, removedDemoEventCount };
}
