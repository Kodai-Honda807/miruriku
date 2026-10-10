/**
 * DB の値 → フォームの初期値（name → 文字列）。
 * 大会・セッションの時刻は開催地の現地時刻、放送枠の日時は日本時間で表す。
 */
import { JST, dbDateToLocalDate, jstDateOf, toZonedParts } from "@/domain/datetime";
import type {
  BroadcastInfoStatus,
  BroadcastMedium,
  Category,
  CostType,
  PublicationStatus,
  RegionAvailability,
  SlotVerificationStatus,
  SourceKind,
  ViewingType,
} from "@/domain/enums";

export function newEventDefaults(now: Date, hasSeries: boolean): Record<string, string> {
  return {
    seriesMode: hasSeries ? "existing" : "new",
    seasonYear: jstDateOf(now).slice(0, 4),
    timezone: JST,
    countryCode: "JP",
    broadcastInfoStatus: "UNVERIFIED",
  };
}

export function eventToFormDefaults(event: {
  seriesId: string;
  name: string;
  slug: string;
  editionLabel: string | null;
  seasonYear: number;
  category: Category;
  description: string | null;
  venueName: string | null;
  venueRegion: string | null;
  countryCode: string;
  timezone: string;
  startDate: Date;
  endDate: Date;
  startAt: Date | null;
  officialUrl: string | null;
  broadcastInfoStatus: BroadcastInfoStatus;
  broadcastNote: string | null;
}): Record<string, string> {
  return {
    seriesMode: "existing",
    seriesId: event.seriesId,
    name: event.name,
    slug: event.slug,
    editionLabel: event.editionLabel ?? "",
    seasonYear: String(event.seasonYear),
    category: event.category,
    description: event.description ?? "",
    venueName: event.venueName ?? "",
    venueRegion: event.venueRegion ?? "",
    countryCode: event.countryCode,
    timezone: event.timezone,
    startDate: dbDateToLocalDate(event.startDate),
    endDate: dbDateToLocalDate(event.endDate),
    startTime: event.startAt ? toZonedParts(event.startAt, event.timezone).time : "",
    officialUrl: event.officialUrl ?? "",
    broadcastInfoStatus: event.broadcastInfoStatus,
    broadcastNote: event.broadcastNote ?? "",
  };
}

export const NEW_SLOT_DEFAULTS: Record<string, string> = {
  cost: "UNKNOWN",
  viewingType: "UNKNOWN",
  region: "UNKNOWN",
  verificationStatus: "UNVERIFIED",
  status: "DRAFT",
};

export function slotToFormDefaults(slot: {
  medium: BroadcastMedium;
  providerName: string;
  airDate: Date | null;
  startAt: Date | null;
  endAt: Date | null;
  cost: CostType;
  viewingType: ViewingType;
  region: RegionAvailability;
  regionNote: string | null;
  note: string | null;
  watchUrl: string | null;
  infoUrl: string | null;
  verificationStatus: SlotVerificationStatus;
  status: PublicationStatus;
  sourceId: string | null;
}): Record<string, string> {
  const start = slot.startAt ? toZonedParts(slot.startAt, JST) : null;
  const end = slot.endAt ? toZonedParts(slot.endAt, JST) : null;
  return {
    medium: slot.medium,
    providerName: slot.providerName,
    // 開始の瞬間が分かっていれば、その日本時間の日付を放送日とする
    airDate: start?.date ?? (slot.airDate ? dbDateToLocalDate(slot.airDate) : ""),
    startTime: start?.time ?? "",
    endTime: start && end ? end.time : "",
    cost: slot.cost,
    viewingType: slot.viewingType,
    region: slot.region,
    regionNote: slot.regionNote ?? "",
    note: slot.note ?? "",
    watchUrl: slot.watchUrl ?? "",
    infoUrl: slot.infoUrl ?? "",
    verificationStatus: slot.verificationStatus,
    status: slot.status,
    sourceId: slot.sourceId ?? "",
  };
}

export const NEW_SOURCE_DEFAULTS: Record<string, string> = { kind: "OFFICIAL_SITE" };

export function sourceToFormDefaults(source: {
  kind: SourceKind;
  url: string;
  title: string | null;
  note: string | null;
  collectEnabled: boolean;
}): Record<string, string> {
  return {
    kind: source.kind,
    url: source.url,
    title: source.title ?? "",
    note: source.note ?? "",
    collectEnabled: source.collectEnabled ? "on" : "",
  };
}
