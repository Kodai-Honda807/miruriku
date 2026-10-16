# ロゴ・アイコンの元データ

- `icon.svg` … 大きいサイズ用（ホーム画面・OGP 画像）。陸上トラックと再生マーク
- `icon-small.svg` … 16〜48px 用（ファビコン。線を太くし、内側のレーンを省略）
- `render.mjs` … Playwright で PNG を書き出すスクリプト（/tmp/brand に出力）

書き出し先: `src/app/favicon.ico`（16/32/48px）、`src/app/icon.svg`（= icon-small.svg）、`src/app/apple-icon.png`（180px）、`public/icon-192.png`、`public/icon-512.png`、`public/opengraph-image.png`（1200×630）。
色はサイトのテーマ色 `#1f3f87` と、アクセントの `#ffc94d`。
