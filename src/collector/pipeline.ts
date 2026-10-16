/**
 * 収集パイプライン（1 実行 = 1 情報源）。
 *
 *   情報源の確認（collectEnabled）→ CollectionRun（RUNNING）→ 取得（HTTP: 安全な取得 + robots.txt / FIXTURE: 固定ファイル）
 *   → テキスト抽出 → contentHash → 同内容の未レビュー候補があれば終了
 *   → 抽出プロバイダ → Zod で検証・正規化 → 現在の大会情報との差分 → ExtractionCandidate（PENDING）を保存
 *
 * 公開データ（Event / EventSession / BroadcastSlot）は一切書き換えない。書き込むのは
 * CollectionRun・ExtractionCandidate・Source.lastFetchedAt（HTTP 取得を試みた日時）のみ。
 * 失敗時は CollectionRun を FAILED / SKIPPED にして errorCode と内部向け errorMessage を記録する。
 */
import { parseAndNormalizeExtraction, type NormalizedExtraction } from "@/domain/candidate";
import { dbDateToLocalDate } from "@/domain/datetime";
import { computeCandidateDiff, type CandidateDiff } from "@/domain/diff";
import type { CollectionRunStatus, ExtractionProviderKind, FetchMode } from "@/domain/enums";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { loadCurrentEventState } from "@/lib/event-state";

import { DEFAULT_SOURCE_LIMIT, MAX_SOURCE_LIMIT } from "./config";
import {
  CollectorError,
  findCollectorError,
  isSkipErrorCode,
  truncateMessage,
  type CollectorErrorCode,
} from "./errors";
import { FixtureStore } from "./fixtures";
import { decodeHtmlBytes, extractTextFromHtml, hashText } from "./html-text";
import { HttpPageFetcher, type PageFetcher } from "./http-fetcher";
import { createProviderRegistry, type ProviderRegistry } from "./providers/registry";
import type { ExtractionEventInfo, ExtractionProvider } from "./providers/types";

export type FetchModeOption = "http" | "fixture";

export type CollectSourceOptions = {
  fetchMode: FetchModeOption;
  providerId: string;
  /** 記録に使う現在時刻（既定は実時刻） */
  now?: () => Date;
  /** true なら DB に一切書き込まず、抽出結果と差分だけを返す */
  dryRun?: boolean;
  providers?: ProviderRegistry;
  /** HTTP モードの取得器。複数の情報源で robots.txt の結果やアクセス間隔を共有するため、呼び出し側で作って渡す */
  httpFetcher?: PageFetcher;
  fixtureStore?: FixtureStore;
};

/** REJECTED: 実行の前提を満たさないため CollectionRun を作らずに拒否した */
export type CollectOutcome = CollectionRunStatus | "REJECTED";

export type CollectSourceResult = {
  sourceId: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  eventSlug: string | null;
  eventName: string | null;
  outcome: Exclude<CollectOutcome, "RUNNING">;
  dryRun: boolean;
  fetchMode: FetchMode;
  providerId: string;
  providerKind: ExtractionProviderKind | null;
  runId: string | null;
  candidateId: string | null;
  /** 同じ内容の未レビュー候補が既にあり、新しい候補を作らなかった場合のその候補 ID */
  duplicateOfCandidateId: string | null;
  /**
   * ページから放送・大会の情報を何も抽出できず、候補を作らなかったか。
   * 空の候補を承認すると「確認日時」だけが更新され、実際には確認していないのに確認済みに見えるため作らない。
   */
  nothingExtracted: boolean;
  errorCode: CollectorErrorCode | null;
  errorMessage: string | null;
  httpStatus: number | null;
  finalUrl: string | null;
  contentHash: string | null;
  textTruncated: boolean;
  extraction: NormalizedExtraction | null;
  diff: CandidateDiff | null;
};

type FetchRecord = {
  httpStatus: number | null;
  finalUrl: string | null;
  contentType: string | null;
  byteLength: number | null;
  contentHash: string | null;
};

