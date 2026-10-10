/**
 * 抽出プロバイダのレジストリ（ID → プロバイダ）。CLI の --provider で選ぶ。
 * LLM プロバイダは未実装（追加時の注意は ./README.md を参照）。
 */
import { FixtureStore } from "../fixtures";
import { createFixtureProvider } from "./fixture";
import { createRuleBasedProvider } from "./rule-based";
import type { ExtractionProvider } from "./types";

export type ProviderRegistry = ReadonlyMap<string, ExtractionProvider>;

export function createProviderRegistry(deps: { fixtureStore?: FixtureStore } = {}): ProviderRegistry {
  const providers: ExtractionProvider[] = [
    createRuleBasedProvider(),
    createFixtureProvider(deps.fixtureStore ?? new FixtureStore()),
  ];
  return new Map(providers.map((p) => [p.id, p]));
}

export function listProviderIds(registry: ProviderRegistry): string[] {
  return [...registry.keys()];
}
