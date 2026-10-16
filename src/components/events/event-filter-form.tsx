"use client";

/**
 * トップページの絞り込みフォーム。
 *
 * 画面構成:
 * - 常に表示するのは「大会名検索」「期間の切替」「絞り込みボタン」だけにし、初期画面を占有しない。
 * - 競技・視聴方法・無料ネット配信ありは、絞り込みボタンで開くダイアログ（ネイティブの <dialog>）に置く。
 *   ダイアログ内の変更は「適用」でまとめて反映し、「キャンセル」・Esc・背景のクリックでは破棄する。
 * - 適用中の追加条件（競技・視聴方法・無料ネット配信）はボタンの横にチップで表示し、個別に外せる。
 *
 * 状態と URL:
 * - 状態の正は URL（サーバーから渡される filters）。JavaScript が有効なら router.replace で URL クエリを
 *   更新し（履歴は増やさない）、送信直後は useOptimistic で先に反映する。更新中は「更新中」を表示する。
 * - プログレッシブエンハンスメント: ダイアログも <form method="get" action="/"> の内側にあり、
 *   JavaScript が無効でも送信で絞り込める（ダイアログは対応ブラウザなら command 属性で開く）。
 *
 * 検索語（q）をいつ反映するか:
 * - 入力のたびには反映しない。Enter または「検索」ボタンで反映する。
 * - 期間の切替・ダイアログの「適用」・チップでの条件解除のときも、その時点で入力欄にある検索語を合わせて反映する
 *   （入力欄の表示と一覧の結果を食い違わせないため）。
 */
import { LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, type FormEvent, type MouseEvent } from "react";

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

/** ダイアログで編集する条件 */
type DialogDraft = Pick<EventFilters, "categories" | "media" | "freeInternet">;

export const FILTER_DIALOG_ID = "event-filter-dialog";
const APPLY_ACTION = "apply-dialog";

const pillClass =
  "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium select-none hover:bg-muted has-checked:border-primary has-checked:bg-primary/10 has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring";

const nativeControlClass = "size-4 shrink-0 cursor-pointer accent-primary focus-visible:outline-none";

const legendClass = "mb-2 text-sm font-semibold text-foreground";

const linkClass =
  "rounded-sm text-sm font-medium text-primary underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function toggleValue<T extends string>(order: readonly T[], current: readonly T[], value: T, checked: boolean): T[] {
  // 表示順を保ち、重複させない
  return order.filter((v) => (v === value ? checked : current.includes(v)));
}

function draftOf(filters: EventFilters): DialogDraft {
  return { categories: filters.categories, media: filters.media, freeInternet: filters.freeInternet };
}

function normalize(filters: EventFilters): EventFilters {
  return { ...filters, q: filters.q.trim().slice(0, MAX_QUERY_LENGTH) };
}

/** 適用中の追加条件（ダイアログで指定する条件）を、外したときの条件と組にして返す */
export function activeDialogConditions(filters: EventFilters): { key: string; label: string; next: EventFilters }[] {
  const items: { key: string; label: string; next: EventFilters }[] = [];
  for (const c of filters.categories) {
    items.push({
      key: `category-${c}`,
      label: CATEGORY_LABELS[c],
      next: { ...filters, categories: filters.categories.filter((v) => v !== c) },
    });
  }
  for (const m of filters.media) {
    items.push({
      key: `medium-${m}`,
      label: BROADCAST_MEDIUM_LABELS[m],
      next: { ...filters, media: filters.media.filter((v) => v !== m) },
    });
  }
  if (filters.freeInternet) {
    items.push({ key: "free", label: "無料ネット配信あり", next: { ...filters, freeInternet: false } });
  }
  return items;
}

/** 修飾キー付きクリック（新しいタブで開く等）はブラウザに任せる */
function isPlainClick(event: MouseEvent<HTMLElement>) {
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0);
}

