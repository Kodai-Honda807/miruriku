#!/usr/bin/env bash
# Route 53 で登録した独自ドメインに切り替える（DNS 設定 → deploy/.env の更新 → デプロイを 1 コマンドで行う）。
#
#   ./deploy/domain.sh miruriku.com
#
# 流れ:
#   1. ドメインの登録状況と、登録者メールアドレスの認証状況を確認する（未認証ならメールのリンクを開くよう案内）
#   2. 登録時に自動で作られたホストゾーンに、A レコード（<ドメイン> と www.<ドメイン> → 静的 IP、TTL 300）を作成・更新する
#   3. 手元の DNS で静的 IP に解決されるまで待つ（最大 15 分。登録直後はネームサーバーの反映待ちで時間がかかる）
#   4. deploy/.env の DOMAIN を書き換え、./deploy/deploy.sh を実行する
#
# 何度実行しても同じ結果になる（レコードは UPSERT）。変更の前に確認を求める。
# 必要な権限は deploy/iam-policy.json の MirurikuRoute53Domain を参照。

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

case "${1:-}" in
  -h | --help | "")
    awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
    [[ -n "${1:-}" ]] && exit 0
    exit 1
    ;;
esac
domain="${1%.}"
domain="${domain,,}"
[[ "$domain" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$ ]] || die "ドメイン名の形式が正しくありません: ${1}"
[[ "$domain" != *.sslip.io ]] || die "sslip.io は指定できません（DOMAIN を空にすると sslip.io を使います）"

require_commands aws getent awk sed
load_config
check_aws_identity

# Route 53 Domains の API は us-east-1 にしかない
aws_domains() {
  local args=(--region us-east-1 --no-cli-pager)
  if [[ -n "${AWS_PROFILE:-}" && -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
    args+=(--profile "$AWS_PROFILE")
  fi
  aws "${args[@]}" route53domains "$@"
}
permission_hint="必要な権限は deploy/iam-policy.json の MirurikuRoute53Domain を参照してください"

ip="$(static_ip)"

# --- 1. 登録状況 --------------------------------------------------------------
info "ドメインの登録状況を確認します"
if reach="$(aws_domains get-contact-reachability-status --domain-name "$domain" --query status --output text 2>&1)"; then
  case "$reach" in
    PENDING)
      die "登録者のメールアドレスが未認証です。Route 53 から届いたメール（noreply@registrar.amazon など）のリンクを開いてから、もう一度実行してください（未認証のままだとドメインが停止されます）"
      ;;
    EXPIRED)
      die "メールアドレス認証の期限が切れています。Route 53 コンソールの「ドメイン」→「リクエスト」で確認メールを再送し、認証してから実行してください"
      ;;
    *) info "登録者のメールアドレス: 認証済み（${reach}）" ;;
  esac
else
  warn "登録者メールアドレスの認証状況を確認できませんでした（${permission_hint}）: ${reach}"
fi

registered_ns=""
if registered_ns="$(aws_domains get-domain-detail --domain-name "$domain" --query 'Nameservers[].Name' --output text 2>&1)"; then
  :
else
  if grep -q "AccessDenied\|not authorized" <<<"$registered_ns"; then
    warn "ドメインの登録情報を確認できませんでした（${permission_hint}）"
  else
    die "${domain} は、この AWS アカウントの Route 53 に登録されていないか、登録処理中です。Route 53 コンソールの「ドメイン」→「リクエスト」を確認してください: ${registered_ns}"
  fi
  registered_ns=""
fi

# --- 2. ホストゾーンと A レコード ------------------------------------------------
zone_id="$(aws_cli route53 list-hosted-zones-by-name --dns-name "$domain" \
  --query "HostedZones[?Name=='${domain}.' && !Config.PrivateZone].Id" --output text 2>&1)" ||
  die "ホストゾーンを取得できませんでした（${permission_hint}）: ${zone_id}"
