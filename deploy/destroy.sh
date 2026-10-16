#!/usr/bin/env bash
# Lightsail のリソース（インスタンス・静的 IP・SSH 鍵の登録）を削除して、課金を止める。
# **DB のデータも消えます。** 必要なら先に ./deploy/ops.sh backup を実行してください。
# インスタンスの自動スナップショットもインスタンスと一緒に削除されます（手動スナップショットは残ります）。
#
#   ./deploy/destroy.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_commands aws
load_config
check_aws_identity

cat <<SUMMARY

削除するもの（リージョン ${AWS_REGION}）
  インスタンス: ${LIGHTSAIL_INSTANCE_NAME}（DB のデータを含む）
  静的 IP     : ${LIGHTSAIL_STATIC_IP_NAME}
  SSH 鍵の登録: ${LIGHTSAIL_KEY_PAIR_NAME}（手元の秘密鍵 ${SSH_KEY_PATH} は消しません）
SUMMARY
confirm "削除する場合はインスタンス名を入力してください" "$LIGHTSAIL_INSTANCE_NAME"

if aws_ls get-instance --instance-name "$LIGHTSAIL_INSTANCE_NAME" >/dev/null 2>&1; then
  info "インスタンスを削除します"
  aws_ls delete-instance --instance-name "$LIGHTSAIL_INSTANCE_NAME" --force-delete-add-ons >/dev/null
  info "インスタンスの削除完了を待っています"
  for _ in $(seq 1 60); do
    aws_ls get-instance --instance-name "$LIGHTSAIL_INSTANCE_NAME" >/dev/null 2>&1 || break
    sleep 5
  done
fi
if aws_ls get-static-ip --static-ip-name "$LIGHTSAIL_STATIC_IP_NAME" >/dev/null 2>&1; then
  info "静的 IP を解放します"
  aws_ls release-static-ip --static-ip-name "$LIGHTSAIL_STATIC_IP_NAME" >/dev/null
fi
if aws_ls get-key-pair --key-pair-name "$LIGHTSAIL_KEY_PAIR_NAME" >/dev/null 2>&1; then
  info "SSH 鍵の登録を削除します"
  aws_ls delete-key-pair --key-pair-name "$LIGHTSAIL_KEY_PAIR_NAME" >/dev/null
fi
info "削除しました。手動で作ったスナップショットがあれば、Lightsail のコンソールで確認してください"
