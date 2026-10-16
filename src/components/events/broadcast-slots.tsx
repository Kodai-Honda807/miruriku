/**
 * 放送・配信枠の表示（一覧カードの compact 表示と、詳細ページの full 表示）。
 *
 * - compact（一覧）: 「いつ・どこで見られるか」に絞る。媒体・局名・日時・条件（料金・形態・地域）と、
 *   誤解を防ぐ短い表示（未確認・地域限定・過去大会）だけを出す。補足（note）・出典・確認日時は詳細ページに任せる。
 *   枠全体を 1 つのリンクにし、遷移先は 視聴 URL → 放送案内 URL → 出典 URL の順に選ぶ（安全な URL がなければリンクにしない）。
 * - full（詳細）: 補足・出典・確認日時を含めてすべて表示し、視聴ページ・放送案内を個別のリンクで出す。
 * - 「実際に見るページ（視聴ページ）」「放送案内」「告知（出典）」を区別して表示する。
 *   視聴ページの URL がない枠に、大会公式サイトなどを「見る」リンクとして出さない。
 * - 過去大会の参考情報の枠は、今年の枠と見間違えないよう別グループ・破線枠で表示する。
 */
import { CalendarClock, ChevronRight, History } from "lucide-react";

import type { LocalDate } from "@/domain/datetime";
import { formatBroadcastTiming } from "@/domain/event-timing";
import { COST_TYPE_LABELS, VIEWING_TYPE_LABELS } from "@/domain/labels";
import type { PublicBroadcast } from "@/domain/types";
import { safeExternalHref } from "@/domain/url";
import { cn } from "@/lib/utils";

import { EXTERNAL_LINK_SUFFIX, broadcastNeedsYear, formatCheckedAt, formatRegion, splitSlots } from "./event-format";
import { ExternalLink } from "./external-link";
import { MediumBadge, VerificationBadge } from "./status-badges";

type Variant = "compact" | "full";

type SlotListProps = {
  slots: readonly PublicBroadcast[];
  /** 放送日が不明な枠の年表示判定に使う日付（大会の初日） */
  fallbackDate: LocalDate;
  now: Date;
  variant: Variant;
  /** 見出しレベル（過去大会の参考情報グループの見出し） */
  headingLevel?: "h3" | "h4" | "h5";
};

function hasTimingInfo(slot: PublicBroadcast): boolean {
  return Boolean(slot.startAt || slot.airDate);
}

