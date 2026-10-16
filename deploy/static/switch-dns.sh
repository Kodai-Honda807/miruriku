#!/usr/bin/env bash
# 公開ドメイン（deploy/.env の DOMAIN）と www.<ドメイン> の DNS を、CloudFront に向ける（または Lightsail に戻す）。
#
#   ./deploy/static/switch-dns.sh              # CloudFront に向ける（A・AAAA の別名レコード）
#   ./deploy/static/switch-dns.sh --rollback   # Lightsail の静的 IP に戻す（A レコード。AAAA は削除）
#
# ./deploy/static/deploy.sh の最後に、まだ切り替えていなければ自動で呼ばれる（単独でも実行できる）。
# 変更の前に確認を求める。既存のレコードは同じ変更の中で削除・作成するため、途中で名前が引けなくなることはない。
# 切り替え前の値の TTL（300 秒）の間は、古い向き先にアクセスする人もいる（どちらも同じ内容を返す）。
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

rollback=false
for arg in "$@"; do
  case "$arg" in
    --rollback) rollback=true ;;
    -h | --help)
      awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
      exit 0
      ;;
    *) die "不明なオプション: ${arg}（--help を参照）" ;;
  esac
done

require_commands aws curl awk sed
load_config
require_domain
check_aws_identity

zone_id="$(hosted_zone_id "$DOMAIN")"
names=("$DOMAIN" "www.${DOMAIN}")

if $rollback; then
  target="$(static_ip)"
  target_label="Lightsail の静的 IP ${target}"
else
  target="$(stack_output DistributionDomainName)"
  target_label="CloudFront ${target}"
fi

# 変更内容を組み立てる（既存の A・AAAA は削除して作り直す。通常のレコードと別名レコードは UPSERT で入れ替えられないため）
changes=()
plan=()
for name in "${names[@]}"; do
  current="$(record_target "$zone_id" "$name")"
  if [[ "${current,,}" == "${target,,}" ]]; then
    plan+=("  ${name}: 変更なし（${current}）")
    continue
  fi
  plan+=("  ${name}: ${current:-（なし）} → ${target}")
  for type in A AAAA; do
    existing="$(record_set_json "$zone_id" "$name" "$type")"
    if [[ "$existing" != "null" ]]; then
      changes+=("{\"Action\": \"DELETE\", \"ResourceRecordSet\": ${existing}}")
    fi
  done
  if $rollback; then
    changes+=("{\"Action\": \"CREATE\", \"ResourceRecordSet\": {\"Name\": \"${name}.\", \"Type\": \"A\", \"TTL\": 300, \"ResourceRecords\": [{\"Value\": \"${target}\"}]}}")
  else
    for type in A AAAA; do
      changes+=("{\"Action\": \"CREATE\", \"ResourceRecordSet\": {\"Name\": \"${name}.\", \"Type\": \"${type}\", \"AliasTarget\": {\"HostedZoneId\": \"${CLOUDFRONT_HOSTED_ZONE_ID}\", \"DNSName\": \"${target}.\", \"EvaluateTargetHealth\": false}}}")
    done
  fi
done

printf '\nDNS（ホストゾーン %s）を %s に向けます。\n' "$zone_id" "$target_label"
printf '%s\n' "${plan[@]}"
if ((${#changes[@]} == 0)); then
  info "すでに ${target_label} を向いています。変更はありません"
  exit 0
fi
echo
confirm "DNS を切り替えますか"

joined="$(IFS=,; printf '%s' "${changes[*]}")"
change_batch="{\"Comment\": \"miruriku: ${DOMAIN} -> ${target}\", \"Changes\": [${joined}]}"
info "Route 53 のレコードを変更します"
change_id="$(aws_cli route53 change-resource-record-sets --hosted-zone-id "$zone_id" \
  --change-batch "$change_batch" --query 'ChangeInfo.Id' --output text 2>&1)" ||
  die "レコードを変更できませんでした（必要な権限は deploy/iam-policy.json を参照）: ${change_id}"
aws_cli route53 wait resource-record-sets-changed --id "$change_id"
info "Route 53 への反映が完了しました（以前の値の TTL 300 秒が過ぎると、すべてのアクセスが新しい向き先になります）"

if ! $rollback; then
  # CloudFront を直接指定して、別名（Host）付きで応答できるかを確かめる（手元の DNS キャッシュに左右されないように）
  cf_ip="$(getent ahostsv4 "$target" 2>/dev/null | awk 'NR == 1 {print $1}' || true)"
  if [[ -n "$cf_ip" ]] &&
    curl -fsS -o /dev/null --max-time 20 --resolve "${DOMAIN}:443:${cf_ip}" "https://${DOMAIN}/"; then
    info "https://${DOMAIN}/ を CloudFront 経由で確認しました"
  else
    warn "CloudFront 経由で https://${DOMAIN}/ を確認できませんでした。数分後にブラウザで確認してください（戻すには ./deploy/static/switch-dns.sh --rollback）"
  fi
  cat <<DONE

切り替えが完了しました。
  公開 URL : https://${DOMAIN}/ （www.${DOMAIN} は ${DOMAIN} へ転送）
  戻す場合 : ./deploy/static/switch-dns.sh --rollback（Lightsail を削除するまでは戻せます）
DONE
fi
