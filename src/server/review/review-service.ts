/**
 * 収集候補（ExtractionCandidate）の承認・却下。
 *
 * - 承認は 1 つのトランザクションで「候補の状態変更 → 差分の再計算 → 公開データへの反映」を行う。
 *   収集時の差分スナップショット（candidate.diff）は使わず、トランザクション内で現在の状態から再計算する。
 * - 候補で不明な値は既存値を上書きしない／候補に含まれない既存枠は削除しない（src/domain/diff.ts の方針）。
 * - 大会の公開状態（Event.status）は変更しない。下書き大会は承認後も下書きのまま。
 *
 * Next.js に依存しない（DB 統合テスト・スクリプトからも使えるよう Prisma Client を引数で受け取る）。
 */
import { parseStoredPayload } from "@/domain/candidate";
import {
  computeCandidateDiff,
  eventUpdateFromChanges,
  slotFieldsFromProposed,
  slotUpdateFromChanges,
  type CandidateDiff,
} from "@/domain/diff";
import type { ReviewStatus } from "@/domain/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { loadCurrentEventState } from "@/lib/event-state";

export type CandidateReviewErrorCode =
  /** 候補が存在しない */
  | "NOT_FOUND"
  /** 既に承認・却下済み（同時に承認された場合を含む） */
  | "NOT_PENDING"
  /** 保存されている payload が現在のスキーマで読めない */
  | "INVALID_PAYLOAD"
  /** 候補の大会が存在しない */
  | "EVENT_NOT_FOUND";

const ERROR_MESSAGES: Record<CandidateReviewErrorCode, string> = {
  NOT_FOUND: "候補が見つかりません。",
  NOT_PENDING: "この候補は既にレビュー済みです。",
  INVALID_PAYLOAD: "保存されている候補データを読み込めないため承認できません。",
  EVENT_NOT_FOUND: "候補の大会が見つかりません。",
};

/** 承認・却下できなかった理由。message は利用者に表示してよい文言 */
export class CandidateReviewError extends Error {
  readonly code: CandidateReviewErrorCode;
  readonly currentStatus: ReviewStatus | null;

  constructor(code: CandidateReviewErrorCode, currentStatus: ReviewStatus | null = null) {
    super(ERROR_MESSAGES[code]);
    this.name = "CandidateReviewError";
    this.code = code;
    this.currentStatus = currentStatus;
  }
}

export type ReviewOptions = {
  /** レビュー日時（= 人が確認した日時）。Server Action からは getNow() を渡す */
  now: Date;
  note?: string | null;
};

export type ApproveResult = {
  candidateId: string;
  eventId: string;
  /** 変更した大会の項目数 */
  eventFieldsChanged: number;
  /** 追加した放送枠 */
  added: number;
  /** 項目を更新した放送枠 */
  updated: number;
  /** 内容は変わらず、確認日時・公開状態だけ更新した放送枠 */
  unchanged: number;
  /** 候補に含まれず、変更しなかった既存の放送枠 */
  untouched: number;
  /** 承認時に再計算した差分 */
  diff: CandidateDiff;
};

/** 状態を変えられなかった候補について、存在しないのか・レビュー済みなのかを判定する */
async function notPendingError(
  db: Pick<PrismaClient, "extractionCandidate">,
  candidateId: string,
): Promise<CandidateReviewError> {
  const existing = await db.extractionCandidate.findUnique({
    where: { id: candidateId },
    select: { reviewStatus: true },
  });
  return existing
    ? new CandidateReviewError("NOT_PENDING", existing.reviewStatus)
    : new CandidateReviewError("NOT_FOUND");
}

/**
 * 候補を承認し、公開データに反映する。
 * 失敗した場合はロールバックされ、候補は未レビューのまま残る（NOT_PENDING / NOT_FOUND を除く）。
 */
