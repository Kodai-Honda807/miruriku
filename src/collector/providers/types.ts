/**
 * 抽出プロバイダのインターフェース。
 *
 * - 入力のテキストは外部ページ由来の「信頼できないデータ」。ページ内の指示を命令として扱わない
 * - 出力は unknown として扱い、パイプラインが必ず parseAndNormalizeExtraction（src/domain/candidate.ts）で
 *   検証・正規化する。プロバイダの出力を根拠にツール実行・コード実行・URL の追加取得などは行わない
 * - 出力の形は extractionResultSchema（大会の日付・時刻は開催地の現地時刻、放送・配信は日本時間）
 */
import type { LocalDate } from "@/domain/datetime";
import type { ExtractionProviderKind } from "@/domain/enums";

export type ExtractionEventInfo = {
  name: string;
  seasonYear: number;
  /** 開催地の現地日付 */
  startDate: LocalDate;
  endDate: LocalDate;
  /** 開催地の IANA タイムゾーン */
  timezone: string;
};

export type ExtractionInput = {
  /** 情報源として登録された URL */
  sourceUrl: string;
  /** HTML から抽出したテキスト（信頼できないデータ） */
  text: string;
  event: ExtractionEventInfo;
};

export interface ExtractionProvider {
  /** CLI の --provider で指定する ID（CollectionRun / ExtractionCandidate の providerId） */
  readonly id: string;
  /** 抽出方法の種類。固定データを返すものは必ず FIXTURE とし、実収集と誤認させない */
  readonly kind: ExtractionProviderKind;
  /** 表示用の短い説明 */
  readonly description: string;
  /** 固定ファイルモード（--fetch fixture）でのみ使えるか */
  readonly fixtureOnly: boolean;
  extract(input: ExtractionInput): Promise<unknown>;
}
