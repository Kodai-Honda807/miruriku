"use client";

/**
 * トップページの絞り込みフォーム。
 *
 * - プログレッシブエンハンスメント: JavaScript が無効でも <form method="get" action="/"> の
 *   送信で絞り込める（ネイティブの radio / checkbox / input を使う）。
 * - JavaScript が有効なら、変更のたびに router.replace で URL クエリを更新する（履歴は増やさない）。
 *   更新中は useTransition の isPending で「更新中」を表示する。
 * - 状態の正は URL（サーバーから渡される filters）。送信直後は useOptimistic で先に反映する。
 * - 大会名の検索語は入力のたびではなく、Enter または「検索」ボタンで反映する。
 */
import { LoaderCircle, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, type FormEvent, type MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BROADCAST_MEDIA, CATEGORIES, type BroadcastMedium, type Category } from "@/domain/enums";
import {
  CATEGORY_PARAM,
  DEFAULT_FILTERS,
  MAX_QUERY_LENGTH,
  MEDIUM_PARAM,
  toQueryString,
  type EventFilters,
  type Period,
} from "@/domain/filters";
import { BROADCAST_MEDIUM_LABELS, CATEGORY_LABELS } from "@/domain/labels";
import { cn } from "@/lib/utils";

import { useFilterTransition } from "./filter-transition";

export type PeriodOption = {
  value: Period;
  /** 例: "今週（7日間）" */
  label: string;
  /** 実際の日付範囲（日本時間）。例: "10月10日（土）〜10月16日（金）" */
  rangeLabel: string;
};

type Props = {
  filters: EventFilters;
  periodOptions: readonly PeriodOption[];
};

const pillClass =
  "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium select-none hover:bg-muted has-checked:border-primary has-checked:bg-primary/10 has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring";

const nativeControlClass = "size-4 shrink-0 cursor-pointer accent-primary focus-visible:outline-none";

const legendClass = "mb-2 text-sm font-semibold text-foreground";

function toggleValue<T extends string>(order: readonly T[], current: readonly T[], value: T, checked: boolean): T[] {
  // 表示順を保ち、重複させない
  return order.filter((v) => (v === value ? checked : current.includes(v)));
}

export function EventFilterForm({ filters, periodOptions }: Props) {
  const router = useRouter();
  const { isPending, startTransition } = useFilterTransition();
  const [optimistic, setOptimistic] = useOptimistic(filters);

  // 検索語は入力中の値をローカルに持つ。URL 側（filters.q）が変わったときだけ同期する。
  const [query, setQuery] = useState(filters.q);
  const [syncedQuery, setSyncedQuery] = useState(filters.q);
  if (filters.q !== syncedQuery) {
    setSyncedQuery(filters.q);
    setQuery(filters.q);
  }

  function apply(next: EventFilters) {
    const normalized: EventFilters = { ...next, q: next.q.trim().slice(0, MAX_QUERY_LENGTH) };
    startTransition(() => {
      setOptimistic(normalized);
      router.replace(`/${toQueryString(normalized)}`, { scroll: false });
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply({ ...optimistic, q: query });
  }

  function handleClear(event: MouseEvent<HTMLAnchorElement>) {
    // 修飾キー付きクリック（新しいタブで開く等）はブラウザに任せる
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    setQuery("");
    apply(DEFAULT_FILTERS);
  }

  const canClear = toQueryString(optimistic) !== "" || query.trim() !== "";

  return (
    <form
      role="search"
      method="get"
      action="/"
      aria-label="大会の絞り込み"
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="event-filter-q" className="text-sm font-semibold">
          大会名で検索
        </label>
        <div className="flex gap-2">
          <Input
            id="event-filter-q"
            type="search"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={MAX_QUERY_LENGTH}
            autoComplete="off"
            enterKeyHint="search"
            placeholder="例: 駅伝、マラソン"
            className="h-10 bg-background text-base"
          />
          <Button type="submit" className="h-10 px-4">
            <Search aria-hidden="true" />
            検索
          </Button>
        </div>
      </div>

      <fieldset>
        <legend className={legendClass}>期間</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {periodOptions.map((option) => {
            const id = `event-filter-period-${option.value}`;
            const rangeId = `${id}-range`;
            return (
              <div
                key={option.value}
                className="flex min-w-0 items-center gap-3 sm:flex-col sm:items-stretch sm:gap-1"
              >
                <label htmlFor={id} className={cn(pillClass, "shrink-0 whitespace-nowrap sm:justify-center")}>
                  <input
                    id={id}
                    type="radio"
                    name="period"
                    value={option.value}
                    checked={optimistic.period === option.value}
                    onChange={() => apply({ ...optimistic, period: option.value, q: query })}
                    aria-describedby={rangeId}
                    className={nativeControlClass}
                  />
                  {option.label}
                </label>
                <span id={rangeId} className="text-xs leading-snug text-muted-foreground sm:text-center">
                  {option.rangeLabel}
                </span>
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-5 md:grid-cols-[auto_1fr]">
        <fieldset>
          <legend className={legendClass}>競技</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((category: Category) => (
              <label key={category} className={pillClass}>
                <input
                  type="checkbox"
                  name="category"
                  value={CATEGORY_PARAM[category]}
                  checked={optimistic.categories.includes(category)}
                  onChange={(e) =>
                    apply({
                      ...optimistic,
                      categories: toggleValue(CATEGORIES, optimistic.categories, category, e.target.checked),
                      q: query,
                    })
                  }
                  className={nativeControlClass}
                />
                {CATEGORY_LABELS[category]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={legendClass}>視聴方法</legend>
          <div className="flex flex-wrap gap-2">
            {BROADCAST_MEDIA.map((medium: BroadcastMedium) => (
              <label key={medium} className={pillClass}>
                <input
                  type="checkbox"
                  name="medium"
                  value={MEDIUM_PARAM[medium]}
                  checked={optimistic.media.includes(medium)}
                  onChange={(e) =>
                    apply({
                      ...optimistic,
                      media: toggleValue(BROADCAST_MEDIA, optimistic.media, medium, e.target.checked),
                      q: query,
                    })
                  }
                  className={nativeControlClass}
                />
                {BROADCAST_MEDIUM_LABELS[medium]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-col gap-1">
        <label className={cn(pillClass, "w-fit")}>
          <input
            type="checkbox"
            name="free"
            value="1"
            checked={optimistic.freeInternet}
            onChange={(e) => apply({ ...optimistic, freeInternet: e.target.checked, q: query })}
            aria-describedby="event-filter-free-help"
            className={nativeControlClass}
          />
          無料ネット配信あり
        </label>
        <span id="event-filter-free-help" className="text-xs text-muted-foreground">
          無料で見られるネット配信の枠がある大会だけを表示します（過去大会の参考情報は除きます）。
        </span>
      </div>

      <div className="flex min-h-6 flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {isPending ? (
            <>
              <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
              更新中…
            </>
          ) : null}
        </p>
        {canClear ? (
          <Link
            href="/"
            scroll={false}
            onClick={handleClear}
            className="rounded-sm text-sm font-medium text-primary underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            条件をクリア
          </Link>
        ) : null}
      </div>
    </form>
  );
}
