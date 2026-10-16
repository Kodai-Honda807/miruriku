#!/usr/bin/env bash
# deploy/static/*.sh の共通処理。単体では実行しない（source して使う）。
# shellcheck disable=SC2034  # 呼び出し元のスクリプトで使う変数を定義する

# info / warn / die / confirm / require_commands / load_config / check_aws_identity / aws_cli など
# shellcheck source=deploy/lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"

STATIC_DIR="${DEPLOY_DIR}/static"
STACK_NAME="${STATIC_STACK_NAME:-miruriku-static}"
# CloudFront の別名レコード（エイリアス）に指定する固定のホストゾーン ID（全ディストリビューション共通）
CLOUDFRONT_HOSTED_ZONE_ID="Z2FDTNDATAQYW2"

# CloudFront・ACM（CloudFront 用の証明書）・このスタックは us-east-1 に置く
aws_global() {
  local args=(--region us-east-1 --no-cli-pager)
  if [[ -n "${AWS_PROFILE:-}" && -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
    args+=(--profile "$AWS_PROFILE")
  fi
  aws "${args[@]}" "$@"
}

# 公開ドメイン（deploy/.env の DOMAIN）。静的配信では独自ドメインが必須
require_domain() {
  [[ -n "$DOMAIN" ]] || die "deploy/.env の DOMAIN が空です。公開ドメイン（例: DOMAIN=\"miruriku.com\"）を設定してください"
  [[ "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$ ]] || die "DOMAIN の形式が正しくありません: ${DOMAIN}"
  [[ "$DOMAIN" != *.sslip.io ]] || die "静的配信では sslip.io は使えません。独自ドメインを DOMAIN に設定してください"
}

# ドメインの公開ホストゾーン ID（/hostedzone/ を除いたもの）。ちょうど 1 個でなければ止める
hosted_zone_id() {
  local domain="$1" ids count
  ids="$(aws_cli route53 list-hosted-zones-by-name --dns-name "$domain" \
    --query "HostedZones[?Name=='${domain}.' && Config.PrivateZone==\`false\`].Id" --output text 2>&1)" ||
    die "ホストゾーンを取得できませんでした（必要な権限は deploy/iam-policy.json を参照）: ${ids}"
  [[ "$ids" != "None" ]] || ids=""
  count="$(wc -w <<<"$ids")"
  ((count == 1)) || die "${domain} の公開ホストゾーンが ${count} 個あります（1 個である必要があります）。Route 53 コンソールで確認してください"
  printf '%s' "${ids##*/}"
}

# スタックの状態（存在しなければ空）
stack_status() {
  aws_global cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null || true
}

# スタックの出力値
stack_output() {
  local key="$1" value
  value="$(aws_global cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue | [0]" --output text 2>/dev/null || true)"
  [[ -n "$value" && "$value" != "None" ]] || die "スタック ${STACK_NAME} の出力 ${key} を取得できません。先に ./deploy/static/deploy.sh を実行してください"
  printf '%s' "$value"
}

# template.yaml の __VIEWER_REQUEST_JS__ を viewer-request.js の内容（コメント行を除く）に置き換えて出力する
render_template() {
  local out="$1" code_file="${STATIC_DIR}/viewer-request.js"
  awk -v code_file="$code_file" '
    /^[ ]*__VIEWER_REQUEST_JS__[ ]*$/ {
      match($0, /^[ ]*/)
      indent = substr($0, 1, RLENGTH)
      while ((getline line < code_file) > 0) {
        if (line ~ /^[ ]*\/\//) continue
        if (line ~ /^[ ]*$/) { print ""; continue }
        print indent line
      }
      close(code_file)
      replaced = 1
      next
    }
    { print }
    END { if (!replaced) exit 1 }
  ' "${STATIC_DIR}/template.yaml" >"$out" || die "テンプレートの生成に失敗しました（__VIEWER_REQUEST_JS__ が見つかりません）"
}

# 名前の A レコード（JSON。なければ null）
record_set_json() {
  local zone_id="$1" name="$2" type="$3"
  aws_cli route53 list-resource-record-sets --hosted-zone-id "$zone_id" \
    --query "ResourceRecordSets[?Name=='${name}.' && Type=='${type}'] | [0]" --output json
}

# 名前の A レコードが向いている先（CloudFront の別名なら d...cloudfront.net、通常のレコードなら IP。なければ空）
record_target() {
  local zone_id="$1" name="$2"
  aws_cli route53 list-resource-record-sets --hosted-zone-id "$zone_id" \
    --query "ResourceRecordSets[?Name=='${name}.' && Type=='A'] | [0].[AliasTarget.DNSName, ResourceRecords[0].Value] | [?@ != null] | [0]" \
    --output text | sed -e 's/\.$//' -e 's/^None$//'
}
