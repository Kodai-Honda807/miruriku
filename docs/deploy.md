# AWS（S3 + CloudFront）へのデプロイ

公開サイトは静的ファイル（HTML・JS・CSS）として書き出し、非公開の S3 バケットに置いて CloudFront で配信します。
WSL（Ubuntu）から 1 コマンドでビルド・AWS リソースの作成・アップロード・確認まで行います。

```
利用者 ─ HTTPS ─ CloudFront（miruriku.com / www.miruriku.com、ACM 証明書）
                  ├ CloudFront Functions … /events/<slug>/ → index.html、末尾 / の付与、www → www なしへ転送
                  └ S3 バケット（非公開。CloudFront からだけ読める）
                       └ pnpm build の出力（out/）
```

- 公開データは `data/real-events.ts`（実在の大会の正本）からビルド時に作ります。本番に DB はありません（[docs/real-data.md](real-data.md)）。
- 管理画面は静的ビルドに含まれません（`/admin` は 404）。収集候補のレビューや DB を使う作業は、ローカルの開発サーバーで行います。
- サーバーがないため、OS やコンテナの保守、SSH の許可、DB のバックアップは不要です。
- データを直したら、再ビルドしてデプロイするまで公開サイトには反映されません。

## 費用の目安

| 想定 | 月間ページビュー | 月額 |
| --- | --- | --- |
| 数人が毎日見る | 1,000 | 約 0.1 USD |
| 大会シーズンに増える | 10,000 | 約 0.4 USD |
| ボットや拡散で急増 | 100,000 | 約 3.6 USD |

- 無料枠を除いた従量課金の試算です（CloudFront の日本向け転送 0.114 USD/GB・HTTPS リクエスト 0.012 USD/1 万件、S3 の保存・リクエスト、キャッシュ削除 月 1,000 パスまで 0 USD。[CloudFront の価格表](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudFront/current/index.json)、[S3 の価格表](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-northeast-1/index.json)、2026-10 時点）。
- ACM の証明書は無料です。Route 53 のホストゾーン（月 0.5 USD）とドメインの登録料は別にかかります。
- アクセス数に比例して増えるため、AWS Budgets で月 3 USD などのアラートを設定しておくと安心です。

## 事前準備（WSL）

1. リポジトリは WSL のファイルシステム（例 `~/miruriku`）に clone します。
2. 必要なコマンド: `aws`（AWS CLI v2）、`git`、`curl`、`tar`、Node.js（`.nvmrc` の 24）、pnpm（`corepack enable`）。
3. AWS の認証情報を名前付きプロファイルとして設定します（例: `aws configure sso --profile miruriku`）。必要な権限は [deploy/iam-policy.json](../deploy/iam-policy.json) の `MirurikuStaticHosting` と `MirurikuRoute53` です。
4. `deploy/.env` を用意します（`cp deploy/.env.example deploy/.env`）。使うのは `AWS_PROFILE` と `DOMAIN`（例 `DOMAIN="miruriku.com"`）です。
5. ドメインを Route 53 で登録しておきます（登録時に作られるホストゾーンをそのまま使います）。

## デプロイ

```bash
aws sso login --profile miruriku   # SSO の場合。セッションが切れていたら
./deploy/static/deploy.sh
```

1. コミット済みの HEAD を一時ディレクトリに展開し、手元の `.env` や環境変数を使わずに `pnpm build` します（サイト URL は `https://<DOMAIN>`）。
2. CloudFormation スタック `miruriku-static`（us-east-1）を作成・更新します。初回は作成する内容と費用の目安を表示し、`yes` の入力を求めます。証明書の発行と CloudFront の配置で 5〜15 分ほどかかります。
3. S3 にアップロードし、CloudFront のキャッシュを削除します。
4. `https://<ID>.cloudfront.net/` でトップ・大会詳細・404・転送を確認します。
5. DNS がまだ CloudFront を向いていなければ、切り替えの内容を表示して `yes` の入力を求めます（`./deploy/static/switch-dns.sh`）。

2 回目以降は、`data/real-events.ts` やコードを直してコミットしたあとに同じコマンドを実行するだけです（確認なしで更新し、DNS の切り替えは行いません）。未コミットの変更はデプロイされません（`--allow-dirty` で警告のうえ HEAD をデプロイ）。

### キャッシュ

