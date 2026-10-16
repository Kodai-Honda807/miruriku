# AWS（Lightsail）へのデプロイ

WSL（Ubuntu）から AWS CLI と SSH だけで、Amazon Lightsail のインスタンス 1 台にデプロイします。
数人で使う前提の、安く・壊れにくく・後片付けしやすい構成です。

```
利用者 ─ HTTPS ─ Lightsail インスタンス（Ubuntu 24.04、2GB）
                  └ Docker Compose
                     ├ caddy  … HTTPS 終端（Let's Encrypt で証明書を自動取得）。/admin は常に 404
                     ├ web    … Next.js（Dockerfile の runner）。外部には公開しない
                     ├ db     … PostgreSQL 18。ポートは公開しない
                     └ migrate / tools … デプロイ時に 1 回だけ実行（マイグレーション・実在データの反映）
```

- 管理画面は本番モードでは常に無効です（アプリ側で 404、さらに Caddy でも遮断）。候補のレビューはローカルで行います。
- DB のパスワードはサーバー上で生成し、`/opt/miruriku/shared/secrets.env`（権限 600）にだけ保存します。手元にもイメージにも入りません。
- SSH（22 番）は、実行した時点のグローバル IP からだけ許可します。80/443 番だけを公開します。

## 費用の目安

| 項目 | 料金 |
| --- | --- |
| インスタンス（`small_3_0`: 2GB メモリ・60GB SSD・転送 3TB） | 月 12 USD |
| 静的 IP（インスタンスに割り当てている間） | 無料 |
| 自動スナップショット（毎日・7 世代） | 保存容量 × 0.05 USD/GB月（数 GB なら月 1 USD 未満〜数 USD） |

