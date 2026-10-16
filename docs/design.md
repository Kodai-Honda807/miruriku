# みる陸 設計メモ

「次のレース、いつ・どこで見られる？」— 駅伝・マラソン・トラック競技の開催日程と、日本から視聴できるテレビ放送・ネット配信の情報をまとめる Web アプリの設計メモです。最も大事な価値は、すべての大会を載せることではありません。**「いつ・どこで見られるか」を一画面で判断できること**です。

この文書は最初の MVP（ローカルで動かす版）の時点の設計です。

---

## 1. データモデル

定義元は `prisma/schema.prisma` です。列挙値の日本語ラベルは `src/domain/labels.ts` にあります。

### 1.1 モデルと責務

| モデル | 責務 |
| --- | --- |
| `EventSeries` | 大会シリーズ（例: ○○駅伝）。年度をまたいで共通の名前と公式 URL を持つ。 |
| `Event` | 年度・開催回ごとの大会。開催日程・開催地・タイムゾーン・公開状態を持つ。**大会全体の放送情報状態**（`broadcastInfoStatus`）と、人が確認した日時（`broadcastCheckedAt`）もここに置く。 |
| `EventSession` | 複数日開催や種目ごとの開始時刻（例: 「2 日目 男女 100m 決勝」）。 |
| `BroadcastSlot` | 放送・配信の枠。**大会 1 : 枠 N**。媒体、局・サービス名、日時、料金、視聴形態、視聴できる地域、視聴 URL・案内 URL、検証状態、公開状態を持つ。 |
| `Source` | 情報源（大会公式・放送案内など）。収集 CLI が取得してよいのは `collectEnabled=true` の情報源だけ。 |
| `CollectionRun` | 収集の実行履歴（1 回の実行で 1 情報源）。HTTP ステータス、最終 URL、サイズ、ハッシュ、エラーコードを記録する。 |
| `ExtractionCandidate` | 抽出候補。検証済みの抽出結果（`payload`）と、作成時点の差分（`diff`）を保存する。**人が承認するまで公開データには反映しない。** |

### 1.2 日時の表現

- **日付だけ分かっている状態**と**確定した瞬間**を区別します。
  - `Event.startDate` / `endDate` / `EventSession.date` は `@db.Date` 型で、**開催地の現地日付**を表します。
  - `Event.startAt` / `EventSession.startAt` は `timestamptz`（UTC で保存）です。開始時刻が判明している場合だけ値を入れます。
  - 開始時刻が分からないときに、0:00 のような仮の時刻を入れたり表示したりしません。画面には「開始時刻未確認」と出します。
- **開催地のタイムゾーン**は `Event.timezone` に IANA 名（例: `Asia/Tokyo`, `Europe/Zurich`）で持ちます。夏時間の切り替えも正しく扱えます。
- **放送時刻と競技時刻は別の値**です。
  - 放送時刻: `BroadcastSlot.startAt` / `endAt`（瞬間）と `airDate`（日本時間の放送日。時刻が未定でも日付だけ分かる場合に使う）
  - 競技時刻: `Event.startAt` / `EventSession.startAt`
- **複数日開催**は `startDate` ≠ `endDate` で表します。日ごと・種目ごとの時刻は `EventSession` に持たせます。
- 一覧の表示と絞り込みは**日本時間**を基準にします（`src/domain/event-timing.ts`, `src/domain/filters.ts`）。
  - 海外大会で開始時刻が分かっている場合: 日本時間の日時を主に表示し、現地日時を補足します（例: 「10月18日（日）3:00 / 現地 10月17日（土）20:00」）。
  - 海外大会で開始時刻が分からない場合: 日本時間の日付を確定できないため、**現地日付**として表示します。期間の絞り込みでは、日本時間で 2 日にまたがる可能性を考えて判定します。
- `@db.Date` の値は Prisma では UTC 0 時の `Date` になります。変換するときは必ず `dbDateToLocalDate` / `localDateToDbDate` を通します。

### 1.3 放送情報の状態（大会全体）・枠の検証状態・公開状態

この 3 つは別の軸です。

