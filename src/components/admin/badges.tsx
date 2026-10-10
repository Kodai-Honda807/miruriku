/** 状態の表示。色だけに頼らず、必ず日本語ラベルを表示する */
import { Badge } from "@/components/ui/badge";
import type {
  BroadcastInfoStatus,
  CollectionRunStatus,
  PublicationStatus,
  ReviewStatus,
  SlotVerificationStatus,
} from "@/domain/enums";
import {
  BROADCAST_INFO_STATUS_LABELS,
  COLLECTION_RUN_STATUS_LABELS,
  PUBLICATION_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  SLOT_VERIFICATION_STATUS_LABELS,
} from "@/domain/labels";

export function PublicationBadge({ status }: { status: PublicationStatus }) {
  return <Badge variant={status === "PUBLISHED" ? "default" : "outline"}>{PUBLICATION_STATUS_LABELS[status]}</Badge>;
}

export function BroadcastInfoBadge({ status }: { status: BroadcastInfoStatus }) {
  return (
    <Badge variant={status === "CONFIRMED" ? "secondary" : "outline"} className="whitespace-normal">
      {BROADCAST_INFO_STATUS_LABELS[status]}
    </Badge>
  );
}

export function VerificationBadge({ status }: { status: SlotVerificationStatus }) {
  return <Badge variant={status === "CONFIRMED" ? "secondary" : "outline"}>{SLOT_VERIFICATION_STATUS_LABELS[status]}</Badge>;
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <Badge variant={status === "PENDING" ? "default" : status === "REJECTED" ? "destructive" : "secondary"}>
      {REVIEW_STATUS_LABELS[status]}
    </Badge>
  );
}

export function RunStatusBadge({ status }: { status: CollectionRunStatus }) {
  return (
    <Badge variant={status === "FAILED" ? "destructive" : status === "SUCCEEDED" ? "secondary" : "outline"}>
      {COLLECTION_RUN_STATUS_LABELS[status]}
    </Badge>
  );
}

export function DemoBadge() {
  return <Badge variant="outline">デモ</Badge>;
}
