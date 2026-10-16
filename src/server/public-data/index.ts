/**
 * 公開ページ（トップ・大会詳細・サイトマップ）が使うデータ。ビルド時に読み込む（DB には接続しない）。
 *
 * - 既定: data/real-events.ts（実在の大会の正本）を検証して変換したもの
 * - MIRURIKU_PUBLIC_DATA_FILE を指定した場合: その JSON（E2E でデモデータを使うため。形式は ./json.ts）
 *
 * 静的配信ではビルドした時点のデータが公開される。データを直したら再ビルドしてデプロイする（docs/deploy.md）。
 */
import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import type { PublicEventDetail, PublicEventSummary } from "@/domain/types";

import { REAL_EVENTS } from "../../../data/real-events";
import { compareEvents, publicEventsFromRealEvents } from "./from-real-events";
import { parsePublicData } from "./json";

export type PublicDataSource = "real-events" | "file";

let cache: { source: PublicDataSource; events: readonly PublicEventDetail[] } | undefined;

function load() {
  if (cache) return cache;
  const file = process.env.MIRURIKU_PUBLIC_DATA_FILE?.trim();
  if (file) {
    const events = parsePublicData(readFileSync(path.resolve(file), "utf8")).sort(compareEvents);
    cache = { source: "file", events };
  } else {
    cache = { source: "real-events", events: publicEventsFromRealEvents(REAL_EVENTS) };
  }
  return cache;
}

/** データの出どころ（ビルド情報に記録し、本番デプロイでは real-events 以外を拒否する） */
export function getPublicDataSource(): PublicDataSource {
  return load().source;
}

/** 公開中の大会（終了した大会も含む。表示する期間の絞り込みはブラウザで現在時刻を使って行う） */
export function listPublicEventDetails(): readonly PublicEventDetail[] {
  return load().events;
}

/** 一覧用（詳細だけで使う項目を除き、ページに埋め込むデータを小さくする） */
export function listPublicEventSummaries(): PublicEventSummary[] {
  return load().events.map(
    ({ description: _description, sessions: _sessions, sources: _sources, ...summary }) => summary,
  );
}

export function getPublicEvent(slug: string): PublicEventDetail | null {
  return load().events.find((e) => e.slug === slug) ?? null;
}

/** サイトマップ用（デモ大会は検索エンジンに出さない）。新しい大会から */
export function listSitemapEventSlugs(): string[] {
  return load()
    .events.filter((e) => !e.isDemo)
    .toReversed()
    .map((e) => e.slug);
}
