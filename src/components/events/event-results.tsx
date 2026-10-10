import Link from "next/link";

import { BROADCAST_MEDIUM_LABELS, CATEGORY_LABELS } from "@/domain/labels";
import {
  DEFAULT_FILTERS,
  PERIOD_LABELS,
  toQueryString,
  type EventFilters,
} from "@/domain/filters";
import type { PublicEventSummary } from "@/domain/types";

import { DemoNotice } from "./demo-notice";
import { EventCard } from "./event-card";

type Props = {
  /** 絞り込み・並び替え済みの大会 */
  events: readonly PublicEventSummary[];
  filters: EventFilters;
  now: Date;
  /** 選択中の期間の実際の日付範囲。例: "10月10日（土）〜10月16日（金）" */
  periodRangeLabel: string;
};

function describeConditions(filters: EventFilters): string[] {
  const items: string[] = [];
  if (filters.categories.length > 0) items.push(filters.categories.map((c) => CATEGORY_LABELS[c]).join("・"));
  if (filters.media.length > 0) items.push(filters.media.map((m) => BROADCAST_MEDIUM_LABELS[m]).join("・"));
  if (filters.freeInternet) items.push("無料ネット配信あり");
  if (filters.q) items.push(`「${filters.q}」`);
  return items;
}

const linkClass =
  "rounded-sm font-medium text-primary underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function EmptyState({ filters }: { filters: EventFilters }) {
  const suggestions: { key: string; label: string; next: EventFilters }[] = [];
  if (filters.period !== "upcoming") {
    suggestions.push({ key: "period", label: `期間を「${PERIOD_LABELS.upcoming}」に広げる`, next: { ...filters, period: "upcoming" } });
  }
  if (filters.categories.length > 0) {
    suggestions.push({ key: "category", label: "競技の絞り込みを外す", next: { ...filters, categories: [] } });
  }
  if (filters.media.length > 0) {
    suggestions.push({ key: "medium", label: "視聴方法の絞り込みを外す", next: { ...filters, media: [] } });
  }
  if (filters.freeInternet) {
    suggestions.push({ key: "free", label: "「無料ネット配信あり」を外す", next: { ...filters, freeInternet: false } });
  }
  if (filters.q) {
    suggestions.push({ key: "q", label: `検索語「${filters.q}」を外す`, next: { ...filters, q: "" } });
  }
  const isDefault = toQueryString(filters) === "";

  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center" data-testid="event-empty">
      <p className="text-lg font-semibold">条件に合う大会はありません</p>
      {isDefault ? (
        <p className="mt-2 text-sm text-muted-foreground">現在、今日以降に開催予定の大会は掲載されていません。</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">条件を変えると見つかるかもしれません。</p>
          <ul className="mt-4 flex flex-col items-center gap-2 text-sm">
            {suggestions.map((s) => (
              <li key={s.key}>
                <Link href={`/${toQueryString(s.next)}`} replace scroll={false} className={linkClass}>
                  {s.label}
                </Link>
              </li>
            ))}
            {suggestions.length > 1 ? (
              <li>
                <Link href={`/${toQueryString(DEFAULT_FILTERS)}`} replace scroll={false} className={linkClass}>
                  条件をすべてクリア
                </Link>
              </li>
            ) : null}
          </ul>
        </>
      )}
    </div>
  );
}

/** 絞り込み結果（件数、デモデータのお知らせ、大会カードの時系列一覧、該当なし表示） */
export function EventResults({ events, filters, now, periodRangeLabel }: Props) {
  const hasDemo = events.some((e) => e.isDemo);
  const conditions = describeConditions(filters);

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="event-results-heading" className="text-xl font-bold">
            大会一覧
          </h2>
          <p className="text-sm">
            <strong data-testid="event-count" className="text-lg font-bold">
              {events.length}件
            </strong>
          </p>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="event-result-summary">
          期間: {PERIOD_LABELS[filters.period]} {periodRangeLabel}
          {conditions.length > 0 ? ` ／ 絞り込み: ${conditions.join("、")}` : ""}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        開催日の早い順に表示しています。日付・時刻は日本時間です（海外大会は現地日時も併記）。
      </p>

      {hasDemo ? <DemoNotice /> : null}

      {events.length === 0 ? (
        <EmptyState filters={filters} />
      ) : (
        <ol className="flex flex-col gap-4" aria-labelledby="event-results-heading">
          {events.map((event) => (
            <li key={event.id}>
              <EventCard event={event} now={now} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