function toFetchMode(option: FetchModeOption): FetchMode {
  return option === "fixture" ? "FIXTURE" : "HTTP";
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function formatZodIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  const lines = issues
    .slice(0, 10)
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`);
  const more = issues.length > 10 ? `（ほか ${issues.length - 10} 件）` : "";
  return `抽出結果がスキーマに適合しません: ${lines.join("; ")}${more}`;
}

export async function collectSource(
  db: PrismaClient,
  sourceId: string,
  opts: CollectSourceOptions,
): Promise<CollectSourceResult> {
  const now = opts.now ?? (() => new Date());
  const dryRun = opts.dryRun ?? false;
  const fetchMode = toFetchMode(opts.fetchMode);
  const fixtureStore = opts.fixtureStore ?? new FixtureStore();
  const providers = opts.providers ?? createProviderRegistry({ fixtureStore });
  const provider: ExtractionProvider | null = providers.get(opts.providerId) ?? null;

  const result: CollectSourceResult = {
    sourceId,
    sourceUrl: null,
    sourceTitle: null,
    eventSlug: null,
    eventName: null,
    outcome: "REJECTED",
    dryRun,
    fetchMode,
    providerId: opts.providerId,
    providerKind: provider?.kind ?? null,
    runId: null,
    candidateId: null,
    duplicateOfCandidateId: null,
    nothingExtracted: false,
    errorCode: null,
    errorMessage: null,
    httpStatus: null,
    finalUrl: null,
    contentHash: null,
    textTruncated: false,
    extraction: null,
    diff: null,
  };
  const reject = (code: CollectorErrorCode, message: string): CollectSourceResult => ({
    ...result,
    outcome: "REJECTED",
    errorCode: code,
    errorMessage: message,
  });

  // --- 1. 情報源と実行条件の確認（ここで拒否する場合は CollectionRun を作らない） ---
  const source = await db.source.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      url: true,
      title: true,
      collectEnabled: true,
      eventId: true,
      event: {
        select: { slug: true, name: true, seasonYear: true, startDate: true, endDate: true, timezone: true },
      },
    },
  });
  if (!source) return reject("SOURCE_NOT_FOUND", `情報源が見つかりません: ${sourceId}`);
  Object.assign(result, {
    sourceUrl: source.url,
    sourceTitle: source.title,
    eventSlug: source.event.slug,
    eventName: source.event.name,
  });
  if (!source.collectEnabled) {
    return reject("SOURCE_DISABLED", "この情報源は収集が許可されていません（collectEnabled=false）。実行しませんでした");
  }
  if (!provider) {
    return reject("PROVIDER_NOT_ALLOWED", `未登録の抽出プロバイダです: ${opts.providerId}`);
  }
  if (provider.fixtureOnly && fetchMode !== "FIXTURE") {
    return reject(
      "PROVIDER_NOT_ALLOWED",
      `抽出プロバイダ ${provider.id} は固定データを返すため、--fetch fixture でのみ使えます`,
    );
  }

  const eventInfo: ExtractionEventInfo = {
    name: source.event.name,
    seasonYear: source.event.seasonYear,
    startDate: dbDateToLocalDate(source.event.startDate),
    endDate: dbDateToLocalDate(source.event.endDate),
    timezone: source.event.timezone,
  };

  // --- 2. 実行記録 ---
  let runId: string | null = null;
  if (!dryRun) {
    const run = await db.collectionRun.create({
      data: {
        sourceId: source.id,
        fetchMode,
        providerId: provider.id,
        providerKind: provider.kind,
        status: "RUNNING",
        startedAt: now(),
      },
      select: { id: true },
    });
    runId = run.id;
  }
  result.runId = runId;

  const record: FetchRecord = { httpStatus: null, finalUrl: null, contentType: null, byteLength: null, contentHash: null };
  let finalized = false;
  let httpAttemptedAt: Date | null = null;
  let ownedFetcher: PageFetcher | null = null;

  const finishRun = async (status: CollectionRunStatus, extra: { errorCode?: string; errorMessage?: string } = {}) => {
    if (!runId) return;
    await db.collectionRun.update({
      where: { id: runId },
      data: { status, finishedAt: now(), ...record, ...extra },
    });
    finalized = true;
  };

  try {
    // --- 3. 取得 → テキスト抽出 ---
    let html: string;
    if (fetchMode === "FIXTURE") {
      const page = await fixtureStore.loadPage(source.url, eventInfo);
      html = page.html;
      record.contentType = page.contentType;
      record.byteLength = page.byteLength;
    } else {
      const fetcher = opts.httpFetcher ?? (ownedFetcher = new HttpPageFetcher());
      httpAttemptedAt = now();
      const page = await fetcher.fetchPage(source.url);
      record.httpStatus = page.httpStatus;
      record.finalUrl = page.finalUrl;
      record.contentType = page.contentType;
      record.byteLength = page.body.byteLength;
      html = decodeHtmlBytes(page.body, page.charset);
    }
    const { text, truncated } = extractTextFromHtml(html);
    const contentHash = hashText(text);
    record.contentHash = contentHash;
    Object.assign(result, {
      httpStatus: record.httpStatus,
      finalUrl: record.finalUrl,
      contentHash,
      textTruncated: truncated,
    });

    // --- 4. 同じ内容の未レビュー候補があれば、新しい候補を作らない ---
    const latestPending = await db.extractionCandidate.findFirst({
      where: { sourceId: source.id, reviewStatus: "PENDING" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, contentHash: true, providerId: true, fetchMode: true },
    });
    if (
      latestPending &&
      latestPending.contentHash === contentHash &&
      latestPending.providerId === provider.id &&
      latestPending.fetchMode === fetchMode
    ) {
      result.duplicateOfCandidateId = latestPending.id;
      await finishRun("SUCCEEDED");
      return { ...result, outcome: "SUCCEEDED" };
    }

    // --- 5. 抽出 → 検証・正規化（プロバイダの出力は unknown として扱う） ---
    let raw: unknown;
    try {
      raw = await provider.extract({ sourceUrl: source.url, text, event: eventInfo });
    } catch (error) {
      const found = findCollectorError(error);
      if (found) throw found;
      throw new CollectorError(
        "PROVIDER_FAILED",
        `抽出プロバイダ ${provider.id} でエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        {},
        { cause: error },
      );
    }
    const parsed = parseAndNormalizeExtraction(raw, eventInfo.timezone);
    if (!parsed.success) {
      throw new CollectorError("VALIDATION_FAILED", formatZodIssues(parsed.error.issues));
    }

    // --- 6. 差分スナップショット ---
    const current = await loadCurrentEventState(db, source.eventId);
    if (!current) throw new CollectorError("EVENT_NOT_FOUND", `大会が見つかりません: ${source.eventId}`);
    const diff = computeCandidateDiff(current, parsed.data);
    result.extraction = parsed.data;
    result.diff = diff;

    // --- 7. 何も抽出できなかった場合は候補を作らない（実行は成功として記録する） ---
    const ev = parsed.data.event;
    const nothingExtracted =
      parsed.data.broadcastStatus === "UNKNOWN" &&
      parsed.data.broadcasts.length === 0 &&
      !ev.startDate &&
      !ev.endDate &&
      !ev.startAt &&
      !ev.venueName &&
      !diff.hasChanges;
    if (nothingExtracted) {
      result.nothingExtracted = true;
      if (!dryRun) await finishRun("SUCCEEDED");
      return { ...result, outcome: "SUCCEEDED" };
    }

    // --- 8. 候補の保存（レビュー待ち） ---
    if (!dryRun && runId) {
      const createdRunId = runId;
      const candidate = await db.$transaction(async (tx) => {
        const created = await tx.extractionCandidate.create({
          data: {
            eventId: source.eventId,
            sourceId: source.id,
            runId: createdRunId,
            fetchMode,
            providerId: provider.id,
            providerKind: provider.kind,
            contentHash,
            payload: toJson(parsed.data),
            diff: toJson(diff),
            reviewStatus: "PENDING",
          },
          select: { id: true },
        });
        await tx.collectionRun.update({
          where: { id: createdRunId },
          data: { status: "SUCCEEDED", finishedAt: now(), ...record },
        });
        return created;
      });
      finalized = true;
      result.candidateId = candidate.id;
    }
    return { ...result, outcome: "SUCCEEDED" };
  } catch (error) {
    const collectorError =
      findCollectorError(error) ??
      new CollectorError(
        "INTERNAL_ERROR",
        `予期しないエラー: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
        {},
        { cause: error },
      );
    const { details } = collectorError;
    if (details.httpStatus !== undefined) record.httpStatus = details.httpStatus;
    if (details.finalUrl !== undefined) record.finalUrl = details.finalUrl;
    if (details.contentType !== undefined) record.contentType = details.contentType;
    if (details.byteLength !== undefined) record.byteLength = details.byteLength;
    const status = isSkipErrorCode(collectorError.code) ? "SKIPPED" : "FAILED";
    const errorMessage = truncateMessage(collectorError.message);
    try {
      await finishRun(status, { errorCode: collectorError.code, errorMessage });
    } catch {
      // finally で RUNNING のまま残らないようにする
    }
    return {
      ...result,
      outcome: status,
      errorCode: collectorError.code,
      errorMessage,
      httpStatus: record.httpStatus,
      finalUrl: record.finalUrl,
    };
  } finally {
    if (runId && !finalized) {
      await db.collectionRun
        .updateMany({
          where: { id: runId, status: "RUNNING" },
          data: {
            status: "FAILED",
            finishedAt: now(),
            errorCode: "INTERNAL_ERROR",
            errorMessage: "実行の終了状態を記録できなかったため、失敗として記録しました",
          },
        })
        .catch(() => undefined);
    }
    if (httpAttemptedAt && !dryRun) {
      await db.source
        .update({ where: { id: source.id }, data: { lastFetchedAt: httpAttemptedAt } })
        .catch(() => undefined);
    }
    if (ownedFetcher) await ownedFetcher.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// 対象の選択と逐次実行
// ---------------------------------------------------------------------------

export type CollectTarget = { kind: "source"; sourceId: string } | { kind: "event"; slug: string } | { kind: "all" };

export type SourceSelection = {
  sourceIds: string[];
  /** 条件に一致した収集許可済みの情報源の総数（上限で切り捨てる前） */
  totalEnabled: number;
  /** 大会指定時の、収集が許可されていない情報源の数（対象外） */
  disabledCount: number;
  limit: number;
};

export function clampSourceLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isInteger(limit)) return DEFAULT_SOURCE_LIMIT;
  return Math.min(Math.max(limit, 1), MAX_SOURCE_LIMIT);
}

/** 処理対象の情報源を選ぶ。--source 指定時は collectEnabled に関わらず返し、collectSource 側で拒否する */
export async function selectSources(db: PrismaClient, target: CollectTarget, limit?: number): Promise<SourceSelection> {
  const take = clampSourceLimit(limit);
  switch (target.kind) {
    case "source":
      return { sourceIds: [target.sourceId], totalEnabled: 1, disabledCount: 0, limit: take };
    case "event": {
      const event = await db.event.findUnique({ where: { slug: target.slug }, select: { id: true } });
      if (!event) throw new CollectorError("EVENT_NOT_FOUND", `大会が見つかりません: ${target.slug}`);
      const [sources, totalEnabled, disabledCount] = await Promise.all([
        db.source.findMany({
          where: { eventId: event.id, collectEnabled: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take,
          select: { id: true },
        }),
        db.source.count({ where: { eventId: event.id, collectEnabled: true } }),
        db.source.count({ where: { eventId: event.id, collectEnabled: false } }),
      ]);
      return { sourceIds: sources.map((s) => s.id), totalEnabled, disabledCount, limit: take };
    }
    case "all": {
      const [sources, totalEnabled] = await Promise.all([
        db.source.findMany({
          where: { collectEnabled: true },
          orderBy: [{ lastFetchedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }, { id: "asc" }],
          take,
          select: { id: true },
        }),
        db.source.count({ where: { collectEnabled: true } }),
      ]);
      return { sourceIds: sources.map((s) => s.id), totalEnabled, disabledCount: 0, limit: take };
    }
  }
}

/**
 * 複数の情報源を逐次処理する（並列取得・再試行はしない）。
 * HTTP モードでは 1 つの取得器を共有し、robots.txt の結果と同一ホストへのアクセス間隔を引き継ぐ。
 */
export async function collectSources(
  db: PrismaClient,
  sourceIds: readonly string[],
  opts: CollectSourceOptions & { onResult?: (result: CollectSourceResult, index: number) => void },
): Promise<CollectSourceResult[]> {
  const fixtureStore = opts.fixtureStore ?? new FixtureStore();
  const providers = opts.providers ?? createProviderRegistry({ fixtureStore });
  const ownedFetcher = opts.fetchMode === "http" && !opts.httpFetcher ? new HttpPageFetcher() : null;
  const httpFetcher = opts.httpFetcher ?? ownedFetcher ?? undefined;
  const results: CollectSourceResult[] = [];
  try {
    for (const [index, sourceId] of sourceIds.entries()) {
      const result = await collectSource(db, sourceId, { ...opts, fixtureStore, providers, httpFetcher });
      results.push(result);
      opts.onResult?.(result, index);
    }
  } finally {
    if (ownedFetcher) await ownedFetcher.close().catch(() => undefined);
  }
  return results;
}
