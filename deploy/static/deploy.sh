#!/usr/bin/env bash
# 公開サイトを静的ビルドし、S3 + CloudFront に配信する（初回は AWS のリソースも作る）。
#
#   ./deploy/static/deploy.sh                 # ビルド → AWS リソースの作成・更新 → アップロード → 確認 →（未切り替えなら）DNS 切り替え
#   ./deploy/static/deploy.sh --allow-dirty   # 未コミットの変更があっても続ける（デプロイされるのは HEAD のみ）
#   ./deploy/static/deploy.sh --skip-dns      # 最後の DNS 切り替えを行わない
#
# 流れ:
#   1. git archive で HEAD を一時ディレクトリに展開し、手元の .env や環境変数を使わずに pnpm build（静的書き出し）
#      公開データは data/real-events.ts（DB には接続しない）。時計の固定などテスト用の設定は入らない
#   2. CloudFormation スタック（us-east-1。S3 バケット・CloudFront・ACM 証明書・CloudFront Functions）を作成・更新
#      初回は証明書の発行と CloudFront の配置に 5〜15 分ほどかかる
#   3. S3 にアップロード（_next/static は 1 年キャッシュ、それ以外は CloudFront に置き、ブラウザは毎回確認）
#      → CloudFront のキャッシュを削除（/*）
#   4. CloudFront のドメイン（*.cloudfront.net）でトップ・大会詳細・404・転送を確認
#   5. DNS がまだ CloudFront を向いていなければ、./deploy/static/switch-dns.sh を実行（確認あり）
#
# 必要なもの: AWS CLI、Node.js（.nvmrc）、pnpm、git、curl。必要な権限は deploy/iam-policy.json を参照。
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

allow_dirty=false
skip_dns=false
for arg in "$@"; do
  case "$arg" in
    --allow-dirty) allow_dirty=true ;;
    --skip-dns) skip_dns=true ;;
    -h | --help)
      awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
      exit 0
      ;;
    *) die "不明なオプション: ${arg}（--help を参照）" ;;
  esac
done

require_commands aws git curl tar node pnpm awk sed grep
load_config
require_domain
check_aws_identity

cd "$REPO_DIR"
commit="$(git rev-parse --short=12 HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  if $allow_dirty; then
    warn "未コミットの変更があります。デプロイされるのはコミット ${commit} の内容だけです"
  else
    git status --short
    die "未コミットの変更があります。コミットしてから実行するか、--allow-dirty を付けてください（未コミットの変更はデプロイされません）"
  fi
fi

zone_id="$(hosted_zone_id "$DOMAIN")"
work="$(mktemp -d "${TMPDIR:-/tmp}/miruriku-static.XXXXXX")"
trap 'rm -rf "$work"' EXIT

# --- 1. 静的ビルド ----------------------------------------------------------
info "コミット ${commit} を静的ビルドします（公開データ: data/real-events.ts）"
mkdir -p "${work}/src"
git archive --format=tar HEAD | tar -x -C "${work}/src"
(
  cd "${work}/src"
  # 手元の環境変数（DATABASE_URL、テスト用の時計の固定など）を持ち込まない
  env -i PATH="$PATH" HOME="$HOME" CI=1 pnpm install --frozen-lockfile --reporter=silent
  env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 \
    MIRURIKU_SITE_URL="https://${DOMAIN}" pnpm build
) || die "ビルドに失敗しました"
out="${work}/src/out"

# 公開物の確認（管理画面が含まれていないこと、サイト URL が正しいこと）
[[ -f "${out}/index.html" && -f "${out}/404.html" ]] || die "ビルド結果に index.html / 404.html がありません"
[[ ! -e "${out}/admin" && ! -e "${out}/api" ]] || die "ビルド結果に管理画面（/admin, /api）が含まれています。公開を中止します"
grep -q "<loc>https://${DOMAIN}/</loc>" "${out}/sitemap.xml" || die "sitemap.xml にサイト URL https://${DOMAIN}/ がありません"
first_event="$(sed -n "s|.*<loc>https://${DOMAIN}/events/\([^/<]*\)/</loc>.*|\1|p" "${out}/sitemap.xml" | head -n 1)"
rm -f "${out}/.gitkeep"
info "ビルド完了: $(find "$out" -type f | wc -l) ファイル、$(du -sh "$out" | cut -f1)"

# --- 2. AWS リソース -----------------------------------------------------------
status="$(stack_status)"
if [[ -z "$status" || "$status" == "None" ]]; then
  cat <<PLAN