**大会全体の放送情報状態**（`Event.broadcastInfoStatus`）

| 値 | 意味 |
| --- | --- |
| `CONFIRMED` | 公式発表で放送・配信予定を確認した |
| `NOT_ANNOUNCED` | 公式の放送・配信情報が**まだ発表されていない**ことを確認した |
| `UNVERIFIED` | 調査したが確認できていない（初期値） |
| `NO_BROADCAST` | 主催者などが**公式に「放送・配信なし」と案内している** |
| `PAST_REFERENCE` | 今年の情報は確認できていない。過去大会の参考情報だけがある |

- **見つからないことは「配信なし」ではありません。** 情報が見つからない場合は `UNVERIFIED` のままにします。`NO_BROADCAST` にするのは公式の案内があるときだけです。画面でも両者を別の文言で表示し、`UNVERIFIED` には「放送・配信がないという意味ではありません」と添えます。
- **前年の情報を今年の確定情報として扱いません。** 過去大会の枠は `verificationStatus=PAST_REFERENCE` として保存します。画面では「過去大会の参考情報」と明示し、視聴方法・無料ネット配信の絞り込みの対象から外します。
- 収集候補で放送状態が判断できない場合（`UNKNOWN`）は、既存の状態を変えません（`src/domain/diff.ts`）。ただし候補に放送・配信枠が含まれる場合は「公式発表を確認済み」を提案します（承認するのは情報源を確認した人です）。
- 差分の照合では、過去大会の参考情報（`PAST_REFERENCE`）の枠を今年の候補と照合しません。今年の情報は別の枠として追加され、参考枠は書き換わりません。
- 局・サービス名の違いが表記ゆれ（全角・半角、空白）だけの場合は変更として扱わず、人が入力した名称を残します。

**枠の検証状態**（`BroadcastSlot.verificationStatus`）: `CONFIRMED`（公式情報で確認済み）/ `UNVERIFIED`（未確認）/ `PAST_REFERENCE`（過去大会の参考情報）

**公開状態**（`Event.status` / `BroadcastSlot.status`）: `DRAFT` / `PUBLISHED`。公開ページには、公開中の大会の公開中の枠だけを表示します。

### 1.4 取得日時と確認日時

- 機械的な取得日時: `Source.lastFetchedAt`, `CollectionRun.startedAt` / `finishedAt`
- 人が確認した日時: `Event.broadcastCheckedAt`, `BroadcastSlot.verifiedAt`

公開ページに「確認日時」として表示するのは、**人が確認した日時だけ**です。収集を実行しただけでは確認日時は更新しません。

### 1.5 承認を二重に処理しない仕組み

- 承認と却下は、1 つのトランザクションの中で `reviewStatus = PENDING` を条件にした更新で行います（条件付きの `updateMany` が 1 件更新できた場合だけ処理を続ける）。こうすると、同じ候補を同時に承認しても処理されるのは 1 回だけです。
- 承認で作る放送枠には `originCandidateId` と `originItemKey`（候補の中で枠を識別するキー）を記録し、この組み合わせに一意制約（`@@unique([originCandidateId, originItemKey])`）を付けています。万一処理が重なっても、同じ枠は 2 つできません。
- 差分は候補を作った時点のスナップショットとして保存します。レビュー画面の表示と承認のときには、最新の大会情報で計算し直します。
- 同じ大会の別の候補を同時に承認しても枠が重複しないよう、承認処理は候補を更新した直後に大会の行（`broadcastCheckedAt`）を更新して行ロックを取り、そのあとで差分を計算し直します（`src/server/review/review-service.ts`）。
- 承認時に設定する値:

| 対象 | 設定する値 |
| --- | --- |
| 候補 | `reviewStatus=APPROVED`、`reviewedAt=now`、`reviewNote` |
| 大会 | 差分のある項目（日程・競技開始・会場・放送情報状態）、`broadcastCheckedAt=now`。**公開状態（`status`）は変えない**（下書きの大会は下書きのまま） |
| 追加する枠 | `status=PUBLISHED`、`verificationStatus=CONFIRMED`、`verifiedAt=now`、`sourceId`=候補の情報源、`originCandidateId` / `originItemKey` |
| 更新する枠・変更のない枠 | 差分のある項目、`status=PUBLISHED`、`verificationStatus=CONFIRMED`、`verifiedAt=now`（`sourceId` は変えない） |
| 候補に含まれない既存の枠 | 変更しない（削除もしない） |

