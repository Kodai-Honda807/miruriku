"use client";

/**
 * トップページの絞り込みと一覧（ブラウザで動く部分）。
 *
 * 静的配信のため、大会データはビルド時にページへ埋め込み、絞り込み・並び替えはブラウザで行う。
 * - 条件の正は URL のクエリ（?period=week&category=ekiden など）。useSearchParams で読み、
 *   条件を変えたら history.replaceState で URL を書き換える（履歴は増やさない。Next.js のルーターも追従する）。
 * - 現在時刻はブラウザの時計（日本時間で判定する既存の関数を使う）。1 分ごとと、タブに戻ったときに更新する。
 * - ビルド時の HTML（JavaScript なし・読み込み直後）は「既定の条件・ビルド時刻」の一覧。
 *   読み込み後に URL の条件と現在時刻で描画し直す（初回の描画をビルド時の HTML と一致させ、表示の食い違いを防ぐ）。
 */
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, useTransition } from "react";

import {
  PERIODS,
  PERIOD_LABELS,
  filterAndSortEvents,
  getPeriodRange,
  parseEventFilters,
} from "@/domain/filters";
import type { PublicEventSummary } from "@/domain/types";
import { getNow } from "@/lib/clock";

import { EventFilterForm, type PeriodOption } from "./event-filter-form";
import { formatPeriodRange } from "./event-format";
import { EventResults } from "./event-results";
import { FilterPendingRegion, FilterTransitionProvider } from "./filter-transition";

type Props = {
  /** 公開中の大会（終了した大会も含む。表示する範囲は現在時刻で絞る） */
  events: readonly PublicEventSummary[];
  /** ビルド時刻（ISO 8601）。初回の描画に使う */
  initialNow: string;
};

const NOW_REFRESH_MS = 60_000;

/**
 * URL のクエリを親に知らせる。useSearchParams はビルド時の描画では使えない（Suspense の外側を静的に保つため、
 * この部品だけを Suspense で囲み、一覧そのものはビルド時の HTML に含める）。
 */
function SearchParamsListener({ onChange }: { onChange: (search: string) => void }) {
  const search = useSearchParams().toString();
  useEffect(() => onChange(search), [search, onChange]);
  return null;
}

/** 現在時刻。読み込み後はブラウザの時計で 1 分ごと・タブに戻ったときに更新する */
export function useCurrentTime(initialNow: string): Date {
  const [now, setNow] = useState(() => new Date(initialNow));
  useEffect(() => {
    const refresh = () => setNow(getNow());
    refresh();
    const timer = window.setInterval(refresh, NOW_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}

export function HomeEvents({ events, initialNow }: Props) {
  const now = useCurrentTime(initialNow);
  // null: まだ URL を読んでいない（ビルド時の描画・読み込み直後）。既定の条件で描画する
  const [search, setSearch] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filters = useMemo(() => parseEventFilters(new URLSearchParams(search ?? "")), [search]);
  const visible = useMemo(() => filterAndSortEvents(events, filters, now), [events, filters, now]);
  const periodOptions: PeriodOption[] = useMemo(
    () =>
      PERIODS.map((period) => ({
        value: period,
        label: PERIOD_LABELS[period],
        rangeLabel: formatPeriodRange(getPeriodRange(period, now), now),
      })),
    [now],
  );

  const handleSearchChange = useCallback((next: string) => {
    startTransition(() => setSearch(next));
  }, []);

  const navigate = useCallback((href: string) => {
    window.history.replaceState(window.history.state, "", href);
    setSearch(new URL(href, window.location.href).searchParams.toString());
  }, []);

  return (
    <FilterTransitionProvider>
      <Suspense fallback={null}>
        <SearchParamsListener onChange={handleSearchChange} />
      </Suspense>

      {/* data-filters-ready: URL の条件を読んで描画し終えた印（E2E が操作の前に待つ） */}
      <section
        aria-labelledby="event-filter-heading"
        className="flex flex-col gap-3"
        data-filters-ready={search === null ? undefined : "true"}
      >
        <h2 id="event-filter-heading" className="sr-only">
          絞り込み
        </h2>
        <EventFilterForm filters={filters} periodOptions={periodOptions} onNavigate={navigate} />
        <noscript>
          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            絞り込みには JavaScript が必要です。JavaScript が無効な場合は、これから開催される大会の一覧（更新時点）を表示しています。
          </p>
        </noscript>
      </section>

      <section aria-labelledby="event-results-heading">
        <FilterPendingRegion>
          <EventResults
            events={visible}
            filters={filters}
            now={now}
            periodRangeLabel={formatPeriodRange(getPeriodRange(filters.period, now), now)}
          />
        </FilterPendingRegion>
      </section>
    </FilterTransitionProvider>
  );
}
