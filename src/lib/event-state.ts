/**
 * 差分計算（src/domain/diff.ts）に渡す「現在の大会情報」を DB から読み込む。
 * 収集 CLI（差分スナップショットの作成）と管理画面（レビュー・承認）の両方で使う。
 * トランザクション内でも使えるよう、Prisma Client またはトランザクションクライアントを受け取る。
 */
import { dbDateToLocalDate } from "@/domain/datetime";
import { toCurrentSlotState, type CurrentEventState } from "@/domain/diff";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export async function loadCurrentEventState(db: DbClient, eventId: string): Promise<CurrentEventState | null> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      timezone: true,
      startDate: true,
      endDate: true,
      startAt: true,
      venueName: true,
      broadcastInfoStatus: true,
      broadcasts: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          medium: true,
          providerName: true,
          airDate: true,
          startAt: true,
          endAt: true,
          cost: true,
          viewingType: true,
          region: true,
          regionNote: true,
          note: true,
          watchUrl: true,
          infoUrl: true,
          status: true,
          verificationStatus: true,
        },
      },
    },
  });
  if (!event) return null;
  return {
    timezone: event.timezone,
    startDate: dbDateToLocalDate(event.startDate),
    endDate: dbDateToLocalDate(event.endDate),
    startAt: event.startAt,
    venueName: event.venueName,
    broadcastInfoStatus: event.broadcastInfoStatus,
    slots: event.broadcasts.map(toCurrentSlotState),
  };
}