---

## 2. 情報収集・レビュー・公開の流れ

1. **情報源の登録**: 管理画面で大会に情報源（URL）を登録します。収集してよいことを確認した情報源だけ、`collectEnabled` を明示的に有効にします。
2. **収集の実行**: `pnpm collect --event <slug> | --source <id> | --all` で実行します。対象は登録済みで `collectEnabled` の情報源だけです。任意の URL は受け付けません。
3. **取得**:
   - `--fetch http` の場合は、robots.txt を守って取得します。1 件ずつ順番に取得し、失敗しても再試行しません。
   - `--fetch fixture` の場合は、リポジトリ内の固定ファイルを読み込みます（デモ・テスト用）。
4. **テキスト化**: HTML から本文のテキストだけを取り出し、スクリプトなどは捨てます（JavaScript は実行しません）。テキストの SHA-256 を `CollectionRun` と候補に記録し、同じ情報源・同じ抽出方法で内容が変わっていなければ、新しい候補を作りません。
5. **抽出**: 抽出プロバイダ（`rule-based` / `fixture`）が、構造化した抽出結果を返します。LLM プロバイダはインターフェースだけを用意しています（今回は実装しません）。
6. **検証・正規化**: `extractionResultSchema`（Zod、`strictObject`）で検証します。想定外のキー、http(s) 以外の URL、不正な日付・時刻、矛盾する指定（例: 放送なしなのに放送枠がある）、件数の上限超えは拒否します。そのうえで、放送時刻は日本時間、大会の時刻は開催地のタイムゾーンとして解釈し、UTC の瞬間に変換します（`src/domain/candidate.ts`）。
7. **差分計算と候補の保存**: 現在の大会情報との差分を計算し、`ExtractionCandidate`（`PENDING`）として保存します。候補で不明な値は既存の値を上書きしません。候補に含まれない既存の枠も削除しません。**この時点では公開データを一切変えません。**
8. **人によるレビューと公開**: 管理画面（`/admin/candidates`）で差分を確認し、承認または却下します。承認すると、トランザクションの中で大会と枠を更新・作成し、公開ページに反映されます。

### 安全対策

- **SSRF 対策**: 許可するのは http/https と既定のポートだけです。私的 IP・ループバック・リンクローカル・クラウドのメタデータのアドレスは拒否します。DNS で解決した後のアドレスも検査し（DNS リバインディング対策）、リダイレクト先も同じ基準で検証します。
- **取得の制限**: タイムアウト、レスポンスサイズの上限、許可する Content-Type を設けています。User-Agent には連絡先を入れます（`COLLECTOR_USER_AGENT`）。
- **取得先の制限**: リダイレクトは同じホスト（`www.` の有無の違いのみ許容）に限り、最大 3 回まで。https から http への格下げ、プロキシの利用、Cookie・認証ヘッダーの送信はしません。401/403/429 は回避を試みず失敗として記録します。robots.txt（UA トークン `mirurikuBot`）を守り、同じホストへの間隔は Crawl-delay と 2 秒の大きいほうです。
- **管理機能の多層防御**: `MIRURIKU_ADMIN_ENABLED="true"` かつ `NODE_ENV !== "production"` のときだけ有効です。layout・page・すべての Server Action・proxy.ts の各所で判定します（`src/server/admin-guard.ts`）。本番ビルドでは常に無効です。
- **出力の安全性**: 画面に出す外部リンクは `safeExternalHref` を通し、http(s) 以外はリンクにしません。エラーの詳細は管理画面にだけ表示します。

### 外部コンテンツを信頼しない方針

- 取得したページの内容はすべて**データとして**扱います。ページ内の文言を命令として解釈・実行することはありません（将来 LLM を使う場合も同じです）。
- 抽出結果はスキーマで厳しく検証し、想定外の項目は保存しません。
- 抽出結果を自動で公開することはありません。必ず人が承認します。

