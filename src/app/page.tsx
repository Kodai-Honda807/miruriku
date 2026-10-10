import { connection } from "next/server";
import { Suspense } from "react";

import { EventFilterForm, type PeriodOption } from "@/components/events/event-filter-form";
import { formatPeriodRange } from "@/components/events/event-format";
import { EventResults } from "@/components/events/event-results";
import { EventListSkeleton, FilterFormSkeleton } from "@/components/events/event-skeletons";
import { FilterPendingRegion, FilterTransitionProvider } from "@/components/events/filter-transition";
import { SiteShell } from "@/components/site/site-shell";
import {
  PERIODS,
  PERIOD_LABELS,
  filterAndSortEvents,
  getPeriodRange,
  parseEventFilters,
} from "@/domain/filters";
import { getNow } from "@/server/clock";
import { listPublicEvents } from "@/server/queries/public-events";

type SearchParamsPromise = PageProps<"/">["searchParams"];

/**
 * トップページ: 駅伝・マラソン・トラックの大会を同じ時系列一覧で表示する（日本時間基準）。
 *
 * Cache Components 下の構成:
 * - ページ本体（ヘッダー・見出し・説明）は静的シェルとしてプリレンダリングされる。
 * - searchParams・現在時刻・DB に依存する部分は <Suspense> の内側の子コンポーネントで
 *   searchParams を await し、connection() の後に getNow() / DB を呼ぶ（ビルド時に DB に接続しない）。
 */
export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <SiteShell home>
      <FilterTransitionProvider>
        <section aria-labelledby="event-filter-heading" className="flex flex-col gap-3">
          <h2 id="event-filter-heading" className="sr-only">
            絞り込み
          </h2>
          <Suspense fallback={<FilterFormSkeleton />}>
            <HomeFilterForm searchParams={searchParams} />
          </Suspense>
        </section>

        <section aria-labelledby="event-results-heading">
          <Suspense fallback={<EventListSkeleton />}>
            <FilterPendingRegion>
              <HomeEventResults searchParams={searchParams} />
            </FilterPendingRegion>
          </Suspense>
        </section>
      </FilterTransitionProvider>
    </SiteShell>
  );
}

async function HomeFilterForm({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filters = parseEventFilters(await searchParams);
  await connection();
  const now = getNow();
  const periodOptions: PeriodOption[] = PERIODS.map((period) => ({
    value: period,
    label: PERIOD_LABELS[period],
    rangeLabel: formatPeriodRange(getPeriodRange(period, now), now),
  }));
  return <EventFilterForm filters={filters} periodOptions={periodOptions} />;
}

async function HomeEventResults({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filters = parseEventFilters(await searchParams);
  await connection();
  const now = getNow();
  const events = await listPublicEvents(now);
  const visible = filterAndSortEvents(events, filters, now);
  return (
    <EventResults
      events={visible}
      filters={filters}
      now={now}
      periodRangeLabel={formatPeriodRange(getPeriodRange(filters.period, now), now)}
    />
  );
}