zone_count="$(wc -w <<<"$zone_id")"
((zone_count == 1)) || die "${domain} の公開ホストゾーンが ${zone_count} 個あります（1 個である必要があります）。Route 53 コンソールで確認してください"
zone_id="${zone_id##*/}"

# 登録情報のネームサーバーとホストゾーンが一致しているか（手動でホストゾーンを作り直した場合などに食い違う）
if [[ -n "$registered_ns" ]]; then
  zone_ns="$(aws_cli route53 get-hosted-zone --id "$zone_id" --query 'DelegationSet.NameServers' --output text)"
  normalize() { tr -s '[:space:]' '\n' | tr '[:upper:]' '[:lower:]' | sed -e 's/\.$//' -e '/^$/d' | sort; }
  if [[ "$(normalize <<<"$registered_ns")" != "$(normalize <<<"$zone_ns")" ]]; then
    die "ドメインに設定されたネームサーバーが、ホストゾーン ${zone_id} のものと一致しません。ドメイン側: ${registered_ns} / ホストゾーン側: ${zone_ns}"
  fi
fi

current="$(aws_cli route53 list-resource-record-sets --hosted-zone-id "$zone_id" \
  --query "ResourceRecordSets[?Type=='A' && (Name=='${domain}.' || Name=='www.${domain}.')].[Name,ResourceRecords[0].Value]" \
  --output text)"

cat <<PLAN

次の内容で設定します。
  ホストゾーン : ${domain}（${zone_id}）
  A レコード   : ${domain} → ${ip}（TTL 300）
                 www.${domain} → ${ip}（TTL 300。${domain} へ転送します）
  現在の値     : ${current:-（なし）}
  deploy/.env  : DOMAIN="${domain}"
  その後       : ./deploy/deploy.sh を実行（以前の sslip.io の URL は ${domain} へ転送）

PLAN
confirm "設定してデプロイしますか"

change_batch="$(cat <<JSON
{
  "Comment": "miruriku: ${domain} を Lightsail の静的 IP に向ける",
  "Changes": [
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "${domain}.", "Type": "A", "TTL": 300, "ResourceRecords": [{"Value": "${ip}"}]}},
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "www.${domain}.", "Type": "A", "TTL": 300, "ResourceRecords": [{"Value": "${ip}"}]}}
  ]
}
JSON
)"
info "A レコードを設定します"
change_id="$(aws_cli route53 change-resource-record-sets --hosted-zone-id "$zone_id" \
  --change-batch "$change_batch" --query 'ChangeInfo.Id' --output text 2>&1)" ||
  die "A レコードを設定できませんでした（${permission_hint}）: ${change_id}"
aws_cli route53 wait resource-record-sets-changed --id "$change_id"
info "Route 53 への反映が完了しました"

# --- 3. 名前解決の確認 ------------------------------------------------------------
info "${domain} が ${ip} に解決されるまで待ちます（最大 15 分）"
deadline=$((SECONDS + 900))
until resolves_to "$domain" "$ip"; do
  if ((SECONDS >= deadline)); then
    die "${domain} がまだ ${ip} に解決されません。登録直後はネームサーバーの反映に時間がかかることがあります。しばらくしてから、もう一度 ./deploy/domain.sh ${domain} を実行してください（設定済みの部分はそのまま使います）"
  fi
  sleep 20
done
info "${domain} → ${ip} を確認しました"

# --- 4. deploy/.env の更新とデプロイ ------------------------------------------------
env_file="${DEPLOY_DIR}/.env"
if grep -q '^DOMAIN=' "$env_file"; then
  sed -i "s|^DOMAIN=.*|DOMAIN=\"${domain}\"|" "$env_file"
else
  printf '\nDOMAIN="%s"\n' "$domain" >>"$env_file"
fi
info "deploy/.env に DOMAIN=\"${domain}\" を設定しました"

exec "${DEPLOY_DIR}/deploy.sh"
