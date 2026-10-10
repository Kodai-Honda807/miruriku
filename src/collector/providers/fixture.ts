/**
 * fixture プロバイダ（kind = FIXTURE）。
 * fixtures/collector の固定の抽出 JSON を返すだけで、ページの内容は解析しない（デモ・テスト用であり実収集ではない）。
 * 固定ファイルモード（--fetch fixture）でのみ使える。
 */
import { FixtureStore } from "../fixtures";
import type { ExtractionProvider } from "./types";

export const FIXTURE_PROVIDER_ID = "fixture";

export function createFixtureProvider(store: FixtureStore = new FixtureStore()): ExtractionProvider {
  return {
    id: FIXTURE_PROVIDER_ID,
    kind: "FIXTURE",
    description: "固定データ（デモ・テスト用。実際の収集ではありません）",
    fixtureOnly: true,
    async extract(input) {
      return store.loadExtraction(input.sourceUrl, input.event);
    },
  };
}
