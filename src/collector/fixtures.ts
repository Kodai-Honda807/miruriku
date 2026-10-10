/**
 * 固定ファイルモード（--fetch fixture）。デモ・テスト専用で、ネットワークには一切アクセスしない。
 *
 * fixtures/collector/manifest.json で「情報源の URL → HTML ファイル（＋ fixture プロバイダ用の抽出 JSON）」を対応付ける。
 *
 * デモデータの日付は seed の基準日によって変わるため、固定ファイル内の次のトークンを大会データから置換する
 * （固定ファイル専用の機能。HTTP で取得したページには適用しない）:
 *   {{EVENT_NAME}}        大会名
 *   {{EVENT_START_DATE}}  開催初日（開催地の現地日付）例: 2026-10-11
 *   {{EVENT_END_DATE}}    開催最終日
 *   {{EVENT_DATE_JA}}     例: 10月11日（日）
 *   {{EVENT_YEAR}} {{EVENT_MONTH}} {{EVENT_DAY}}  例: 2026 / 10 / 11（先頭の 0 なし）
 *   {{EVENT_WEEKDAY}}     例: 日
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { formatLocalDateJa, weekdayOfLocalDate, type LocalDate } from "@/domain/datetime";
import { parseHttpUrl } from "@/domain/url";

import { MAX_PAGE_BYTES } from "./config";
import { CollectorError } from "./errors";

export const DEFAULT_FIXTURES_DIR = path.resolve(import.meta.dirname, "../../fixtures/collector");

const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

const manifestSchema = z.strictObject({
  version: z.literal(1),
  description: z.string().optional(),
  entries: z.array(
    z.strictObject({
      sourceUrl: z.string().min(1),
      /** HTML ファイル（manifest.json からの相対パス） */
      page: z.string().min(1),
      contentType: z.string().min(1).default("text/html; charset=utf-8"),
      /** fixture プロバイダが返す抽出 JSON（任意） */
      extraction: z.string().min(1).nullable().default(null),
      note: z.string().optional(),
    }),
  ),
});

export type FixtureManifest = z.output<typeof manifestSchema>;
export type FixtureEntry = FixtureManifest["entries"][number];

export type FixtureEventInfo = { name: string; startDate: LocalDate; endDate: LocalDate };

export function buildFixtureTokens(event: FixtureEventInfo): Record<string, string> {
  const [year, month, day] = event.startDate.split("-");
  return {
    EVENT_NAME: event.name,
    EVENT_START_DATE: event.startDate,
    EVENT_END_DATE: event.endDate,
    EVENT_DATE_JA: formatLocalDateJa(event.startDate),
    EVENT_YEAR: year,
    EVENT_MONTH: String(Number(month)),
    EVENT_DAY: String(Number(day)),
    EVENT_WEEKDAY: WEEKDAYS_JA[weekdayOfLocalDate(event.startDate)],
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function escapeJsonString(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

/** {{TOKEN}} を置換する。未知のトークンがあれば FIXTURE_INVALID */
export function applyFixtureTokens(
  template: string,
  tokens: Record<string, string>,
  escape: (value: string) => string = (v) => v,
): string {
  return template.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_, name: string) => {
    if (!Object.hasOwn(tokens, name)) {
      throw new CollectorError("FIXTURE_INVALID", `固定ファイルに未知のトークンがあります: {{${name}}}`);
    }
    return escape(tokens[name]);
  });
}

function normalizeUrlKey(url: string): string | null {
  return parseHttpUrl(url)?.href ?? null;
}

export type FixturePage = {
  entry: FixtureEntry;
  html: string;
  contentType: string;
  byteLength: number;
};

export class FixtureStore {
  private manifest: Promise<FixtureManifest> | null = null;

  constructor(readonly rootDir: string = DEFAULT_FIXTURES_DIR) {}

  /** rootDir 配下のファイルだけを読む（パストラバーサル防止） */
  private resolveInRoot(relativePath: string): string {
    const root = path.resolve(this.rootDir);
    const resolved = path.resolve(root, relativePath);
    if (!resolved.startsWith(root + path.sep)) {
      throw new CollectorError("FIXTURE_INVALID", `固定ファイルのパスが不正です: ${relativePath}`);
    }
    return resolved;
  }

  private async readText(relativePath: string): Promise<string> {
    const file = this.resolveInRoot(relativePath);
    try {
      const info = await stat(file);
      if (!info.isFile() || info.size > MAX_PAGE_BYTES) {
        throw new CollectorError("FIXTURE_INVALID", `固定ファイルが大きすぎるか、通常のファイルではありません: ${relativePath}`);
      }
      return await readFile(file, "utf8");
    } catch (error) {
      if (error instanceof CollectorError) throw error;
      throw new CollectorError("FIXTURE_NOT_FOUND", `固定ファイルを読み込めません: ${relativePath}`, {}, { cause: error });
    }
  }

  loadManifest(): Promise<FixtureManifest> {
    if (!this.manifest) {
      this.manifest = (async () => {
        const text = await this.readText("manifest.json");
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch (error) {
          throw new CollectorError("FIXTURE_INVALID", "manifest.json を JSON として解釈できません", {}, { cause: error });
        }
        const parsed = manifestSchema.safeParse(json);
        if (!parsed.success) {
          throw new CollectorError("FIXTURE_INVALID", `manifest.json の形式が不正です: ${parsed.error.message.slice(0, 300)}`);
        }
        return parsed.data;
      })();
      this.manifest.catch(() => {
        this.manifest = null;
      });
    }
    return this.manifest;
  }

  async findEntry(sourceUrl: string): Promise<FixtureEntry | null> {
    const key = normalizeUrlKey(sourceUrl);
    if (!key) return null;
    const manifest = await this.loadManifest();
    return manifest.entries.find((e) => normalizeUrlKey(e.sourceUrl) === key) ?? null;
  }

  private async requireEntry(sourceUrl: string): Promise<FixtureEntry> {
    const entry = await this.findEntry(sourceUrl);
    if (!entry) {
      throw new CollectorError("FIXTURE_NOT_FOUND", `この情報源の固定ファイルは manifest.json に登録されていません: ${sourceUrl}`);
    }
    return entry;
  }

  /** 情報源 URL に対応する HTML を読み、トークンを置換して返す */
  async loadPage(sourceUrl: string, event: FixtureEventInfo): Promise<FixturePage> {
    const entry = await this.requireEntry(sourceUrl);
    const template = await this.readText(entry.page);
    const html = applyFixtureTokens(template, buildFixtureTokens(event), escapeHtml);
    return { entry, html, contentType: entry.contentType, byteLength: Buffer.byteLength(html, "utf8") };
  }

  /** fixture プロバイダ用: 情報源 URL に対応する抽出 JSON を読み、トークンを置換して返す（未検証の unknown） */
  async loadExtraction(sourceUrl: string, event: FixtureEventInfo): Promise<unknown> {
    const entry = await this.requireEntry(sourceUrl);
    if (!entry.extraction) {
      throw new CollectorError("FIXTURE_NOT_FOUND", `この情報源には固定の抽出 JSON がありません: ${sourceUrl}`);
    }
    const template = await this.readText(entry.extraction);
    const text = applyFixtureTokens(template, buildFixtureTokens(event), escapeJsonString);
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new CollectorError("FIXTURE_INVALID", `抽出 JSON を解釈できません: ${entry.extraction}`, {}, { cause: error });
    }
  }
}