function ConditionChips({ slot, id }: { slot: PublicBroadcast; id?: string }) {
  const items: { key: string; label: string; className?: string }[] = [
    {
      key: "cost",
      label: COST_TYPE_LABELS[slot.cost],
      className: slot.cost === "FREE" ? "border-emerald-300 text-emerald-900" : undefined,
    },
    { key: "viewing", label: VIEWING_TYPE_LABELS[slot.viewingType] },
    {
      key: "region",
      label: formatRegion(slot),
      className:
        slot.region === "REGIONAL" || slot.region === "JAPAN_UNKNOWN"
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : undefined,
    },
  ];
  return (
    <ul id={id} className="flex flex-wrap gap-1.5" aria-label="視聴の条件">
      {items.map((item) => (
        <li
          key={item.key}
          className={cn(
            "rounded-md border border-border bg-background px-1.5 py-0.5 text-xs leading-5 text-foreground",
            item.className,
          )}
        >
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** 一覧の枠カードの遷移先。視聴 URL → 放送案内 URL → 出典 URL の順に、安全な URL だけを選ぶ */
export type SlotLinkTarget = { href: string; kind: "watch" | "info" | "source"; label: string };

export const SLOT_LINK_LABELS: Record<SlotLinkTarget["kind"], string> = {
  watch: "視聴ページへ",
  info: "放送案内へ",
  source: "告知を確認",
};

export function pickSlotLinkTarget(slot: Pick<PublicBroadcast, "watchUrl" | "infoUrl" | "source">): SlotLinkTarget | null {
  const candidates: [SlotLinkTarget["kind"], string | null | undefined][] = [
    ["watch", slot.watchUrl],
    ["info", slot.infoUrl],
    ["source", slot.source?.url],
  ];
  for (const [kind, url] of candidates) {
    const href = safeExternalHref(url);
    if (href) return { href, kind, label: SLOT_LINK_LABELS[kind] };
  }
  return null;
}

type SlotItemProps = {
  slot: PublicBroadcast;
  fallbackDate: LocalDate;
  now: Date;
  variant: Variant;
};

function slotBoxClass(slot: PublicBroadcast) {
  return cn(
    "rounded-lg border border-border bg-card p-3",
    slot.verificationStatus === "PAST_REFERENCE" && "border-dashed border-violet-400 bg-violet-50/40",
    slot.verificationStatus === "UNVERIFIED" && "border-amber-300",
  );
}

/** 枠の主情報（媒体・局名・状態・日時・条件）。一覧と詳細で共通 */
function SlotSummary({ slot, fallbackDate, now, variant, idPrefix }: SlotItemProps & { idPrefix?: string }) {
  const isPast = slot.verificationStatus === "PAST_REFERENCE";
  const timingLabel = formatBroadcastTiming(slot, { withYear: broadcastNeedsYear(slot, fallbackDate, now) });
  const showTiming = !isPast || hasTimingInfo(slot);
  const showVerification = variant === "full" || slot.verificationStatus !== "CONFIRMED";
  const id = (part: string) => (idPrefix ? `${idPrefix}-${part}` : undefined);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span id={id("medium")}>
          <MediumBadge medium={slot.medium} />
        </span>
        <span id={id("provider")} className="min-w-0 font-semibold break-words text-foreground">
          {slot.providerName}
        </span>
        {showVerification ? (
          <span id={id("verification")}>
            <VerificationBadge status={slot.verificationStatus} />
          </span>
        ) : null}
      </div>

      {showTiming ? (
        <p id={id("timing")} className="mt-2 flex items-start gap-1.5 text-sm">
          <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            <span className="sr-only">放送・配信日時（日本時間）: </span>
            {isPast ? <span className="text-violet-900">過去大会: </span> : null}
            <span className="font-medium tabular-nums">{timingLabel}</span>
          </span>
        </p>
      ) : null}

      <div className="mt-2">
        <ConditionChips slot={slot} id={id("conditions")} />
      </div>
    </>
  );
}

/**
 * 一覧の枠カード。遷移先があれば枠全体を 1 つの <a> にする（中にリンクやボタンを入れない）。
 * アクセシブルネームは「局名 + 遷移先の種類」、日時・条件は説明（aria-describedby）として伝える。
 */
function CompactSlotItem(props: SlotItemProps) {
  const { slot } = props;
  const target = pickSlotLinkTarget(slot);
  const idPrefix = `slot-${slot.id}`;

  if (!target) {
    return (
      <li data-testid="broadcast-slot" data-verification={slot.verificationStatus} data-link-kind="none">
        <div className={slotBoxClass(slot)}>
          <SlotSummary {...props} />
        </div>
      </li>
    );
  }

  const describedBy = [`${idPrefix}-medium`, `${idPrefix}-verification`, `${idPrefix}-timing`, `${idPrefix}-conditions`]
    .filter((id) => id !== `${idPrefix}-verification` || slot.verificationStatus !== "CONFIRMED")
    .filter((id) => id !== `${idPrefix}-timing` || slot.verificationStatus !== "PAST_REFERENCE" || hasTimingInfo(slot))
    .join(" ");

  return (
    <li data-testid="broadcast-slot" data-verification={slot.verificationStatus} data-link-kind={target.kind}>
      <a
        href={target.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-labelledby={`${idPrefix}-provider ${idPrefix}-action`}
        aria-describedby={describedBy}
        data-testid="broadcast-slot-link"
        className={cn(
          slotBoxClass(slot),
          "group block text-foreground no-underline transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
        )}
      >
        <SlotSummary {...props} idPrefix={idPrefix} />
        <span
          id={`${idPrefix}-action`}
          className="mt-3 flex items-center justify-end gap-0.5 text-sm font-semibold text-primary group-hover:underline group-hover:underline-offset-4"
        >
          {target.label}
          <span className="sr-only">{EXTERNAL_LINK_SUFFIX}</span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
        </span>
      </a>
    </li>
  );
}

/** 詳細ページの枠。補足・出典・確認日時と、視聴ページ・放送案内の個別リンクを表示する */
function FullSlotItem(props: SlotItemProps) {
  const { slot, now } = props;
  return (
    <li className={slotBoxClass(slot)} data-testid="broadcast-slot" data-verification={slot.verificationStatus}>
      <SlotSummary {...props} />
      {slot.note ? <p className="mt-2 text-sm text-muted-foreground">{slot.note}</p> : null}
      <SlotProvenance slot={slot} now={now} />
      <SlotLinks slot={slot} />
    </li>
  );
}

function SlotItem(props: SlotItemProps) {
  return props.variant === "compact" ? <CompactSlotItem {...props} /> : <FullSlotItem {...props} />;
}

/** 出典の表示名（タイトルがなければホスト名） */
function sourceLabel(source: NonNullable<PublicBroadcast["source"]>): string {
  if (source.title) return source.title;
  try {
    return new URL(source.url).hostname;
  } catch {
    return "出典";
  }
}

/** 出典と確認日時（詳細ページ）。記録がないものは「記録なし」と明示する */
function SlotProvenance({ slot, now }: { slot: PublicBroadcast; now: Date }) {
  const sourceHref = slot.source ? safeExternalHref(slot.source.url) : null;
  const checked = slot.verifiedAt
    ? `確認日時: ${formatCheckedAt(slot.verifiedAt, now, { forceYear: true })}`
    : "確認日時: 記録なし";
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="slot-provenance">
      {slot.source && sourceHref ? (
        <span>
          出典:{" "}
          <ExternalLink href={sourceHref} accessibleName={`出典: ${sourceLabel(slot.source)}`} className="font-normal">
            {sourceLabel(slot.source)}
          </ExternalLink>
        </span>
      ) : (
        <span>出典: 記録なし</span>
      )}
      <span>{checked}</span>
    </p>
  );
}

function SlotLinks({ slot }: { slot: PublicBroadcast }) {
  // 安全でない URL（http/https 以外など）はリンクにしない
  const watchHref = safeExternalHref(slot.watchUrl);
  const infoHref = safeExternalHref(slot.infoUrl);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {watchHref ? (
        <ExternalLink
          href={watchHref}
          accessibleName={`${slot.providerName}の視聴ページ`}
          className="rounded-md bg-primary px-2.5 py-1 text-sm text-primary-foreground no-underline hover:bg-primary/85"
        >
          視聴ページ
        </ExternalLink>
      ) : (
        <span className="text-sm text-muted-foreground">視聴ページのリンクは未登録です</span>
      )}
      {infoHref ? (
        <ExternalLink href={infoHref} accessibleName={`${slot.providerName}の放送案内`} className="text-sm">
          放送案内
        </ExternalLink>
      ) : null}
    </div>
  );
}

/**
 * 放送・配信枠の一覧。今年の枠を先に、過去大会の参考情報の枠を別グループで表示する。
 */
export function BroadcastSlotList({ slots, fallbackDate, now, variant, headingLevel = "h4" }: SlotListProps) {
  const { current, pastReference } = splitSlots(slots);
  const Heading = headingLevel;
  return (
    <div className="flex flex-col gap-3">
      {current.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="放送・配信の予定">
          {current.map((slot) => (
            <SlotItem key={slot.id} slot={slot} fallbackDate={fallbackDate} now={now} variant={variant} />
          ))}
        </ul>
      ) : null}
      {pastReference.length > 0 ? (
        <div className="rounded-lg border border-dashed border-violet-400 p-3">
          <Heading className="flex items-center gap-1.5 text-sm font-semibold text-violet-900">
            <History aria-hidden="true" className="size-4" />
            過去大会の参考情報
          </Heading>
          <p className="mt-1 text-xs text-violet-900">
            今年の放送・配信予定ではありません。今年も同じとは限りません。
          </p>
          <ul className="mt-2 flex flex-col gap-2" aria-label="過去大会の放送・配信（参考）">
            {pastReference.map((slot) => (
              <SlotItem key={slot.id} slot={slot} fallbackDate={fallbackDate} now={now} variant={variant} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
