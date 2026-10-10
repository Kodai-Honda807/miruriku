/**
 * 取得してよい URL かの判定（名前解決の前に行う静的な検査）。
 *
 * - http / https のみ。認証情報付き URL は拒否
 * - ポートは既定（http:80 / https:443）のみ
 * - localhost・ローカル用ドメイン・メタデータ系のホスト名・ドットを含まない単一ラベル名は拒否
 * - IP リテラルは禁止範囲なら拒否（公開アドレスは許可）
 * 名前解決後のアドレス検査は dns-guard.ts が行う。
 */
import { isIP } from "node:net";

import { MAX_URL_LENGTH } from "@/domain/url";

import { CollectorError } from "./errors";
import { isBlockedAddress, stripAddressDecorations } from "./ip-policy";

/** 完全一致で拒否するホスト名 */
const BLOCKED_HOSTNAMES: ReadonlySet<string> = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "metadata.azure.com",
  "instance-data",
  "instance-data.ec2.internal",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

/** この接尾辞で終わるホスト名を拒否する（ローカル・内部用・名前解決できない予約ドメイン） */
const BLOCKED_HOST_SUFFIXES: readonly string[] = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".home.arpa",
  ".lan",
  ".intranet",
  ".corp",
  ".home",
  ".svc",
  ".arpa",
  ".onion",
  ".test",
  ".invalid",
];

/** 末尾のドットを除き小文字にしたホスト名 */
export function normalizeHostname(hostname: string): string {
  return stripAddressDecorations(hostname).toLowerCase().replace(/\.+$/, "");
}

/** ホスト名（または IP リテラル）を検査する。問題があれば CollectorError を投げる */
export function assertAllowedHostname(hostname: string): void {
  const host = normalizeHostname(hostname);
  if (!host) {
    throw new CollectorError("BLOCKED_HOST", "ホスト名が空です");
  }
  if (isIP(host) !== 0) {
    if (isBlockedAddress(host)) {
      throw new CollectorError("BLOCKED_ADDRESS", `禁止範囲の IP アドレスです: ${host}`);
    }
    return;
  }
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new CollectorError("BLOCKED_HOST", `取得が禁止されたホスト名です: ${host}`);
  }
  if (!host.includes(".")) {
    throw new CollectorError("BLOCKED_HOST", `ドメインを含まないホスト名は取得しません: ${host}`);
  }
  if (host.split(".")[0] === "metadata") {
    throw new CollectorError("BLOCKED_HOST", `メタデータ系のホスト名は取得しません: ${host}`);
  }
}

/**
 * URL を検査し、取得に使う URL（フラグメントを除いたもの）を返す。
 * 問題があれば CollectorError を投げる。
 */
export function assertFetchableUrl(input: string | URL): URL {
  const raw = typeof input === "string" ? input.trim() : input.href;
  if (raw.length === 0 || raw.length > MAX_URL_LENGTH) {
    throw new CollectorError("INVALID_URL", "URL が空か長すぎます");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CollectorError("INVALID_URL", `URL を解釈できません: ${raw.slice(0, 200)}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CollectorError("UNSUPPORTED_SCHEME", `http / https 以外の URL は取得しません: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new CollectorError("CREDENTIALS_IN_URL", "認証情報を含む URL は取得しません");
  }
  // WHATWG URL はスキームの既定ポートを空文字にするため、空でなければ既定以外のポート
  if (url.port !== "") {
    throw new CollectorError("PORT_NOT_ALLOWED", `既定以外のポートは取得しません: ${url.port}`);
  }
  assertAllowedHostname(url.hostname);
  url.hash = "";
  return url;
}

/** 先頭の "www." の有無の違いだけを許容した同一ホスト判定 */
export function isSameSiteHost(a: string, b: string): boolean {
  const strip = (h: string) => normalizeHostname(h).replace(/^www\./, "");
  return strip(a) === strip(b);
}