料金は [Lightsail の料金ページ](https://aws.amazon.com/lightsail/pricing/)（2026-10 時点）によります。インスタンスは**停止していても課金されます**。課金を止めるには `./deploy/destroy.sh` で削除してください。新規利用者向けの無料枠がある場合がありますが、条件は料金ページで確認してください。

2GB のプランにしているのは、サーバー上で `next build` を行うためです（1GB では不足するおそれがあります）。

### ほかの構成を選ばなかった理由

- App Runner: 2026-04-30 以降、新規の利用者を受け付けていません（[AWS の案内](https://aws.amazon.com/apprunner/)）。
- ECS Fargate + RDS + ALB（docs/design.md の将来構成）: ロードバランサーと RDS だけで月 30 USD 以上かかり、数人で使うには過剰です。利用者が増えたら移行を検討します。
- Lightsail のコンテナサービス + マネージド DB: 月 25 USD ほど。マイグレーションやデータの反映を 1 回だけ実行する手段が乏しいため見送りました。

## 事前準備（WSL）

1. リポジトリは WSL のファイルシステム（例 `~/src/miruriku`）に clone します。`/mnt/c` 配下では SSH 鍵の権限を設定できず、実行も遅くなります。
2. 必要なコマンド: `aws`（AWS CLI v2）、`ssh`、`ssh-keygen`、`git`、`curl`、`tar`、`gzip`。手元に Docker は不要です（ビルドはサーバー上で行います）。

   ```bash
   sudo apt-get update && sudo apt-get install -y openssh-client git curl unzip
   curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
   unzip -q /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install
   aws --version
   ```

3. AWS の認証情報を、名前付きプロファイルとして設定します（アクセスキーを `deploy/.env` に書くのは非推奨です）。

   ```bash
   aws configure sso --profile miruriku   # IAM Identity Center を使う場合（推奨）
   # または
   aws configure --profile miruriku       # IAM ユーザーのアクセスキーを使う場合
   ```

   このユーザー（ロール）に必要な権限は [deploy/iam-policy.json](../deploy/iam-policy.json) です。Lightsail の操作だけに絞っています。

4. 設定ファイルを作ります。

   ```bash
   cp deploy/.env.example deploy/.env
   # AWS_PROFILE・リージョン・ドメインなどを確認して編集
   ```

## 初回のデプロイ

```bash
./deploy/provision.sh   # Lightsail のリソースを作成（料金が発生します。内容を表示してから確認を求めます）
./deploy/deploy.sh      # ビルド → マイグレーション → 実在データの反映 → 起動 → 動作確認
```

- `provision.sh` が作るもの: インスタンス、静的 IP、SSH 鍵の登録（秘密鍵は手元の `~/.ssh/miruriku-lightsail` のまま）、ファイアウォール、自動スナップショット。何度実行しても、既にあるものは作り直しません。
- 初回起動時に `deploy/cloud-init.sh` が Docker の導入・スワップの追加・自動セキュリティ更新の有効化を行います（数分かかります）。
- `deploy.sh` は**コミット済みの HEAD だけ**を転送します。未コミットの変更があると止まります（`--allow-dirty` で続行できますが、変更は反映されません）。
- 初回のビルドは 10 分ほどかかります。完了すると `https://<ドメイン>/api/health` と、`/admin` が 404 になることを確認します。

### ドメイン

`deploy/.env` の `DOMAIN` が空なら、`1-2-3-4.sslip.io` のような名前を使います（[sslip.io](https://sslip.io/) は IP アドレスをそのまま名前として解決する公開 DNS です）。

### 独自ドメイン（例: miruriku.com）を使う

1. Route 53 でドメインを登録し、「ドメイン」→「リクエスト」で登録が完了していること、登録者のメールアドレスを認証済みであることを確認します。
2. 自動で作られたホストゾーン（`miruriku.com`）に、A レコードを 2 つ作ります。値はどちらも静的 IP（`./deploy/ops.sh status` で確認）、TTL は 300 秒で構いません。
   - レコード名なし（`miruriku.com`）
   - `www`（`www.miruriku.com`。任意。作ると `miruriku.com` へ転送します）
3. 手元で反映を確認します: `getent ahostsv4 miruriku.com`（静的 IP が表示されれば OK）。
4. `deploy/.env` に `DOMAIN="miruriku.com"` を設定し、`./deploy/deploy.sh` を実行します。

`deploy.sh` は、ドメインが静的 IP に向いていなければ中止します（証明書を取得できないため）。
`www.<ドメイン>`（DNS が向いている場合）と以前の sslip.io の URL は、パスを保ったまま `https://<ドメイン>` へ 301 転送します。
canonical・OGP・サイトマップの URL も新しいドメインになります。

切り替えたあとに行うこと:

- Google アナリティクス: 管理 →「データストリーム」でウェブストリームの URL を `https://miruriku.com` に変更する（測定 ID は変わらない）
- Google Search Console: 「ドメイン」プロパティで `miruriku.com` を追加し、表示された TXT レコードを Route 53 のホストゾーンに追加して所有権を確認する。確認後に `https://miruriku.com/sitemap.xml` を送信する

## 更新

```bash
# data/real-events.ts やコードを直してコミットしたあと
./deploy/deploy.sh
```

毎回、マイグレーションと実在データの反映（`pnpm data:load` 相当）を行います。データを変えずにコードだけ反映するときは `--skip-data-load` を付けます。ビルドに失敗した場合は、動いているコンテナはそのまま残ります。

## タグ（他のアプリのリソースとの区別）

`deploy/.env` の `RESOURCE_TAGS`（既定 `project=miruriku environment=production managed-by=miruriku-deploy`）を、`provision.sh` の実行のたびに付けます。作成済みのリソースにも付け直すので、値を変えたときは `./deploy/provision.sh` を再実行してください（既存のタグは消しません）。

| リソース | タグ | 区別のしかた |
| --- | --- | --- |
| インスタンス | 付く（作成時と毎回の provision） | タグ |
| SSH 鍵（キーペア） | 付く | タグ |
| 静的 IP | **付けられない**（Lightsail がタグに対応していない） | 名前（`miruriku-ip`） |
| 自動スナップショット | **引き継がれない**（Lightsail の仕様） | 元のインスタンス名 |

Lightsail でタグを付けられるリソースの種類は [Lightsail のタグのドキュメント](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-tags.html)、自動スナップショットの扱いは [自動スナップショットのドキュメント](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-configuring-automatic-snapshots.html) にあります。この構成では Lambda などほかのサービスのリソースは作りません。

```bash
./deploy/ops.sh resources   # RESOURCE_TAGS の最初のタグで絞り込んで、このアプリのリソースを一覧表示
```

請求額をタグで分けて見たい場合は、Billing and Cost Management の「コスト配分タグ」で `project` を有効にします（有効にした時点以降の利用分から反映されます）。

## 検索エンジン向けの設定（SEO）

- 公開 URL は `MIRURIKU_SITE_URL`（`https://<DOMAIN>`）として、ビルド時（canonical・OGP）と実行時（サイトマップ）の両方に自動で渡します。未設定なら絶対 URL を出しません。
- 出しているもの: ページごとのタイトルと説明文、canonical（絞り込み条件付きの URL は `/` にまとめる）、OGP / X カード、`robots.txt`（`/admin` と `/api/` を除外）、`sitemap.xml`（公開中の実在の大会。デモ大会は除外）、大会詳細の構造化データ（schema.org `SportsEvent`）、トップの `WebSite`、アイコン一式とマニフェスト。
- デモ（架空）の大会と、存在しないページは `noindex` です。
- 公開後に行うこと（任意）:
  1. [Google Search Console](https://search.google.com/search-console) にプロパティを追加し、所有権を確認する（独自ドメインなら「ドメイン」プロパティ + DNS の TXT レコード。sslip.io では DNS で確認できないため「URL プレフィックス」+「HTML タグ」になり、タグをコードに追加する必要がある）
  2. `https://<DOMAIN>/sitemap.xml` を送信する
  3. [リッチリザルト テスト](https://search.google.com/test/rich-results) で大会詳細ページの構造化データを確認する
- URL（ドメイン）が変わると、それまでの検索エンジンの評価は引き継がれにくくなります。静的配信への移行などで URL を変える予定があるなら、先に独自ドメインを決めておくのが確実です。

## アクセス解析（Google アナリティクス）

- 測定 ID `G-E17SENSEG0` の GA4 タグ（gtag.js）を、本番ビルドのときだけ読み込みます（`src/components/site/analytics.tsx`）。開発サーバー・テスト・E2E では読み込みません。
- 手元で本番ビルドを確認するときに計測したくない場合は、ビルド時に `NEXT_PUBLIC_DISABLE_ANALYTICS=1` を指定します。
- 計測しているときは、フッターに Google アナリティクスの利用と Google のポリシーへのリンクを表示します。
- フィルタ変更や詳細ページへの移動（画面の再読み込みを伴わない遷移）は、GA4 のデータストリーム設定「拡張計測機能」の「ブラウザの履歴イベントに基づくページの変更」（既定で有効）でページビューになります。
- 反映の確認は、GA の「レポート」→「リアルタイム」で行います。

## 運用コマンド

```bash
./deploy/ops.sh status               # コンテナの状態・ディスク・メモリ
./deploy/ops.sh logs web             # ログ（web / caddy / db）
./deploy/ops.sh ssh                  # SSH 接続
./deploy/ops.sh collect --all        # 収集 CLI を本番 DB に対してドライランで実行（候補は保存しない）
./deploy/ops.sh backup               # DB のダンプを deploy/backups/ に保存
./deploy/ops.sh allow-ssh            # 自宅の IP が変わったときに SSH の許可を更新
./deploy/ops.sh resources            # このアプリの Lightsail リソースとタグの一覧
./deploy/destroy.sh                  # すべて削除して課金を止める（DB のデータも消えます）
```

### バックアップからの復元

```bash
# 手元のダンプをサーバーに送り、DB に復元する（既存のデータは置き換わります）
./deploy/ops.sh ssh   # 先に接続できることを確認
scp -i ~/.ssh/miruriku-lightsail -o UserKnownHostsFile=~/.ssh/miruriku_known_hosts \
  deploy/backups/<ファイル>.dump ubuntu@<静的IP>:/opt/miruriku/backups/
# サーバー上で
docker compose -p miruriku \
  --env-file /opt/miruriku/shared/secrets.env --env-file /opt/miruriku/shared/settings.env \
  -f /opt/miruriku/current/deploy/compose.prod.yml \
  exec -T db pg_restore -U miruriku -d miruriku --clean --if-exists < /opt/miruriku/backups/<ファイル>.dump
```

## うまくいかないとき

- `provision.sh` が「初期設定が完了しません」で止まった: 作成済みのリソースはそのままで構いません。`./deploy/provision.sh` をもう一度実行すると、初回起動時の初期設定（`deploy/cloud-init.sh`）が失敗していれば SSH 経由で実行し直します。それでも失敗する場合は、表示されたログか、サーバーの `~/miruriku-init.log`・`/var/log/cloud-init-output.log` を確認してください。
- `deploy/cloud-init.sh` を編集するとき: Lightsail はこのスクリプトの前に独自の初期化処理を付け足して `/bin/sh`（dash）で実行するため、1 行目の `#!` は効きません。`set -o pipefail`・`[[ ]]`・配列など bash 専用の書き方は使わないでください（`shellcheck -s sh deploy/cloud-init.sh` で確認できます）。

## 注意点・未対応のこと

- 認証のない管理画面は公開しません。本番で候補のレビューや編集をしたい場合は、先に管理者の認証・認可を実装する必要があります。
- 公開した URL は誰でも開けます。数人だけで使いたい場合は、URL を限られた人にだけ共有してください（検索エンジンへの登録を避ける設定は未対応です）。
- 収集 CLI の定期実行は設定していません。
- サーバーは 1 台なので、OS の再起動やデプロイ中は数十秒止まります。
- OS のセキュリティ更新は自動で適用されますが、カーネル更新後の再起動は手動です（`./deploy/ops.sh ssh` → `sudo reboot`）。