| 対象 | Cache-Control | 理由 |
| --- | --- | --- |
| `/_next/static/*`（ファイル名にハッシュが入る） | `public, max-age=31536000, immutable` | 内容が変わると名前が変わる。古いファイルも消さない（デプロイ直前に開いたページが読み込めるように） |
| それ以外（HTML、RSC のデータ、sitemap.xml など） | `public, max-age=0, s-maxage=31536000, must-revalidate` | CloudFront に置き、デプロイのたびに `/*` を削除する。ブラウザは毎回確認する |

絞り込みの URL（`/?period=week` など）はクエリをキャッシュキーに含めず、同じ HTML を返します（絞り込みはブラウザで行います）。

### DNS を戻す

```bash
./deploy/static/switch-dns.sh --rollback   # Lightsail の静的 IP に戻す（Lightsail を削除するまで）
```

## Lightsail（以前の構成）の撤去

静的配信に切り替えて問題がないことを確認したら、Lightsail のインスタンスを削除して月 12 USD ほどの課金を止めます。**削除は元に戻せません。** 実行前に確認してください。

```bash
./deploy/ops.sh backup   # 念のため DB のダンプを deploy/backups/ に保存（承認済みの候補などを残したい場合）
./deploy/destroy.sh      # インスタンス・静的 IP・SSH 鍵の登録を削除（インスタンス名の入力を求めます）
```

- 削除すると、以前の URL（`https://13-115-193-47.sslip.io/`）は使えなくなります。
- 撤去が終わったら、`deploy/lib.sh`・`deploy/ops.sh`・`deploy/destroy.sh` の Lightsail 用の部分と、`deploy/.env` の Lightsail・SSH の設定は削除して構いません。

## 検索エンジン向けの設定（SEO）

- サイト URL（`MIRURIKU_SITE_URL=https://<DOMAIN>`）はデプロイ時に設定してビルドします。canonical・OGP・`sitemap.xml`・`robots.txt` はビルド時に作られます。
- URL は末尾にスラッシュを付けた形（`/events/<slug>/`）です。スラッシュなしの URL は 301 で転送します。
- 出しているもの: ページごとのタイトルと説明文、canonical（絞り込み条件付きの URL は `/` にまとめる）、OGP / X カード、`robots.txt`、`sitemap.xml`（公開中の実在の大会）、大会詳細の構造化データ（schema.org `SportsEvent`）、トップの `WebSite`、アイコン一式とマニフェスト。
- 公開後に行うこと（任意）: [Google Search Console](https://search.google.com/search-console) に「ドメイン」プロパティを追加して DNS の TXT レコードで所有権を確認し、`https://<DOMAIN>/sitemap.xml` を送信します。

## アクセス解析（Google アナリティクス）

- 測定 ID `G-81X7PN4D1S` の GA4 タグを、本番ビルドのときだけ読み込みます（`src/components/site/analytics.tsx`）。開発サーバー・テスト・E2E では読み込みません。
- 絞り込みの変更や詳細ページへの移動は、GA4 の「拡張計測機能」の「ブラウザの履歴イベントに基づくページの変更」（既定で有効）でページビューになります。

## うまくいかないとき

- 初回の作成で失敗した（スタックが `ROLLBACK_COMPLETE`）: CloudFormation コンソール（バージニア北部 us-east-1）の「イベント」で原因を確認し、スタックを削除してから再実行します。バケットは削除されずに残る設定です（中身がなければ S3 コンソールで削除できます）。
- 証明書の発行で止まっている: ホストゾーンに検証用の CNAME レコードが作られているか、ドメインのネームサーバーがホストゾーンと一致しているかを確認します。
- 表示が更新されない: デプロイの最後にキャッシュを削除しています。ブラウザを再読み込みしても古い場合は、デプロイが完了しているか（`deploy.sh` の最後の表示）を確認してください。

## 注意点・未対応のこと

- 認証のない管理画面は公開しません（静的ビルドには含まれません）。
- 公開した URL は誰でも開けます。
- 収集 CLI の定期実行は設定していません。ローカルで `pnpm collect --all --dry-run` を実行して公式ページの変化を確かめます（[docs/real-data.md](real-data.md)）。
- JavaScript が無効な場合、一覧はビルド時点の「これから開催される大会」を表示し、絞り込みはできません（その旨を表示します）。
- 「開催中」「終了」などの表示はブラウザの時計で判定します。端末の時計が大きくずれていると表示もずれます。
