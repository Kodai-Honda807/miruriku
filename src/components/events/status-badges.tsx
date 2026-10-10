/**
 * 状態・分類の表示部品。色だけで状態を伝えないよう、必ず日本語のテキストラベルを表示し、
 * アイコンは装飾（aria-hidden）として添える。
 */
import {
  CircleCheck,
  CircleHelp,
  CircleSlash,
  FlaskConical,
  Globe,
  History,
  Hourglass,
  Radio,
  Satellite,
  Tv,
  type LucideIcon,
} from "lucide-react";

import type {
  BroadcastInfoStatus,
  BroadcastMedium,
  Category,
  SlotVerificationStatus,
} from "@/domain/enums";
import {
  BROADCAST_INFO_STATUS_LABELS,
  BROADCAST_MEDIUM_LABELS,
  CATEGORY_LABELS,
  SLOT_VERIFICATION_STATUS_LABELS,
} from "@/domain/labels";
import { cn } from "@/lib/utils";

const chipBase =
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium leading-5 [&>svg]:size-3.5 [&>svg]:shrink-0";

const INFO_STATUS_STYLE: Record<BroadcastInfoStatus, { icon: LucideIcon; className: string }> = {
  CONFIRMED: { icon: CircleCheck, className: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  NOT_ANNOUNCED: { icon: Hourglass, className: "border-sky-300 bg-sky-50 text-sky-900" },
  UNVERIFIED: { icon: CircleHelp, className: "border-amber-300 bg-amber-50 text-amber-900" },
  NO_BROADCAST: { icon: CircleSlash, className: "border-zinc-300 bg-zinc-100 text-zinc-800" },
  PAST_REFERENCE: { icon: History, className: "border-violet-300 bg-violet-50 text-violet-900" },
};

/** 大会全体の放送・配信情報の状態 */
export function BroadcastInfoStatusBadge({
  status,
  className,
}: {
  status: BroadcastInfoStatus;
  className?: string;
}) {
  const { icon: Icon, className: tone } = INFO_STATUS_STYLE[status];
  return (
    <span className={cn(chipBase, "text-sm", tone, className)} data-status={status}>
      <Icon aria-hidden="true" />
      {BROADCAST_INFO_STATUS_LABELS[status]}
    </span>
  );
}

const VERIFICATION_STYLE: Record<SlotVerificationStatus, { icon: LucideIcon; className: string }> = {
  CONFIRMED: { icon: CircleCheck, className: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  UNVERIFIED: { icon: CircleHelp, className: "border-amber-300 bg-amber-50 text-amber-900" },
  PAST_REFERENCE: { icon: History, className: "border-dashed border-violet-400 bg-violet-50 text-violet-900" },
};

/** 放送・配信枠ごとの検証状態 */
export function VerificationBadge({ status }: { status: SlotVerificationStatus }) {
  const { icon: Icon, className } = VERIFICATION_STYLE[status];
  return (
    <span className={cn(chipBase, className)} data-verification={status}>
      <Icon aria-hidden="true" />
      {SLOT_VERIFICATION_STATUS_LABELS[status]}
    </span>
  );
}

const MEDIUM_ICON: Record<BroadcastMedium, LucideIcon> = {
  TERRESTRIAL: Tv,
  BS: Satellite,
  CS: Satellite,
  INTERNET: Globe,
  RADIO: Radio,
};

/** 媒体（地上波・BS・CS・ネット配信・ラジオ） */
export function MediumBadge({ medium }: { medium: BroadcastMedium }) {
  const Icon = MEDIUM_ICON[medium];
  return (
    <span className={cn(chipBase, "border-primary/30 bg-primary/5 text-primary")} data-medium={medium}>
      <Icon aria-hidden="true" />
      {BROADCAST_MEDIUM_LABELS[medium]}
    </span>
  );
}

/** 競技カテゴリ */
export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className={cn(chipBase, "border-transparent bg-secondary text-secondary-foreground")} data-category={category}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

/** 架空のデモデータであることの表示 */
export function DemoBadge() {
  return (
    <span className={cn(chipBase, "border-dashed border-orange-400 bg-orange-50 text-orange-900")}>
      <FlaskConical aria-hidden="true" />
      デモ
    </span>
  );
}
