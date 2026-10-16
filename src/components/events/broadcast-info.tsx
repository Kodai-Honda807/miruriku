import { BROADCAST_INFO_STATUS_DESCRIPTIONS } from "@/domain/labels";
import type { PublicEventSummary } from "@/domain/types";

import { formatCheckedAt } from "./event-format";
import { BroadcastInfoStatusBadge } from "./status-badges";

type Props = {
  event: Pick<PublicEventSummary, "broadcastInfoStatus" | "broadcastNote" | "broadcastCheckedAt">;
  now: Date;
  /**
   * compact: 一覧カード。状態ラベルだけを出す（「未確認」のときだけ、配信なしと誤解されないよう短い説明を添える）。
   *          補足（broadcastNote）と確認日時は詳細ページで表示する。
   * full: 詳細ページ。説明・補足・確認日時をすべて出す。
   */
  variant: "compact" | "full";
};

/**
 * 大会全体の放送・配信情報の状態。状態ラベルは一覧・詳細とも常に表示する。
 * 「未確認」は「配信なし」と誤解されないよう、一覧でも説明文を必ず添える。
 */
export function BroadcastInfoSummary({ event, now, variant }: Props) {
  const status = event.broadcastInfoStatus;
  const isFull = variant === "full";
  const showDescription = isFull || status === "UNVERIFIED";
  return (
    <div className="flex flex-col gap-1.5" data-testid="broadcast-info-status" data-status={status}>
      <div>
        <span className="sr-only">放送・配信情報の状態: </span>
        <BroadcastInfoStatusBadge status={status} />
      </div>
      {showDescription ? (
        <p className="text-sm text-muted-foreground">{BROADCAST_INFO_STATUS_DESCRIPTIONS[status]}</p>
      ) : null}
      {isFull && event.broadcastNote ? <p className="text-sm text-foreground">{event.broadcastNote}</p> : null}
      {isFull ? (
        <p className="text-xs text-muted-foreground">
          情報確認: {event.broadcastCheckedAt ? formatCheckedAt(event.broadcastCheckedAt, now, { forceYear: true }) : "記録なし"}
        </p>
      ) : null}
    </div>
  );
}
