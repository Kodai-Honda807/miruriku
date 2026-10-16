/**
 * 収集 CLI（scripts/collect.ts から呼ぶ）。引数の解釈と結果の日本語表示。
 *
 *   pnpm collect --event demo-city-marathon --fetch fixture --provider rule-based
 *   pnpm collect --source <sourceId>
 *   pnpm collect --all [--limit 10]
 *   pnpm collect ... --dry-run
 *
 * 取得対象は DB に登録され collectEnabled=true の情報源の URL だけ（任意の URL は受け付けない）。
 */
import { parseArgs } from "node:util";

import type { ExtractedBroadcastStatus, NormalizedBroadcast } from "@/domain/candidate";
import { JST, formatInstantJst, formatLocalDateJa, toZonedParts } from "@/domain/datetime";
import type { CandidateDiff, FieldChange } from "@/domain/diff";
import {
  BROADCAST_INFO_STATUS_LABELS,
  BROADCAST_MEDIUM_LABELS,
  COST_TYPE_LABELS,
  EXTRACTION_PROVIDER_KIND_LABELS,
  FETCH_MODE_LABELS,
  REGION_AVAILABILITY_LABELS,
  VIEWING_TYPE_LABELS,
} from "@/domain/labels";
import type { BroadcastInfoStatus } from "@/domain/enums";
import { createPrismaClient, type PrismaClient } from "@/lib/prisma";

import { DEFAULT_SOURCE_LIMIT, MAX_SOURCE_LIMIT, resolveUserAgent } from "./config";
import { collectorErrorLabel, findCollectorError } from "./errors";
import { FixtureStore } from "./fixtures";
import { HttpPageFetcher } from "./http-fetcher";
import {
  collectSources,
  selectSources,
  type CollectSourceResult,
  type CollectTarget,
  type FetchModeOption,
} from "./pipeline";
import { createProviderRegistry, listProviderIds, type ProviderRegistry } from "./providers/registry";

export const HELP_TEXT = `みる陸 収集 CLI — 登録済みの情報源から放送・配信情報の「収集候補」を作ります

使い方:
  pnpm collect (--event <slug> | --source <id> | --all) [オプション]

対象（いずれか 1 つを指定）:
  --event <slug>        大会の、収集が許可された情報源（collectEnabled=true）を処理
  --source <id>         情報源を 1 件処理（collectEnabled=false なら実行しません）
  --all                 収集が許可されたすべての情報源を処理（--limit 件まで）

オプション:
  --fetch <http|fixture>
                        取得方法（既定: http）
                          http    : 安全対策付きの HTTP 取得（robots.txt を尊重）
                          fixture : fixtures/collector の固定ファイルを読み込む（デモ・テスト用。通信しません）
  --provider <id>       抽出プロバイダ（既定: rule-based）
                          rule-based : ルールベース抽出（API キー不要）
                          fixture    : 固定データ（デモ・テスト用。--fetch fixture でのみ使用可）
  --limit <n>           1 回の実行で処理する情報源の上限（既定 ${DEFAULT_SOURCE_LIMIT}、最大 ${MAX_SOURCE_LIMIT}）
  --dry-run             DB に書き込まず、抽出結果と差分を表示
  -h, --help            このヘルプを表示

例:
  pnpm collect --event demo-city-marathon --fetch fixture --provider rule-based
  pnpm collect --event demo-city-marathon --fetch fixture --dry-run

注意:
  - 作成した候補は管理画面で人が確認・承認するまで DB に反映されません（公開サイトは data/real-events.ts から作ります）。
  - 情報源の利用条件（利用規約・転載可否など）の確認は、情報源を登録・許可する人が行ってください。
  - 環境変数 COLLECTOR_USER_AGENT で User-Agent を指定できます（連絡先を含めることを推奨）。
  - 失敗があった場合の終了コードは 1 です。`;

export type CliOptions = {
  target: CollectTarget;
  fetchMode: FetchModeOption;
  providerId: string;
  limit: number;
  dryRun: boolean;
};

export type ParsedCliArgs = { kind: "help" } | { kind: "run"; options: CliOptions } | { kind: "error"; message: string };

