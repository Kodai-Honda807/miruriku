import { BROADCAST_INFO_STATUS_DESCRIPTIONS } from "@/domain/labels";
import type { PublicEventSummary } from "@/domain/types";

import { formatCheckedAt } from "./event-format";
import { BroadcastInfoStatusBadge } from "./status-badges";

type Props = {
  event: Pick<PublicEventSummary, "broadcastInfoStatus" | "broadcastNote" | "broadcastCheckedAt">;
  now: Date;
  /** compact: 一覧カード（確認済みのときは説明を省く）、full: 詳細ページ（常に説明を出す） */
  variant: "compact" | "full";
};

/**
 * 大会全体の放送・配信情報の状態。状態ラベルは常に表示する。
 * 「未確認」は「配信なし」と誤解されないよう、説明文を必ず添える。
 */
export function BroadcastInfoSummary({ event, now, variant }: Props) {
  const status = event.broadcastInfoStatus;
  const showDescription = variant === "full" || status !== "CONFIRMED";
  return (
    <div className="flex flex-col gap-1.5" data-testid="broadcast-info-status" data-status={status}>
      <div>
        <span className="sr-only">放送・配信情報の状態: </span>
        <BroadcastInfoStatusBadge status={status} />
      </div>
      {showDescription ? (
        <p className="text-sm text-muted-foreground">{BROADCAST_INFO_STATUS_DESCRIPTIONS[status]}</p>
      ) : null}
      {event.broadcastNote ? <p className="text-sm text-foreground">{event.broadcastNote}</p> : null}
      {event.broadcastCheckedAt ? (
        <p className="text-xs text-muted-foreground">
          情報確認: {formatCheckedAt(event.broadcastCheckedAt, now, { forceYear: variant === "full" })}
        </p>
      ) : variant === "full" ? (
        <p className="text-xs text-muted-foreground">情報確認: 記録なし</p>
      ) : null}
    </div>
  );
}
