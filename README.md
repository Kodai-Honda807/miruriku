# みる陸（miruriku）

> **次のレース、いつ・どこで見られる？**

駅伝・マラソン・トラック競技の開催日程と、日本から視聴できるテレビ放送・ネット配信の情報を 1 か所にまとめる Web アプリです。目指しているのは、すべての大会を網羅することではありません。**「いつ・どこで見られるか」を一画面で判断できること**を何より大切にしています。

- 対象: 駅伝・マラソン・トラック（陸上競技）
- 時刻は日本時間で表示します。海外の大会では現地の日時も併記します。
- 「情報が見つからない」と「公式に放送・配信なし」は別の状態として区別して表示します。
- 公開サイトは静的ファイルとして書き出し、S3 + CloudFront で配信しています（https://miruriku.com/ 。[docs/deploy.md](docs/deploy.md)）。DB と管理画面はローカル専用です。
- 実在の直近大会（駅伝・マラソン 6 件、2026-10-16 確認）を `data/real-events.ts` に登録しています。登録・更新の方法とルールは [docs/real-data.md](docs/real-data.md) を参照してください。

設計の詳細は [docs/design.md](docs/design.md) にあります。

## 主な画面

| パス | 内容 |
| --- | --- |
| `/` | 大会の一覧（時系列）。期間（今日／今週／この先）・競技・視聴方法・無料ネット配信・大会名検索で絞り込めます。絞り込み条件は URL のクエリに保持されるので、そのまま共有できます。 |
| `/events/[slug]/` | 大会の詳細。放送・配信枠、開催日程、情報源、確認日時を表示します。ビルド時に公開中の大会の数だけ書き出し、それ以外は HTTP 404 です。 |
| `/admin` | ローカル専用の管理画面（開発サーバーだけ）。既定では無効です（[管理機能の有効化](#管理機能の有効化ローカル専用)を参照）。 |
| `/api/health` | 開発サーバーの起動確認用（DB には接続しません。静的ビルドには含めません）。 |

公開ページのデータは、ビルド時に `data/real-events.ts` から作ります（DB には接続しません）。一覧の絞り込みと「今日」「開催中」などの判定は、ブラウザで現在時刻を使って行います。

管理画面（有効時のみ）:

| パス | 内容 |
| --- | --- |
| `/admin` | ダッシュボード（大会数、未レビュー候補数、最新の収集実行） |
| `/admin/events`、`/admin/events/new`、`/admin/events/[id]` | 大会の一覧（下書きを含む）・作成・編集、公開／下書きの切り替え、セッションの追加・削除 |
| `/admin/events/[id]/slots/new`、`…/slots/[slotId]` | 放送・配信枠の追加・編集・削除 |
| `/admin/events/[id]/sources/new`、`…/sources/[sourceId]` | 情報源（出典 URL）の登録・編集・削除、収集の許可 |
| `/admin/candidates`、`/admin/candidates/[id]` | 収集候補の一覧と、現在のデータとの差分・承認・却下 |
| `/admin/runs` | 収集実行の履歴（エラーコードを含む） |

## 必要な環境

| ツール | バージョン |
| --- | --- |
| Node.js | 24 LTS（`>=24.13.0 <25`。`.nvmrc` は `24`） |
| pnpm | 12.10.1（`package.json` の `packageManager` に従い corepack が取得します） |
| Docker / Docker Compose | PostgreSQL 18.6 をコンテナで起動するために使います |

主なライブラリ: Next.js 16.4（App Router、Cache Components）、React 19.3、TypeScript 5.9、Tailwind CSS 4.3、shadcn/ui、Prisma 7.10（`@prisma/adapter-pg`）、Zod 4.6、Vitest 4.1、Playwright 1.64。

## 初回セットアップ

```bash
git clone <このリポジトリ> miruriku
cd miruriku

corepack enable              # pnpm を packageManager の版で使えるようにする
pnpm install                 # postinstall で prisma generate も実行されます
cp .env.example .env         # 必要に応じて値を変更

pnpm db:up                   # PostgreSQL を起動（docker compose）
pnpm db:deploy               # マイグレーションを適用
pnpm db:seed                 # 架空のデモデータを投入
pnpm dev                     # http://localhost:3000
```

DB の起動・マイグレーション・seed は `pnpm setup` でまとめて実行することもできます。

## DB（PostgreSQL）

```bash
pnpm db:up      # 起動（ヘルスチェックが通るまで待ちます）
pnpm db:down    # 停止（データはボリューム db-data に残ります）
```

- 接続先は既定で `127.0.0.1:5432` です。ポートが競合する場合は、環境変数 `POSTGRES_PORT` で変更し、`.env` の接続文字列もそれに合わせてください。
- 初回起動時に、開発用の `miruriku` に加えて、テスト用の `miruriku_test`（DB 統合テスト用）と `miruriku_e2e`（E2E 用）も作成されます（`docker/postgres/init`）。
  - この初期化スクリプトは、ボリュームが空のときにしか実行されません。テスト用 DB がない場合は、次のコマンドで作成してください。
    `docker compose exec db createdb -U miruriku miruriku_test`

## 実際の観戦に使う（実在の大会データ）

```bash
pnpm db:deploy                  # マイグレーションを適用
pnpm data:load --remove-demo    # 実在の大会を登録し、架空のデモ大会を削除
pnpm dev                        # http://localhost:3000
```

- `pnpm data:load` は `data/real-events.ts` の内容を DB に反映します。何度実行しても重複せず、`--remove-demo` を付けなければデモ大会には触れません。`--check` は定義の検証だけを行います。
- 一覧の各放送・配信枠に、出典（リンク）と確認日時を表示します。視聴ページは公式に掲載されている URL がある枠だけに表示します。
- 掲載内容は確認日時の時点のものです。観戦前に出典リンクから最新の公式情報を確かめてください。
- 実際の観戦用の DB で `pnpm db:seed` を実行すると、デモ大会が戻ります。

## マイグレーションと seed

```bash
pnpm db:deploy                          # 未適用のマイグレーションを適用（prisma migrate deploy）
pnpm db:seed                            # デモデータを投入
SEED_BASE_DATE=2026-10-10 pnpm db:seed  # 基準日を固定して投入（既定は日本時間の今日）
```

- デモデータの日付は、基準日からの相対日付で作られます。いつ seed しても「今日」「今週」の表示を確認できます。
- seed は**何度実行しても重複しません**（固定の ID で upsert します）。
- 再実行すると、**デモ大会（`isDemo=true`）は定義どおりの状態に初期化されます**。管理画面での編集、承認で増えた枠、収集候補、収集履歴も消えます。デモ以外のデータには触れません。
- `NODE_ENV=production` では seed は実行されません。
- スキーマを変更したときは `pnpm db:migrate`（`prisma migrate dev`）を使います。`pnpm db:reset` は**開発用 DB のデータをすべて消します**。

## Web アプリの起動

```bash
pnpm dev                    # 開発サーバー（http://localhost:3000）。公開ページ・管理画面
pnpm build && pnpm preview  # 静的書き出し（out/）を本番と同じ URL 処理で確認（http://localhost:3000）
```

- 公開ページは、開発サーバーでも静的ビルドでも `data/real-events.ts` の内容を表示します（DB のデモデータは表示しません）。
- `pnpm build` は静的書き出し（`output: "export"`）です。DB は必要ありません。管理画面（`*.dynamic.tsx`）は含まれません。
- `pnpm preview` は `scripts/serve-static.mjs` で `out/` を配信します。URL の書き換え・転送は本番の CloudFront Functions（`deploy/static/viewer-request.js`）と同じコードです。

## テスト

```bash
pnpm lint         # ESLint
pnpm typecheck    # next typegen + tsc --noEmit
pnpm test         # 単体テスト（unit: *.test.ts）と UI テスト（ui: *.test.tsx）
pnpm test:db      # DB 統合テスト（*.db.test.ts）。TEST_DATABASE_URL の DB を使います
pnpm build        # 静的書き出し（DB 不要）

# E2E（初回のみブラウザを導入）
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

- テストは実行環境のタイムゾーンに依存しないよう、`TZ=America/Los_Angeles` で実行されます。時刻は固定値（または引数の `now`）を使います。
- `pnpm test:db` は、`TEST_DATABASE_URL` の**データベース名が `_test` で終わる場合だけ**動きます（開発用 DB を誤って消さないため）。開始時にマイグレーションを適用し、テーブルを空にします。
- `pnpm test:e2e` は、まず `e2e/prepare.ts` で `E2E_DATABASE_URL` の DB（名前が `_e2e` で終わるもの）を初期化し、基準日 2026-10-10 で固定したデモデータと、固定ファイルによる収集候補を用意します。続けて DB の公開中の大会を JSON に書き出し、それを使って公開サイトを静的ビルドします（`.e2e/out`。時計は `NEXT_PUBLIC_MIRURIKU_FIXED_NOW=2026-10-10T12:00:00+09:00` で固定）。
- 公開ページのテストは、静的ビルドを本番と同じ URL 処理の静的サーバー（ポート 3100）で、管理画面のテストは開発サーバー（ポート 3101、出力先 `.next-e2e`、`MIRURIKU_FIXED_NOW` で時計を固定）で実行します（`pnpm dev` と同時に動かせます）。
- テストだけを直して繰り返すときは `E2E_SKIP_BUILD=1 pnpm test:e2e` で静的ビルドを省けます。開発サーバーとブラウザで合計 3GB ほどのメモリを使います。
- `playwright install --with-deps` には管理者権限が必要です。権限がない環境では、Chromium が必要とする共有ライブラリ（`libnss3` など）を別途用意してください。

### CI（GitHub Actions）

`.github/workflows/ci.yml` は、push と pull request のたびに次のジョブを実行します。シークレットは使いません。権限も `contents: read` だけです。

| ジョブ | 内容 |
| --- | --- |
| `check` | `pnpm lint` / `pnpm typecheck` / `pnpm test` |
| `db-test` | PostgreSQL 18.6 の service コンテナを使った `pnpm test:db` |
| `build` | `DATABASE_URL` を設定しない状態で `pnpm build`（静的書き出し）。管理画面が含まれないことと sitemap.xml を確認 |
| `e2e` | PostgreSQL の service コンテナと Chromium で `pnpm test:e2e`。失敗したときはレポートをアーティファクトとして保存 |

## 収集 CLI

登録済みで `collectEnabled` が有効な情報源（Source）だけを対象に、放送・配信情報を取得・抽出します。抽出結果は**収集候補（未レビュー）として保存されるだけ**です。人が承認するまで DB は変わりません。公開サイトは `data/real-events.ts` から作るため、承認しても変わりません（変化を見つけたらファイルを直してデプロイします）。

```bash
pnpm collect --event <slug> [--fetch http|fixture] [--provider rule-based|fixture] [--dry-run]
pnpm collect --source <id> [オプション]
pnpm collect --all [--limit <n>] [オプション]
pnpm collect --help
```

| オプション | 意味 |
| --- | --- |
| `--event <slug>` / `--source <id>` / `--all` | 対象の大会・情報源（どれか 1 つを指定。`collectEnabled` のものだけ） |
| `--fetch http`（既定） | 実際に HTTP(S) で取得します。robots.txt を守り、1 件ずつ順番に取得します。失敗しても再試行しません |
| `--fetch fixture` | `fixtures/collector` の固定ファイルを読み込みます（デモ・テスト用。ネットワークに接続しません） |
| `--provider rule-based`（既定） | ルールベースで抽出します（API キーは不要） |
| `--provider fixture` | 固定データを抽出結果として使います（デモ・テスト用。実際の収集ではありません。`--fetch fixture` と組み合わせたときだけ使えます） |
| `--limit <n>` | `--all` のとき、1 回の実行で処理する情報源の数の上限 |
| `--dry-run` | 取得・抽出・差分の表示だけを行い、DB には書き込みません |

- `--limit` の既定値は 20、上限は 50 です。
- 失敗した情報源（または実行できなかった指定）が 1 件でもあると、終了コードは 1 になります。robots.txt などで取得しなかっただけの場合は 0 です。
- 結果は情報源ごとに日本語で表示されます（状態、作成した候補 ID、差分の要約）。固定ファイル・固定データの場合は、実際の収集ではないことを明示します。

HTTP 取得の安全対策:

- 許可するのは http/https と既定のポート（80/443）だけです。localhost・私的 IP・リンクローカル・クラウドのメタデータのアドレスを拒否し、DNS で解決したすべてのアドレスと、実際に接続するときのアドレスも検査します（DNS リバインディング対策）。
- リダイレクトは同じホスト（`www.` の有無の違いのみ許容）に限り、最大 3 回までです。https から http への格下げも拒否します。
- タイムアウトは 15 秒、ページの上限は 2MB です。受け付ける Content-Type は HTML だけです。
- robots.txt を守ります（UA トークン `mirurikuBot`）。同じホストへの間隔は Crawl-delay と 2 秒の大きいほうで、1 件ずつ順番に取得し、再試行はしません。
- プロキシは使いません。Cookie や認証ヘッダーは送らず、ログイン・課金・アクセス制限（401/403/429 など）を回避しようとはしません。
- User-Agent は `.env` の `COLLECTOR_USER_AGENT` で設定します（連絡先を含めてください）。
- **情報源の利用規約・転載可否・アクセス制限の確認は、情報源を登録して「収集を許可」（`collectEnabled`）にする人が行う運用です。** CLI は許可された情報源だけを取得します。
- 取得したページの内容は信頼できないデータとして扱い、ページ内の指示を命令として実行しません。抽出結果は Zod で厳しく検証します。
- LLM による抽出はインターフェースと注意点（`src/collector/providers/README.md`）だけを用意しており、今回は実装していません。

- ページから放送・配信や大会の情報を何も抽出できなかった場合は、候補を作りません（結果に「抽出結果なし」と表示します）。空の候補を承認すると、確認していないのに確認日時だけが更新されるためです。
- 確認済みの大会を、ある情報源の「未定」「決まり次第」という記述だけで「未発表」に戻す提案はしません。
- 局・サービス名の末尾の括弧書き（「TVer（ティーバー）」など）だけが違う枠は、同じ枠として照合します。

> [!NOTE]
> 2026-10-16 に、登録した実在の公式ページ 8 件に対して `--fetch http` を実行しました。すべて取得できましたが、ルールベース抽出で枠を取り出せたのは 2 件だけでした。結果の詳細は [docs/real-data.md](docs/real-data.md#収集-cli-を実在サイトで動かした結果2026-10-16) にあります。

### 固定ファイルを使った収集のデモ

```bash
# 1. 管理画面を有効にする（.env）: MIRURIKU_ADMIN_ENABLED="true"
pnpm db:seed && pnpm dev

# 2. 別のターミナルで、デモ大会「みる陸デモ市民マラソン」（放送情報が未確認）を収集する
pnpm collect --event demo-city-marathon --fetch fixture --dry-run   # 保存せずに結果を確認
pnpm collect --event demo-city-marathon --fetch fixture             # 収集候補として保存

# 3. http://localhost:3000/admin/candidates で差分を確認して承認する
# 4. トップページ（/）と大会詳細に、承認した放送・配信枠が表示される
```

デモ状態に戻すには、もう一度 `pnpm db:seed` を実行します。

## 管理機能の有効化（ローカル専用）

`.env` で次のように設定し、開発サーバーを起動し直します。

```bash
MIRURIKU_ADMIN_ENABLED="true"
```

- 管理機能が有効になるのは、`MIRURIKU_ADMIN_ENABLED` が文字列 `"true"` で、**かつ** `NODE_ENV` が `production` ではない場合だけです。`"TRUE"` や `"1"` では有効になりません。
- **管理画面は開発サーバー（`pnpm dev`）だけで動きます。** 静的ビルドには含まれず、本番には存在しません。開発サーバーでも、画面（layout・page）、すべての Server Action、proxy の各所で有効かどうかを判定しています。
- 承認や編集は**ローカルの DB にだけ**反映されます。公開サイトに載せるには、出典を確かめて `data/real-events.ts` を直し、デプロイします（[docs/real-data.md](docs/real-data.md)）。
- 管理画面では、大会・放送枠・情報源の作成と編集、下書きと公開の切り替え、収集候補の一覧・差分の確認・承認・却下ができます。

> [!IMPORTANT]
> **公開運用の前に、管理者の認証・認可を実装する必要があります。** 現在の管理機能には、ログインも権限管理もありません。ローカルで開発するときだけ使ってください。

## デモデータについて

- **すべて架空のデータです。** 大会名・会場・放送局・配信サービスは、実在するものとは関係ありません。
- 画面にも、デモデータであることが表示されます。
- URL は IANA の予約ドメイン（`example.com` / `example.org`）だけを使っています。実在するように見える視聴 URL は作っていません。
- 実在する大会の未検証の情報を、確定情報として載せることはしません。
- 地上波のみ・YouTube 無料ライブ・地上波とネットの併用・BS のみ・地域限定の地上波・有料ネット配信・未確認・開始時刻不明・複数日開催・海外開催（日本時間で日付が変わる）・複数枠・公式に配信なし・過去大会の参考情報・下書きの例を含みます。

## AWS（S3 + CloudFront）へのデプロイ

WSL から 1 コマンドで、静的ビルド・AWS リソースの作成（初回のみ、確認あり）・アップロード・確認・DNS の切り替え（初回のみ、確認あり）まで行います。費用は月 0.1〜0.4 USD ほどの見込みです。手順は [docs/deploy.md](docs/deploy.md) を参照してください。

```bash
cp deploy/.env.example deploy/.env   # AWS プロファイルとドメイン（DOMAIN）を設定
./deploy/static/deploy.sh            # コミット済みの HEAD を静的ビルドしてデプロイ
```

## 管理画面を公開する前に必要な作業

管理画面や収集を本番で動かす場合は、最低限、次の作業が必要です。

1. **管理者の認証・認可の設計と実装**（方式・権限・監査ログ）。これが終わるまで、管理画面を公開しないでください。
2. 情報源ごとの利用規約・robots.txt・著作権の確認と、取得頻度のルール作り
3. DB とサーバー（または定期実行の仕組み）の用意、監視・バックアップ。将来構成の概要は [docs/design.md](docs/design.md#4-将来の-aws-構成概要今回は-iac-なし) にあります

## 既知の制約

- 管理者の認証・認可はありません（ローカル専用）。
- 収集は手動で実行するだけです。定期実行の仕組みはありません。LLM による抽出は実装していません。
- 実在の大会は少数（駅伝・マラソン 6 件）を人が確認して登録しているだけです。直近のトラック競技は登録していません。自動で大会を見つけて追加する仕組みはありません。
- 実在の公式ページの多くは番組表形式（放送日・番組名・地域が別の行）やロゴ画像で局名を示すため、ルールベース抽出ではほとんど取り出せません。JavaScript で描画されるページ（例: テレビ朝日の全日本大学駅伝サイト）は本文を取得できません。
- 表示は日本時間・日本語だけに対応しています。
- 日本からの視聴可否は、情報源の記載に頼っています。地域制限などを自動で判定することはしません。
- pnpm 12 は、公開から 24 時間たっていない依存（`minimumReleaseAge`）を含む lockfile をクリーンな環境にインストールしようとすると失敗します。依存を更新した直後は CI やデプロイのビルドが失敗することがあります（このため dotenv は 18.0.6 に固定しています）。
- 一覧は、公開中の大会をすべてページに埋め込み、ブラウザで絞り込みます（ページ送りなし）。データが少ない前提の作りです。
- 公開サイトはビルドした時点のデータです。データを直したら再デプロイが必要です。
- JavaScript が無効だと、一覧はビルド時点の「これから開催される大会」を表示し、絞り込みはできません（その旨を表示します）。大会詳細は JavaScript なしでも読めます。
- 管理画面で存在しないレコードを開いた場合は、「見つかりません」画面を表示しますが HTTP ステータスは 200 です。
- ルールベース抽出は「1 行に 1 枠」の書式だけを解析します。表形式や、局名と日時が別の行にあるページ、JavaScript で描画されるページは扱えません。抽出しなかった情報は人が補う前提です。
- 管理画面では大会・シリーズを削除できません。放送枠のフォームでは、24 時間を超える放送や、開始時刻なしで終了時刻だけがある枠を表せません。
- 表示はライトモードのみです。
- ESLint は 9 系（EOL 表示あり）です。eslint-config-next 同梱のプラグインが ESLint 10 に対応したら更新します。Prisma 8 は RC のため、安定版の 7.10 を使っています。
