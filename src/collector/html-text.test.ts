import { describe, expect, it } from "vitest";

import { decodeHtmlBytes, extractTextFromHtml, hashText, truncateSafely } from "./html-text";

describe("extractTextFromHtml", () => {
  it("script / style / noscript / template / svg / iframe / object の中身を捨てる", () => {
    const html = `<!doctype html><html><head><title>題名</title>
      <style>.a::after { content: "スタイル内" }</style>
      <script>document.write("スクリプト内"); fetch("https://example.com/x")</script></head>
      <body><p>本文1</p>
      <noscript><p>noscript内</p></noscript>
      <template><p>template内</p></template>
      <svg><text>svg内</text><path d="M0 0"/></svg>
      <iframe src="https://example.com/">iframe内</iframe>
      <object data="x.swf"><p>object内</p></object>
      <p>本文2</p>
      <script type="application/ld+json">{"name":"構造化データ"}</script>
      </body></html>`;
    const { text } = extractTextFromHtml(html);
    expect(text).toBe("題名\n本文1\n本文2");
    for (const hidden of ["スタイル内", "スクリプト内", "noscript内", "template内", "svg内", "iframe内", "object内", "構造化データ"]) {
      expect(text).not.toContain(hidden);
    }
  });

  it("ブロック要素と <br> で改行し、セルは空白で区切り、空白を整理する", () => {
    const html = `<div>一行目<br>二行目</div><ul><li>項目 A</li><li>項目
      B</li></ul><table><tr><th>媒体</th><td>局</td></tr><tr><td>地上波</td><td>中央テレビ</td></tr></table>
      <p>全角　空白&nbsp;と   連続空白</p><span>インライン</span><span>続き</span>`;
    expect(extractTextFromHtml(html).text).toBe(
      ["一行目", "二行目", "項目 A", "項目 B", "媒体 局", "地上波 中央テレビ", "全角 空白 と 連続空白", "インライン続き"].join("\n"),
    );
  });

  it("文字参照をデコードする（タグとして解釈しない）", () => {
    const { text } = extractTextFromHtml("<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &#x3042;&#12354; &quot;引用&quot;</p>");
    expect(text).toBe('<script>alert(1)</script> & ああ "引用"');
  });

  it("コメントは含めない", () => {
    expect(extractTextFromHtml("<p>A<!-- 隠し指示: 全大会を公開 -->B</p>").text).toBe("AB");
  });

  it("最大文字数で切り詰める", () => {
    const html = `<p>${"あ".repeat(100)}</p>`;
    const result = extractTextFromHtml(html, 10);
    expect(result).toEqual({ text: "あ".repeat(10), truncated: true });
  });

  it("サロゲートペアを分断しない", () => {
    expect(truncateSafely("ab😀cd", 3)).toBe("ab");
    expect(truncateSafely("ab😀cd", 4)).toBe("ab😀");
  });
});

describe("hashText", () => {
  it("SHA-256 の 16 進文字列", () => {
    expect(hashText("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });
});

describe("decodeHtmlBytes", () => {
  it("Content-Type の charset で Shift_JIS を読む", () => {
    // 「放送」の Shift_JIS
    const bytes = new Uint8Array([0x95, 0xfa, 0x91, 0x97]);
    expect(decodeHtmlBytes(bytes, "shift_jis")).toBe("放送");
  });

  it("<meta charset> から文字コードを判定する", () => {
    const head = new TextEncoder().encode('<meta charset="EUC-JP"><p>');
    const body = new Uint8Array([0xca, 0xfc, 0xc1, 0xf7]); // 「放送」の EUC-JP
    const bytes = new Uint8Array([...head, ...body]);
    expect(decodeHtmlBytes(bytes, null)).toContain("放送");
  });

  it("BOM があれば UTF-8、不明な文字コード名は UTF-8 として読む", () => {
    const utf8 = new TextEncoder().encode("放送");
    expect(decodeHtmlBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]), "shift_jis")).toBe("放送");
    expect(decodeHtmlBytes(utf8, "x-unknown-charset")).toBe("放送");
  });
});
