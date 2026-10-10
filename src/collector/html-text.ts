/**
 * HTML からテキストのみを取り出す（JavaScript は実行しない。ヘッドレスブラウザも使わない）。
 *
 * - script / style / noscript / template / svg / iframe / object などの中身は捨てる
 * - ブロック要素・<br> で改行し、表のセルは空白で区切る。行内の空白は 1 つにまとめる
 * - 文字参照（&amp; など）は htmlparser2 がデコードする
 * - 最大文字数で切り詰める
 *
 * 取り出したテキストは信頼できないデータとして扱うこと（ページ内の指示を命令として解釈しない）。
 */
import { createHash } from "node:crypto";

import { Parser } from "htmlparser2";

import { MAX_TEXT_CHARS } from "./config";

/** 中身をテキストとして扱わない要素 */
const SKIP_CONTENT_TAGS: ReadonlySet<string> = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "math",
  "iframe",
  "frame",
  "frameset",
  "object",
  "applet",
  "canvas",
  "audio",
  "video",
  "textarea",
  "select",
  "datalist",
]);

/** 前後で改行する要素 */
const BLOCK_TAGS: ReadonlySet<string> = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "caption",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "html",
  "legend",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "thead",
  "tfoot",
  "title",
  "tr",
  "ul",
]);

/** 前に空白を入れる要素（表のセル） */
const CELL_TAGS: ReadonlySet<string> = new Set(["td", "th"]);

export type ExtractedText = {
  text: string;
  /** 最大文字数で切り詰めたか */
  truncated: boolean;
};

/** サロゲートペアを分断せずに先頭から max 文字（UTF-16 単位）以内に切り詰める */
export function truncateSafely(value: string, max: number): string {
  if (value.length <= max) return value;
  let end = max;
  const code = value.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return value.slice(0, end);
}

export function extractTextFromHtml(html: string, maxChars = MAX_TEXT_CHARS): ExtractedText {
  const parts: string[] = [];
  let skipDepth = 0;

  const parser = new Parser(
    {
      onopentag(name) {
        if (SKIP_CONTENT_TAGS.has(name)) {
          skipDepth += 1;
          return;
        }
        if (skipDepth > 0) return;
        if (name === "br" || BLOCK_TAGS.has(name)) parts.push("\n");
        else if (CELL_TAGS.has(name)) parts.push(" ");
      },
      onclosetag(name) {
        if (SKIP_CONTENT_TAGS.has(name)) {
          if (skipDepth > 0) skipDepth -= 1;
          return;
        }
        if (skipDepth > 0) return;
        if (BLOCK_TAGS.has(name)) parts.push("\n");
        else if (CELL_TAGS.has(name)) parts.push(" ");
      },
      ontext(data) {
        if (skipDepth > 0) return;
        // HTML 内の改行・タブ・全角空白・&nbsp; などはすべて空白として扱う
        parts.push(data.replace(/\s+/g, " "));
      },
    },
    { decodeEntities: true, lowerCaseTags: true },
  );
  parser.write(html);
  parser.end();

  const lines = parts
    .join("")
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .filter((line) => line.length > 0);
  const text = lines.join("\n");
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: truncateSafely(text, maxChars), truncated: true };
}

/** 抽出テキストの SHA-256（16 進）。CollectionRun / ExtractionCandidate の contentHash */
export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** <meta charset> / <meta http-equiv="Content-Type"> から文字コードを探す（先頭 4KB のみ） */
function sniffMetaCharset(bytes: Uint8Array): string | null {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const m = /<meta[^>]*?charset\s*=\s*["']?\s*([a-zA-Z0-9_.:-]+)/i.exec(head);
  return m ? m[1].toLowerCase() : null;
}

/**
 * HTML のバイト列を文字列にする。
 * 優先順位: BOM → Content-Type の charset → <meta> の charset → UTF-8。
 * 解釈できない文字コード名の場合は UTF-8 として読む。
 */
export function decodeHtmlBytes(bytes: Uint8Array, headerCharset: string | null): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  const label = headerCharset ?? sniffMetaCharset(bytes) ?? "utf-8";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