export async function approveCandidate(
  db: PrismaClient,
  candidateId: string,
  opts: ReviewOptions,
): Promise<ApproveResult> {
  const { now } = opts;
  const reviewNote = opts.note?.trim() ? opts.note.trim() : null;

  return db.$transaction(async (tx) => {
    // 1. 未レビュー（PENDING）の候補だけを承認済みにする。
    //    UPDATE ... WHERE "reviewStatus" = 'PENDING' は対象行に行ロックを取る。同じ候補を同時に承認した場合、
    //    後続のトランザクションは先行トランザクションの完了まで待ち、PostgreSQL（READ COMMITTED）が
    //    更新後の行で WHERE 条件を再評価するため 0 件更新になる。これにより片方だけが成功し、
    //    もう片方はここでエラーになってロールバックされる（公開データへの二重反映が起きない）。
    const claimed = await tx.extractionCandidate.updateMany({
      where: { id: candidateId, reviewStatus: "PENDING" },
      data: { reviewStatus: "APPROVED", reviewedAt: now, reviewNote },
    });
    if (claimed.count !== 1) {
      throw await notPendingError(tx, candidateId);
    }

    const candidate = await tx.extractionCandidate.findUniqueOrThrow({
      where: { id: candidateId },
      select: { id: true, eventId: true, sourceId: true, payload: true },
    });

    let payload;
    try {
      payload = parseStoredPayload(candidate.payload);
    } catch {
      throw new CandidateReviewError("INVALID_PAYLOAD");
    }

    // 2. 大会の行を先に更新して行ロックを取る。同じ大会の別の候補を同時に承認しても、
    //    差分の再計算と反映が直列化されるため、同じ枠が二重に作成されない。
    const locked = await tx.event.updateMany({
      where: { id: candidate.eventId },
      data: { broadcastCheckedAt: now },
    });
    if (locked.count !== 1) {
      throw new CandidateReviewError("EVENT_NOT_FOUND");
    }

    // 3. ロック取得後の最新の状態に対して差分を再計算する
    const current = await loadCurrentEventState(tx, candidate.eventId);
    if (!current) {
      throw new CandidateReviewError("EVENT_NOT_FOUND");
    }
    const diff = computeCandidateDiff(current, payload);

    // 4. 大会の項目（公開状態 Event.status は変更しない）
    const eventData = eventUpdateFromChanges(diff.eventChanges);
    if (Object.keys(eventData).length > 0) {
      await tx.event.update({ where: { id: candidate.eventId }, data: eventData });
    }

    // 5. 放送枠。追加分は既存の並び順の後ろに置く
    const maxSort = await tx.broadcastSlot.aggregate({
      where: { eventId: candidate.eventId },
      _max: { sortOrder: true },
    });
    let nextSortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const confirmed = { status: "PUBLISHED", verificationStatus: "CONFIRMED", verifiedAt: now } as const;
    let added = 0;
    let updated = 0;
    let unchanged = 0;

    for (const item of diff.slots) {
      switch (item.kind) {
        case "add":
          await tx.broadcastSlot.create({
            data: {
              ...slotFieldsFromProposed(item.proposed),
              ...confirmed,
              eventId: candidate.eventId,
              sourceId: candidate.sourceId,
              originCandidateId: candidate.id,
              originItemKey: item.itemKey,
              sortOrder: nextSortOrder++,
            },
          });
          added++;
          break;
        case "update":
          await tx.broadcastSlot.update({
            where: { id: item.slotId },
            data: { ...slotUpdateFromChanges(item.changes), ...confirmed },
          });
          updated++;
          break;
        case "unchanged":
          await tx.broadcastSlot.update({ where: { id: item.slotId }, data: confirmed });
          unchanged++;
          break;
      }
    }
    // 候補に含まれない既存枠（diff.untouchedSlots）は変更・削除しない

    return {
      candidateId: candidate.id,
      eventId: candidate.eventId,
      eventFieldsChanged: diff.eventChanges.length,
      added,
      updated,
      unchanged,
      untouched: diff.untouchedSlots.length,
      diff,
    };
  });
}

/** 候補を却下する。公開データは変更しない */
export async function rejectCandidate(
  db: PrismaClient,
  candidateId: string,
  opts: ReviewOptions,
): Promise<{ candidateId: string }> {
  const reviewNote = opts.note?.trim() ? opts.note.trim() : null;
  const result = await db.extractionCandidate.updateMany({
    where: { id: candidateId, reviewStatus: "PENDING" },
    data: { reviewStatus: "REJECTED", reviewedAt: opts.now, reviewNote },
  });
  if (result.count !== 1) {
    throw await notPendingError(db, candidateId);
  }
  return { candidateId };
}