export function parseCollectArgs(argv: readonly string[]): ParsedCliArgs {
  // `pnpm collect -- --event ...` のように区切りの "--" が渡ってきた場合は取り除く
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        event: { type: "string" },
        source: { type: "string" },
        all: { type: "boolean" },
        fetch: { type: "string" },
        provider: { type: "string" },
        limit: { type: "string" },
        "dry-run": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (error) {
    return { kind: "error", message: `引数を解釈できません: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (values.help) return { kind: "help" };

  const targets: CollectTarget[] = [];
  if (typeof values.event === "string") {
    const slug = values.event.trim();
    if (!slug) return { kind: "error", message: "--event には大会のスラッグを指定してください" };
    targets.push({ kind: "event", slug });
  }
  if (typeof values.source === "string") {
    const sourceId = values.source.trim();
    if (!sourceId) return { kind: "error", message: "--source には情報源の ID を指定してください" };
    targets.push({ kind: "source", sourceId });
  }
  if (values.all) targets.push({ kind: "all" });
  if (targets.length !== 1) {
    return { kind: "error", message: "対象として --event / --source / --all のいずれか 1 つを指定してください" };
  }

  const fetchMode = (values.fetch ?? "http") as string;
  if (fetchMode !== "http" && fetchMode !== "fixture") {
    return { kind: "error", message: `--fetch には http または fixture を指定してください: ${fetchMode}` };
  }

  let limit = DEFAULT_SOURCE_LIMIT;
  if (typeof values.limit === "string") {
    if (!/^\d+$/.test(values.limit) || Number(values.limit) < 1 || Number(values.limit) > MAX_SOURCE_LIMIT) {
      return { kind: "error", message: `--limit には 1〜${MAX_SOURCE_LIMIT} の整数を指定してください` };
    }
    limit = Number(values.limit);
  }

  return {
    kind: "run",
    options: {
      target: targets[0],
      fetchMode,
      providerId: typeof values.provider === "string" ? values.provider.trim() : "rule-based",
      limit,
      dryRun: Boolean(values["dry-run"]),
    },
  };
}

// ---------------------------------------------------------------------------
// 表示
// ---------------------------------------------------------------------------

const EXTRACTED_STATUS_LABELS: Record<ExtractedBroadcastStatus, string> = {
  CONFIRMED: "放送・配信予定の記載あり",
  NOT_ANNOUNCED: "未発表・未定の記載あり",
  NO_BROADCAST: "放送・配信なしの記載あり",
  UNKNOWN: "ページから判断できず",
};

const EVENT_FIELD_LABELS: Record<string, string> = {
  startDate: "開催初日",
  endDate: "開催最終日",
  startAt: "競技開始",
  venueName: "会場",
  broadcastInfoStatus: "放送・配信情報の状態",
};

function formatEventChange(change: FieldChange): string {
  const label = EVENT_FIELD_LABELS[change.field] ?? change.field;
  const fmt = (v: string | null) => {
    if (v === null) return "（なし）";
    if (change.field === "broadcastInfoStatus") return BROADCAST_INFO_STATUS_LABELS[v as BroadcastInfoStatus] ?? v;
    if (change.field === "startAt") return formatInstantJst(new Date(v), { withYear: true });
    return v;
  };
  return `${label}: ${fmt(change.before)} → ${fmt(change.after)}`;
}

function formatBroadcast(b: NormalizedBroadcast): string {
  let when = "日時不明";
  if (b.startAt) {
    when = formatInstantJst(new Date(b.startAt));
    if (b.endAt) when += `〜${toZonedParts(new Date(b.endAt), JST).time}`;
  } else if (b.airDate) {
    when = `${formatLocalDateJa(b.airDate)}（時刻不明）`;
  }
  const parts = [
    BROADCAST_MEDIUM_LABELS[b.medium],
    b.providerName,
    when,
    VIEWING_TYPE_LABELS[b.viewingType],
    COST_TYPE_LABELS[b.cost],
    REGION_AVAILABILITY_LABELS[b.region],
  ];
  if (b.watchUrl) parts.push(`視聴: ${b.watchUrl}`);
  return parts.join(" / ");
}

function diffCounts(diff: CandidateDiff) {
  return {
    add: diff.slots.filter((s) => s.kind === "add").length,
    update: diff.slots.filter((s) => s.kind === "update").length,
    unchanged: diff.slots.filter((s) => s.kind === "unchanged").length,
  };
}

const OUTCOME_LABELS: Record<CollectSourceResult["outcome"], string> = {
  SUCCEEDED: "成功",
  FAILED: "失敗",
  SKIPPED: "取得せず",
  REJECTED: "実行せず",
};

export function formatResultLines(result: CollectSourceResult, index: number, total: number): string[] {
  const lines: string[] = [];
  const title = [result.eventName, result.sourceTitle].filter(Boolean).join(" / ") || result.sourceId;
  lines.push(`[${index + 1}/${total}] ${title}`);
  lines.push(`  情報源 ID: ${result.sourceId}`);
  if (result.sourceUrl) lines.push(`  URL: ${result.sourceUrl}`);

  let summary = OUTCOME_LABELS[result.outcome];
  if (result.outcome === "SUCCEEDED") {
    if (result.nothingExtracted) {
      summary += " — ページから放送・配信や大会の情報を抽出できなかったため、候補は作成しませんでした（公式ページを人が確認してください）";
    } else if (result.duplicateOfCandidateId) {
      summary += ` — 内容が前回の未レビュー候補と同じため、新しい候補は作成しませんでした（既存の候補 ID: ${result.duplicateOfCandidateId}）`;
    } else if (result.dryRun) {
      summary += " — ドライランのため候補は保存していません";
    } else {
      summary += ` — 収集候補を作成しました（未レビュー）。候補 ID: ${result.candidateId}`;
    }
  } else if (result.errorCode) {
    summary += ` — ${collectorErrorLabel(result.errorCode)}（${result.errorCode}）`;
  }
  lines.push(`  結果: ${summary}`);
  if (result.runId) lines.push(`  実行 ID: ${result.runId}`);
  if (result.httpStatus !== null) lines.push(`  HTTP ステータス: ${result.httpStatus}`);
  if (result.errorMessage) lines.push(`  詳細: ${result.errorMessage}`);
  if (result.textTruncated) lines.push("  注意: ページのテキストが長いため、上限で切り詰めて解析しました");

  if (result.extraction && result.diff) {
    const ex = result.extraction;
    const counts = diffCounts(result.diff);
    lines.push(`  抽出: ${EXTRACTED_STATUS_LABELS[ex.broadcastStatus]}（${ex.broadcastStatus}）、放送・配信枠 ${ex.broadcasts.length} 件`);
    lines.push(
      `  差分: 大会情報の変更 ${result.diff.eventChanges.length} 件、枠の追加 ${counts.add} 件・更新 ${counts.update} 件・変更なし ${counts.unchanged} 件、候補に含まれない既存枠 ${result.diff.untouchedSlots.length} 件`,
    );
    for (const change of result.diff.eventChanges) lines.push(`    - 大会: ${formatEventChange(change)}`);
    for (const slot of result.diff.slots) {
      if (slot.kind === "add") lines.push(`    - 追加: ${formatBroadcast(slot.proposed)}`);
      else if (slot.kind === "update") {
        lines.push(`    - 更新: ${formatBroadcast(slot.proposed)}（変更: ${slot.changes.map((c) => c.field).join(", ")}）`);
      } else lines.push(`    - 変更なし: ${formatBroadcast(slot.proposed)}`);
    }
    if (ex.notes) lines.push(`  抽出メモ: ${ex.notes.replace(/\n/g, " / ")}`);
  }
  return lines;
}

function describeTarget(target: CollectTarget): string {
  switch (target.kind) {
    case "event":
      return `大会 ${target.slug} の収集許可済み情報源`;
    case "source":
      return `情報源 ${target.sourceId}`;
    case "all":
      return "収集許可済みのすべての情報源";
  }
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------

export type CliIo = {
  out: (line: string) => void;
  err: (line: string) => void;
};

const consoleIo: CliIo = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

export type CliDeps = {
  /** 省略時は DATABASE_URL から作成し、終了時に切断する */
  db?: PrismaClient;
  createDb?: () => PrismaClient;
  io?: CliIo;
  providers?: ProviderRegistry;
  fixtureStore?: FixtureStore;
  httpFetcherFactory?: () => HttpPageFetcher;
};

/** CLI を実行して終了コードを返す（失敗・拒否が 1 件でもあれば 1） */
export async function runCollectCli(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  const io = deps.io ?? consoleIo;
  const parsed = parseCollectArgs(argv);
  if (parsed.kind === "help") {
    io.out(HELP_TEXT);
    return 0;
  }
  if (parsed.kind === "error") {
    io.err(parsed.message);
    io.err("使い方は pnpm collect --help を参照してください。");
    return 1;
  }
  const options = parsed.options;
  const fixtureStore = deps.fixtureStore ?? new FixtureStore();
  const providers = deps.providers ?? createProviderRegistry({ fixtureStore });
  const provider = providers.get(options.providerId);
  if (!provider) {
    io.err(`未登録の抽出プロバイダです: ${options.providerId}（利用可能: ${listProviderIds(providers).join(", ")}）`);
    return 1;
  }
  if (provider.fixtureOnly && options.fetchMode !== "fixture") {
    io.err(`抽出プロバイダ ${provider.id} は固定データを返すため、--fetch fixture と組み合わせてください。`);
    return 1;
  }

  let httpFetcher: HttpPageFetcher | undefined;
  if (options.fetchMode === "http") {
    try {
      resolveUserAgent();
    } catch (error) {
      io.err(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  const ownsDb = !deps.db;
  let db: PrismaClient;
  try {
    db = deps.db ?? (deps.createDb ?? createPrismaClient)();
  } catch (error) {
    io.err(`DB に接続できません: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  try {
    const fetchModeKey = options.fetchMode === "fixture" ? "FIXTURE" : "HTTP";
    io.out("みる陸 収集 CLI");
    io.out(`  取得方法: ${FETCH_MODE_LABELS[fetchModeKey]}${options.fetchMode === "fixture" ? " — ネットワークにはアクセスしません" : ""}`);
    io.out(`  抽出方法: ${EXTRACTION_PROVIDER_KIND_LABELS[provider.kind]}（${provider.id}）`);
    io.out(`  対象: ${describeTarget(options.target)}`);
    if (options.dryRun) io.out("  ドライラン: DB には書き込みません");
    if (options.fetchMode === "fixture" || provider.kind === "FIXTURE") {
      io.out(
        "  ※ 固定ファイル・固定データによる結果です。実際の Web ページの取得や AI による収集の結果ではありません。",
      );
    }
    io.out("");

    let selection;
    try {
      selection = await selectSources(db, options.target, options.limit);
    } catch (error) {
      const found = findCollectorError(error);
      io.err(found ? found.message : `対象を取得できません: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
    if (selection.sourceIds.length === 0) {
      const extra = selection.disabledCount > 0 ? `（収集が許可されていない情報源 ${selection.disabledCount} 件は対象外）` : "";
      io.err(`収集が許可された情報源がありません${extra}。`);
      return 1;
    }
    if (selection.totalEnabled > selection.sourceIds.length) {
      io.out(
        `収集許可済みの情報源 ${selection.totalEnabled} 件のうち、上限の ${selection.limit} 件のみ処理します（残りは次回以降）。`,
      );
    }
    if (selection.disabledCount > 0) {
      io.out(`収集が許可されていない情報源 ${selection.disabledCount} 件は対象外です。`);
    }

    httpFetcher = options.fetchMode === "http" ? (deps.httpFetcherFactory?.() ?? new HttpPageFetcher()) : undefined;
    const total = selection.sourceIds.length;
    const results = await collectSources(db, selection.sourceIds, {
      fetchMode: options.fetchMode,
      providerId: options.providerId,
      dryRun: options.dryRun,
      providers,
      fixtureStore,
      httpFetcher,
      onResult: (result, index) => {
        for (const line of formatResultLines(result, index, total)) io.out(line);
        io.out("");
      },
    });

    const count = (outcome: CollectSourceResult["outcome"]) => results.filter((r) => r.outcome === outcome).length;
    const created = results.filter((r) => r.candidateId).length;
    const duplicates = results.filter((r) => r.duplicateOfCandidateId).length;
    const nothing = results.filter((r) => r.nothingExtracted).length;
    io.out(
      `まとめ: 成功 ${count("SUCCEEDED")} 件（候補を作成 ${created} 件、同内容のため作成せず ${duplicates} 件、抽出結果なし ${nothing} 件）、失敗 ${count("FAILED")} 件、取得せず ${count("SKIPPED")} 件、実行せず ${count("REJECTED")} 件`,
    );
    if (!options.dryRun && created > 0) {
      io.out("候補は管理画面で人が確認・承認するまで DB には反映されません（公開サイトは data/real-events.ts から作ります）。");
    }
    return count("FAILED") + count("REJECTED") > 0 ? 1 : 0;
  } catch (error) {
    io.err(`予期しないエラーで中断しました: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    if (httpFetcher) await httpFetcher.close().catch(() => undefined);
    if (ownsDb) await db.$disconnect().catch(() => undefined);
  }
}