AWS に次のリソースを作成します（スタック ${STACK_NAME}、リージョン us-east-1、タグ project=miruriku）。
  - S3 バケット（非公開。CloudFront 経由でだけ読める。以前の版を 30 日保存）
  - CloudFront ディストリビューション（別名 ${DOMAIN} / www.${DOMAIN}、HTTPS、PriceClass_200）
  - ACM 証明書（無料。検証用の DNS レコードをホストゾーン ${zone_id} に自動作成）
  - CloudFront Functions（URL の書き換え・転送）とセキュリティヘッダーのポリシー
  費用の目安: 月 0.1〜0.4 USD（月 1,000〜10,000 ページビューの想定、無料枠を除く）。
  証明書は無料。Route 53 のホストゾーン（月 0.5 USD）は既存のものを使います。
  この時点では DNS は変えません（今のサイトはそのまま動きます）。

PLAN
  confirm "作成しますか"
elif [[ "$status" == *_IN_PROGRESS ]]; then
  die "スタック ${STACK_NAME} は処理中です（${status}）。完了してから実行してください"
elif [[ "$status" == "ROLLBACK_COMPLETE" ]]; then
  die "スタック ${STACK_NAME} は作成に失敗した状態です（ROLLBACK_COMPLETE）。CloudFormation コンソールでイベントを確認し、スタックを削除してから実行してください"
fi

render_template "${work}/template.yaml"
info "AWS リソースを作成・更新します（初回は 5〜15 分ほどかかります）"
aws_global cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file "${work}/template.yaml" \
  --parameter-overrides "DomainName=${DOMAIN}" "HostedZoneId=${zone_id}" \
  --tags project=miruriku environment=production managed-by=miruriku-static-deploy \
  --no-fail-on-empty-changeset ||
  die "スタック ${STACK_NAME} の作成・更新に失敗しました。CloudFormation コンソール（us-east-1）でイベントを確認してください"

bucket="$(stack_output BucketName)"
distribution_id="$(stack_output DistributionId)"
cf_domain="$(stack_output DistributionDomainName)"

# --- 3. アップロード ---------------------------------------------------------
# ファイル名にハッシュが入るもの（_next/static）は 1 年キャッシュ。古いものも削除しない
# （デプロイ直前に開いたページが、古い JS を読み込めるようにするため）
info "S3（${bucket}）にアップロードします"
aws_global s3 sync "${out}/_next/static" "s3://${bucket}/_next/static" \
  --cache-control "public, max-age=31536000, immutable" --only-show-errors
# それ以外（HTML、RSC のデータ、sitemap.xml など）は CloudFront に置き（デプロイごとに削除）、ブラウザは毎回確認する
html_cache="public, max-age=0, s-maxage=31536000, must-revalidate"
aws_global s3 sync "$out" "s3://${bucket}" \
  --exclude "_next/static/*" --exclude "manifest.webmanifest" \
  --cache-control "$html_cache" --delete --only-show-errors
aws_global s3 cp "${out}/manifest.webmanifest" "s3://${bucket}/manifest.webmanifest" \
  --content-type "application/manifest+json" --cache-control "$html_cache" --only-show-errors

info "CloudFront のキャッシュを削除します"
invalidation_id="$(aws_global cloudfront create-invalidation --distribution-id "$distribution_id" \
  --paths "/*" --query 'Invalidation.Id' --output text)"
aws_global cloudfront wait invalidation-completed --distribution-id "$distribution_id" --id "$invalidation_id"

# --- 4. 動作確認 ------------------------------------------------------------
info "https://${cf_domain}/ で確認します"
check_status() {
  local path="$1" expected="$2" actual
  actual="$(curl -s -o /dev/null -w '%{http_code}' --retry 5 --retry-delay 5 --retry-all-errors --max-time 20 "https://${cf_domain}${path}")"
  [[ "$actual" == "$expected" ]] || die "https://${cf_domain}${path} が HTTP ${actual} を返しました（期待値 ${expected}）"
}
check_status "/" 200
check_status "/sitemap.xml" 200
check_status "/admin/" 404
check_status "/events/__not-found__/" 404
if [[ -n "$first_event" ]]; then
  check_status "/events/${first_event}" 301
  check_status "/events/${first_event}/" 200
fi
curl -fsS --max-time 20 "https://${cf_domain}/" | grep -q "みる陸" || die "トップページの内容を確認できませんでした"

current="$(record_target "$zone_id" "$DOMAIN")"
cat <<DONE

デプロイが完了しました（コミット ${commit}）。
  CloudFront : https://${cf_domain}/
  公開 URL   : https://${DOMAIN}/ （DNS の向き先: ${current:-なし}）
DONE

# --- 5. DNS の切り替え（初回だけ） -------------------------------------------------
if [[ "${current,,}" != "${cf_domain,,}" ]]; then
  if $skip_dns; then
    info "DNS はまだ CloudFront を向いていません。切り替えるには ./deploy/static/switch-dns.sh を実行してください"
  else
    echo
    info "DNS を CloudFront に切り替えます（先に https://${cf_domain}/ をブラウザで確認しても構いません）"
    "${STATIC_DIR}/switch-dns.sh"
  fi
fi
