import { CalendarDays, Clock, Globe, MapPin } from "lucide-react";

import type { PublicEventSummary } from "@/domain/types";

import { countryNameJa, isOverseas, type EventScheduleView } from "./event-format";

/**
 * 開催日・競技開始時刻の要約（一覧カード用）。
 * 開始時刻が不明なときは「開始時刻未定」を表示し、0:00 などの仮時刻は出さない。
 * 海外大会は日本時間の日時と現地日時を併記する。
 */
export function EventScheduleSummary({ view }: { view: EventScheduleView }) {
  const { labels, timing } = view;
  return (
    <div className="flex flex-col gap-1.5" data-testid="event-schedule">
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
        <dt className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays aria-hidden="true" className="size-3.5" />
          開催日
        </dt>
        <dd>
          <span className="text-base font-semibold tabular-nums">{labels.dateLabel}</span>{" "}
          <span className="text-xs text-muted-foreground">（{labels.dateBasisLabel}）</span>
        </dd>
        <dt className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock aria-hidden="true" className="size-3.5" />
          {timing.isMultiDay ? "初日開始" : "競技開始"}
        </dt>
        <dd>
          {labels.startTimeLabel ? (
            <>
              <span className="text-base font-semibold tabular-nums">{labels.startTimeLabel}</span>{" "}
              <span className="text-xs text-muted-foreground">（日本時間）</span>
            </>
          ) : (
            <span className="text-sm font-medium text-amber-900">{labels.startTimeUnknownLabel}</span>
          )}
        </dd>
      </dl>
      {labels.localLabel ? (
        <p className="flex items-start gap-1.5 text-sm">
          <Globe aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span>{labels.localLabel}</span>
        </p>
      ) : null}
      {timing.jstDateDiffersFromLocal ? (
        <p className="text-xs font-medium text-amber-900">※ 日本時間では現地と日付が異なります</p>
      ) : null}
    </div>
  );
}

/** 開催場所の 1 行表示（会場・地域、海外なら国名） */
export function EventVenueLine({
  event,
}: {
  event: Pick<PublicEventSummary, "venueName" | "venueRegion" | "countryCode" | "timezone">;
}) {
  const parts = [event.venueName, event.venueRegion].filter((v): v is string => Boolean(v?.trim()));
  if (isOverseas(event)) parts.push(countryNameJa(event.countryCode));
  if (parts.length === 0) return null;
  return (
    <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
      <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="sr-only">開催場所: </span>
        {parts.join(" · ")}
      </span>
    </p>
  );
}