### 固定データ抽出であることを正直に表示する

- 抽出方法（`ExtractionProviderKind`）と取得方法（`FetchMode`）は候補ごとに記録し、管理画面に表示します。
- 固定データによる抽出には「固定データ（デモ・テスト用。実際の収集ではありません）」と表示します。AI による実際の収集と誤解されないようにするためです。

---

## 3. 技術選択

| 技術 | 採用バージョン | 理由・注意点 |
| --- | --- | --- |
| Node.js | 24 LTS（`>=24.13.0 <25`、`.nvmrc` = 24） | 現行の LTS。Docker イメージは `node:24.21.0-bookworm-slim` |
| pnpm | 12.10.1（`packageManager`、corepack で取得） | `allowBuilds` でビルドスクリプトを許可制にしている。既定の `minimumReleaseAge`（公開後 24 時間）を満たさない依存はクリーンな環境でのインストールに失敗する |
| Next.js | 16.4.0（App Router） | `cacheComponents` と `partialPrefetching` を有効にし、`output: "standalone"` で出力 |
| React | 19.3.0 | Next.js 16.4 に合わせる |
| TypeScript | 5.9.3（strict） | typescript-eslint 8.71 が TS 6.1 未満にしか対応していないため 7.x は使わない。create-next-app 16.4 の選定に合わせる |
| Tailwind CSS / shadcn/ui | 4.3 / radix-nova | 状態は色だけで伝えず、必ずテキストのラベルを付ける |
| Prisma | 7.10.0 ＋ `@prisma/adapter-pg` ＋ `pg` 8.23 | 安定版。npm の latest タグは 8.0.0-rc なので使わない。Web アプリはドライバーアダプター経由で接続するため、実行時にネイティブのクエリエンジンが要らない |
| PostgreSQL | 18.6（docker compose） | |
| Zod | 4.6.5 | 抽出結果・フォーム入力の検証 |
| Vitest | 4.1.11 | 5.0 は 9 月にリリースされたばかりなので、成熟した 4.1 系を使う。テストは `TZ=America/Los_Angeles` で実行し、マシンのタイムゾーンに依存しないことを確かめる |
| Playwright | 1.64.0 | E2E テスト |
| ESLint | 9.39.5 | v9 は EOL と表示されているが、eslint-config-next 16.4 に同梱の react / jsx-a11y / import プラグインが ESLint 10 に対応していないため v9 を使う |

### cacheComponents を使ううえでの注意

- **DB の読み取り結果はキャッシュしません。** `use cache` は付けず、`<Suspense>` の内側で、リクエストのたびに動的に実行します。放送情報の訂正をすぐ反映するためです。
- 現在時刻（`getNow()`）や DB アクセスは、`connection()` などでリクエスト時の処理にしたうえで `<Suspense>` の内側で使います。ビルド時に作る静的な部分（App Shell）に、日付やデータを含めないようにするためです。
- **ビルド時に DB は不要です。** Prisma Client は最初に呼び出されたときに作ります（`src/server/db.ts`）。CI でも `DATABASE_URL` を設定せずに `pnpm build` が通ることを確認します。
- `partialPrefetching` を有効にすると、リンクの先読みではルートごとの App Shell だけを取得します。URL ごとに変わるデータは、画面を移動した後に取得します。
- `use cache` / `cacheLife` は使っていません（DB の読み取り結果をキャッシュしないため）。
- 大会詳細は `<Suspense>` の内側で `notFound()` するため、その時点では 200 でストリーミングが始まっています（Next.js の仕様）。下書き・存在しない大会を HTTP 404 にするため、Proxy（Node.js ランタイム）で slug が公開中の大会かを軽く確認し、該当しなければ not-found ページに rewrite します（`src/proxy.ts`）。DB に接続できないときは判定せずにページ側のエラー表示に任せます。大会詳細へのリクエストごとに、一意インデックスを使うクエリが 1 回増えます。
- `/api/health` は DB に依存しない死活監視用のエンドポイントです（Docker の HEALTHCHECK と E2E の起動待ちで使用）。