export function EventFilterForm({ filters, periodOptions }: Props) {
  const router = useRouter();
  const { isPending, startTransition } = useFilterTransition();
  const [optimistic, setOptimistic] = useOptimistic(filters);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 検索語は入力中の値をローカルに持つ。URL 側（filters.q）が変わったときだけ同期する。
  const [query, setQuery] = useState(filters.q);
  const [syncedQuery, setSyncedQuery] = useState(filters.q);
  if (filters.q !== syncedQuery) {
    setSyncedQuery(filters.q);
    setQuery(filters.q);
  }

  // ダイアログ内の未適用の変更。開くたびに適用中の条件から作り直す（キャンセルで破棄される）。
  const [draft, setDraft] = useState<DialogDraft>(() => draftOf(filters));

  function apply(next: EventFilters) {
    const normalized = normalize(next);
    startTransition(() => {
      setOptimistic(normalized);
      router.replace(`/${toQueryString(normalized)}`, { scroll: false });
    });
  }

  /** 入力欄の検索語を含めた条件（チップのリンク先などに使う） */
  function withQuery(next: EventFilters): EventFilters {
    return normalize({ ...next, q: query });
  }

  function openDialog(event: MouseEvent<HTMLButtonElement>) {
    const dialog = dialogRef.current;
    if (!dialog || typeof dialog.showModal !== "function") return; // 未対応ならブラウザの command 属性に任せる
    event.preventDefault();
    setDraft(draftOf(optimistic));
    if (!dialog.open) dialog.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleDialogClose() {
    // ブラウザも直前のフォーカス位置に戻すが、確実に絞り込みボタンへ戻す
    triggerRef.current?.focus();
  }

  function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
    // 背景（ダイアログ要素そのもの）のクリックはキャンセル扱い
    if (event.target === event.currentTarget) closeDialog();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLElement && submitter.dataset.action === APPLY_ACTION) {
      apply({ ...optimistic, ...draft, q: query });
      closeDialog();
      return;
    }
    apply({ ...optimistic, q: query });
  }

  function handleLinkApply(event: MouseEvent<HTMLAnchorElement>, next: EventFilters) {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    apply(next);
  }

  function handleClear(event: MouseEvent<HTMLAnchorElement>) {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    setQuery("");
    apply(DEFAULT_FILTERS);
  }

  const conditions = activeDialogConditions(optimistic);
  const canClear = toQueryString(optimistic) !== "" || query.trim() !== "";
  const selectedPeriod = periodOptions.find((o) => o.value === optimistic.period);
  const draftCount = draft.categories.length + draft.media.length + (draft.freeInternet ? 1 : 0);

  // JavaScript なしでも対応ブラウザではダイアログを開閉できるよう、Invoker Commands の属性を付ける
  const openCommand = { commandfor: FILTER_DIALOG_ID, command: "show-modal" };
  const closeCommand = { commandfor: FILTER_DIALOG_ID, command: "close" };

  return (
    <form
      role="search"
      method="get"
      action="/"
      aria-label="大会の絞り込み"
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
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
            className="h-10 min-w-0 bg-background text-base"
          />
          <Button type="submit" className="h-10 px-4">
            <Search aria-hidden="true" />
            検索
          </Button>
        </div>
      </div>

      <fieldset className="min-w-0">
        <legend className={legendClass}>期間</legend>
        <div className="grid grid-cols-3 gap-2">
          {periodOptions.map((option) => {
            const id = `event-filter-period-${option.value}`;
            return (
              <label key={option.value} htmlFor={id} className={cn(pillClass, "min-w-0 justify-center px-2 text-center")}>
                <input
                  id={id}
                  type="radio"
                  name="period"
                  value={option.value}
                  checked={optimistic.period === option.value}
                  onChange={() => apply({ ...optimistic, period: option.value, q: query })}
                  aria-describedby={`${id}-range`}
                  className={nativeControlClass}
                />
                <PeriodLabel label={option.label} />
              </label>
            );
          })}
        </div>
        {/* 各選択肢の実際の日付範囲（スクリーンリーダー向けの説明。画面には選択中の範囲だけを出す） */}
        <div className="sr-only">
          {periodOptions.map((option) => (
            <span key={option.value} id={`event-filter-period-${option.value}-range`}>
              {option.rangeLabel}
            </span>
          ))}
        </div>
        {selectedPeriod ? (
          <p className="mt-1.5 text-xs text-muted-foreground" data-testid="selected-period-range" aria-hidden="true">
            {selectedPeriod.rangeLabel}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          className="h-10 px-3"
          aria-haspopup="dialog"
          aria-controls={FILTER_DIALOG_ID}
          onClick={openDialog}
          {...openCommand}
        >
          <SlidersHorizontal aria-hidden="true" />
          絞り込み
          {conditions.length > 0 ? (
            <>
              <span
                aria-hidden="true"
                className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground"
              >
                {conditions.length}
              </span>
              <span className="sr-only">（{conditions.length}件適用中）</span>
            </>
          ) : null}
        </Button>

        {conditions.length > 0 ? (
          <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label="適用中の絞り込み条件" data-testid="active-filters">
            {conditions.map((c) => {
              const next = withQuery(c.next);
              return (
                <li key={c.key}>
                  <Link
                    href={`/${toQueryString(next)}`}
                    replace
                    scroll={false}
                    onClick={(e) => handleLinkApply(e, next)}
                    aria-label={`「${c.label}」の条件を外す`}
                    className="inline-flex min-h-8 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-1 pr-2 pl-3 text-sm font-medium text-foreground hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {c.label}
                    <X aria-hidden="true" className="size-3.5 shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {isPending ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
                更新中…
              </>
            ) : null}
          </p>
          {canClear ? (
            <Link href="/" scroll={false} onClick={handleClear} className={linkClass}>
              条件をクリア
            </Link>
          ) : null}
        </div>
      </div>

      <dialog
        ref={dialogRef}
        id={FILTER_DIALOG_ID}
        aria-labelledby={`${FILTER_DIALOG_ID}-title`}
        closedby="any"
        onClose={handleDialogClose}
        onClick={handleDialogClick}
        data-testid="filter-dialog"
        className="m-auto max-h-[min(40rem,calc(100dvh-2rem))] w-[min(32rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/40 open:flex open:flex-col"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id={`${FILTER_DIALOG_ID}-title`} className="text-base font-bold">
            絞り込み
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="閉じる（変更を破棄）"
            onClick={closeDialog}
            {...closeCommand}
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-4" data-testid="filter-dialog-body">
          <fieldset>
            <legend className={legendClass}>競技</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category: Category) => (
                <label key={category} className={pillClass}>
                  <input
                    type="checkbox"
                    name="category"
                    value={CATEGORY_PARAM[category]}
                    checked={draft.categories.includes(category)}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        categories: toggleValue(CATEGORIES, d.categories, category, e.target.checked),
                      }))
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
                    checked={draft.media.includes(medium)}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        media: toggleValue(BROADCAST_MEDIA, d.media, medium, e.target.checked),
                      }))
                    }
                    className={nativeControlClass}
                  />
                  {BROADCAST_MEDIUM_LABELS[medium]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1">
            <label className={cn(pillClass, "w-fit")}>
              <input
                type="checkbox"
                name="free"
                value="1"
                checked={draft.freeInternet}
                onChange={(e) => setDraft((d) => ({ ...d, freeInternet: e.target.checked }))}
                aria-describedby="event-filter-free-help"
                className={nativeControlClass}
              />
              無料ネット配信あり
            </label>
            <span id="event-filter-free-help" className="text-xs text-muted-foreground">
              無料で見られるネット配信の枠がある大会だけを表示します（過去大会の参考情報は除きます）。
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            className="h-10 px-2"
            disabled={draftCount === 0}
            onClick={() => setDraft({ categories: [], media: [], freeInternet: false })}
          >
            すべて外す
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-10 px-4" onClick={closeDialog} {...closeCommand}>
              キャンセル
            </Button>
            <Button type="submit" className="h-10 px-4" data-action={APPLY_ACTION}>
              適用
            </Button>
          </div>
        </div>
      </dialog>
    </form>
  );
}

/**
 * 期間ラベル。狭い幅で「今週（7 / 日間）」のように括弧の途中で折り返さないよう、
 * 括弧書きの前でだけ改行できるようにする（読み上げ上の名前は変わらない）。
 */
function PeriodLabel({ label }: { label: string }) {
  const i = label.indexOf("（");
  if (i <= 0) return <span className="min-w-0 leading-tight">{label}</span>;
  return (
    <span className="min-w-0 leading-tight">
      <span className="whitespace-nowrap">{label.slice(0, i)}</span>
      <wbr />
      <span className="whitespace-nowrap">{label.slice(i)}</span>
    </span>
  );
}
