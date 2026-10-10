/**
 * 放送・配信枠の表示（一覧カードの compact 表示と、詳細ページの full 表示）。
 *
 * - 「実際に見るページ（視聴ページ）」「放送案内」を区別して表示する。
 *   視聴ページの URL がない枠に、大会公式サイトなどを「見る」リンクとして出さない。
 * - 過去大会の参考情報の枠は、今年の枠と見間違えないよう別グループ・破線枠で表示する。
 */
import { CalendarClock, History } from "lucide-react";

import type { LocalDate } from "@/domain/datetime";
import { formatBroadcastTiming } from "@/domain/event-timing";
import { COST_TYPE_LABELS, VIEWING_TYPE_LABELS } from "@/domain/labels";
import type { PublicBroadcast } from "@/domain/types";
import { safeExternalHref } from "@/domain/url";
import { cn } from "@/lib/utils";

import { broadcastNeedsYear, formatCheckedAt, formatRegion, splitSlots } from "./event-format";
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

function ConditionChips({ slot }: { slot: PublicBroadcast }) {
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
    <ul className="flex flex-wrap gap-1.5" aria-label="視聴の条件">
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

function SlotItem({
  slot,
  fallbackDate,
  now,
  variant,
}: {
  slot: PublicBroadcast;
  fallbackDate: LocalDate;
  now: Date;
  variant: Variant;
}) {
  const isPast = slot.verificationStatus === "PAST_REFERENCE";
  const timingLabel = formatBroadcastTiming(slot, { withYear: broadcastNeedsYear(slot, fallbackDate, now) });
  const showTiming = !isPast || hasTimingInfo(slot);
  const showVerification = variant === "full" || slot.verificationStatus !== "CONFIRMED";

  return (
    <li
      className={cn(
        "rounded-lg border border-border bg-card p-3",
        isPast && "border-dashed border-violet-400 bg-violet-50/40",
        slot.verificationStatus === "UNVERIFIED" && "border-amber-300",
      )}
      data-testid="broadcast-slot"
      data-verification={slot.verificationStatus}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <MediumBadge medium={slot.medium} />
        <span className="font-semibold text-foreground">{slot.providerName}</span>
        {showVerification ? <VerificationBadge status={slot.verificationStatus} /> : null}
      </div>

      {showTiming ? (
        <p className="mt-2 flex items-start gap-1.5 text-sm">
          <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            <span className="sr-only">放送・配信日時（日本時間）: </span>
            {isPast ? <span className="text-violet-900">過去大会: </span> : null}
            <span className="font-medium tabular-nums">{timingLabel}</span>
          </span>
        </p>
      ) : null}

      <div className="mt-2">
        <ConditionChips slot={slot} />
      </div>

      {slot.note ? <p className="mt-2 text-sm text-muted-foreground">{slot.note}</p> : null}

      {variant === "full" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {slot.verifiedAt ? `確認日時: ${formatCheckedAt(slot.verifiedAt, now, { forceYear: true })}` : "確認日時: 記録なし"}
        </p>
      ) : null}

      <SlotLinks slot={slot} variant={variant} />
    </li>
  );
}

function SlotLinks({ slot, variant }: { slot: PublicBroadcast; variant: Variant }) {
  // 安全でない URL（http/https 以外など）はリンクにしない
  const watchHref = safeExternalHref(slot.watchUrl);
  const infoHref = safeExternalHref(slot.infoUrl);

  if (!watchHref && !infoHref && variant === "compact") return null;

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
      ) : variant === "full" ? (
        <span className="text-sm text-muted-foreground">視聴ページのリンクは未登録です</span>
      ) : null}
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
