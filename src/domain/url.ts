/**
 * 外部 URL の検証。画面に出すリンク・管理画面の入力・抽出結果のすべてで使う。
 * http / https 以外（javascript:, data:, file: など）と、認証情報付き URL を拒否する。
 */
import { z } from "zod";

export const MAX_URL_LENGTH = 2048;

/** http(s) の URL として解釈できれば URL を返す。不可なら null */
export function parseHttpUrl(input: string | null | undefined): URL | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname) return null;
  return url;
}

export function isHttpUrl(input: string | null | undefined): boolean {
  return parseHttpUrl(input) !== null;
}

/** リンクの href に使ってよい正規化済み URL。使えない場合は null（リンクを出さない） */
export function safeExternalHref(input: string | null | undefined): string | null {
  return parseHttpUrl(input)?.href ?? null;
}

/** 必須の http(s) URL */
export const httpUrlSchema = z
  .string()
  .trim()
  .max(MAX_URL_LENGTH, { error: "URL が長すぎます" })
  .refine((v) => isHttpUrl(v), { error: "http:// または https:// で始まる URL を入力してください" })
  .transform((v) => parseHttpUrl(v)!.href);

/** 任意の http(s) URL。空文字・空白のみ・未指定は null として扱う（フォーム入力向け） */
export const optionalHttpUrlSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    const url = parseHttpUrl(trimmed);
    if (!url) {
      ctx.addIssue({ code: "custom", message: "http:// または https:// で始まる URL を入力してください" });
      return z.NEVER;
    }
    return url.href;
  });