---

## 4. 将来の AWS 構成（概要。今回は IaC なし）

```
利用者 ─ CloudFront ─ ALB ─ ECS Fargate（Web: runner イメージ）─ RDS for PostgreSQL
                  （静的アセット /_next/static をキャッシュ）
EventBridge Scheduler ─ ECS タスク（collector イメージ）─ RDS
CI/CD ─ ECS タスク（migrate イメージ、デプロイ前に 1 回だけ実行）─ RDS
Secrets Manager / SSM Parameter Store ─ 各タスクに環境変数として注入
CloudWatch Logs / メトリクス ─ 各タスクの標準出力
```

- **Web**: `Dockerfile` の `runner` ターゲット（Next.js standalone、非 root）を ECS Fargate で動かします。
  - 複数台で動かす場合は `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` をすべてのインスタンスで同じ値にし、`deploymentId` を設定してバージョンのずれを防ぎます。
  - ストリーミング（Suspense）を途中でバッファリングしない構成にします。
- **DB**: RDS for PostgreSQL。自動バックアップと保持期間を設定します。接続数が問題になれば RDS Proxy を検討します。
- **収集ジョブ**: 同じリポジトリの `collector` ターゲットを、EventBridge Scheduler から ECS タスクとして起動します。Web サーバーの中で定期処理は動かしません。
- **マイグレーション**: `migrate` ターゲット（`prisma migrate deploy`）を、デプロイ前に単発のタスクとして実行します。Web の起動時には実行しません。
- **イメージの大きさ**: `runner` は standalone 出力なので小さく済みます（約 400MB。そのうちベースイメージが約 330MB）。一方、`migrate` と `collector` は開発用の依存（Prisma CLI・tsx）を含むため大きくなります（約 1.6GB）。Fargate はタスクを起動するたびにイメージを取得するので、運用を始める前に軽量化を検討します。たとえば、収集 CLI を 1 つの JS ファイルにバンドルする、マイグレーション用の依存だけを持つ最小のパッケージを用意する、といった方法があります。
- **秘密情報**: `DATABASE_URL` などは Secrets Manager / SSM から実行時に注入します。イメージにもビルド時の環境変数にも含めません。
- **ログ・監視**: CloudWatch Logs に出力します。アラーム（5xx の増加、収集の失敗、DB の CPU や接続数）を設定します。
- **静的配信**: CloudFront で `/_next/static` などをキャッシュします。動的な HTML はキャッシュしません。
- **ファイルの保存**: コンテナのローカルファイルへの永続保存を前提にしていません（`.next` 配下はキャッシュとして使うだけです）。
- **管理機能**: 本番イメージでは常に無効です。公開運用の前に、管理者の認証・認可を別途設計して実装する必要があります（下記「未決定事項」）。

---

## 5. 未決定事項

- **管理者の認証・認可の方式**（例: Cognito / IdP 連携 / IP 制限との組み合わせ、権限の粒度、操作の監査ログ）。これが決まって実装されるまで、管理機能を本番で有効にしてはいけません。
- **費用**: Fargate・RDS・CloudFront・NAT などの月額の見積もりと上限。
- **運用体制**: 情報を確認する担当者と体制、確認する頻度（大会の前は毎日など）、誤った情報の訂正手順、問い合わせ窓口。
- **情報源の利用条件**: 各サイトの利用規約・robots.txt・著作権の確認、取得の頻度、User-Agent に入れる連絡先。
- **LLM を使うかどうか**: 精度・費用・データの扱い（送信してよい内容）、プロンプトインジェクション対策、出力を検証する方式。
- **監視**: 監視する項目、アラートの通知先、収集が失敗したときの対応。
- **バックアップとリストア**: 保持期間、リストア手順と訓練。
- **ヘルスチェック**: 死活監視用の `/api/health`（DB に依存しない）は用意済み。DB まで含めた準備完了チェック（readiness）を別に用意するかどうか。
- データの保持方針（収集履歴・却下した候補を消す時期）、アクセス解析の要否。
