"use client";

/**
 * 大会詳細（ブラウザで動く部分）。「開催中」「終了」などの時刻による表示を、読み込み後にブラウザの現在時刻で描画し直す
 * （ビルド時の HTML はビルド時刻の表示）。
 */
import type { PublicEventDetail } from "@/domain/types";

import { EventDetail } from "./event-detail";
import { useCurrentTime } from "./home-events";

export function EventDetailLive({ event, initialNow }: { event: PublicEventDetail; initialNow: string }) {
  const now = useCurrentTime(initialNow);
  return <EventDetail event={event} now={now} />;
}
