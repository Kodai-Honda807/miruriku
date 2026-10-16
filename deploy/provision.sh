#!/usr/bin/env bash
# Lightsail のリソース（インスタンス・静的 IP・SSH 鍵・ファイアウォール・自動スナップショット）を作成する。
# 何度実行しても、既にあるリソースは作り直さない。**月額料金が発生するリソースを作成する**ので、確認を求める。
#
#   ./deploy/provision.sh
#
# 作成後は ./deploy/deploy.sh でアプリをデプロイする。
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_commands aws ssh ssh-keygen curl
load_config
check_aws_identity

# --- プランとイメージの確認 ---------------------------------------------
bundle="$(aws_ls get-bundles --query "bundles[?bundleId=='${LIGHTSAIL_BUNDLE_ID}'] | [0].[price,ramSizeInGb,diskSizeInGb,isActive]" --output text)"
if [[ -z "$bundle" || "$bundle" == "None" ]]; then
  aws_ls get-bundles --query "bundles[?isActive && contains(supportedPlatforms, 'LINUX_UNIX')].[bundleId,price,ramSizeInGb]" --output table
  die "プラン ${LIGHTSAIL_BUNDLE_ID} が見つかりません。上の一覧から deploy/.env の LIGHTSAIL_BUNDLE_ID を選んでください"
fi
read -r bundle_price bundle_ram bundle_disk bundle_active <<<"$bundle"
[[ "$bundle_active" == "True" ]] || die "プラン ${LIGHTSAIL_BUNDLE_ID} は新規作成に使えません"

blueprint="$LIGHTSAIL_BLUEPRINT_ID"
if [[ -z "$blueprint" ]]; then
  blueprint="$(aws_ls get-blueprints --query "blueprints[?isActive && platform=='LINUX_UNIX' && starts_with(blueprintId, 'ubuntu_24')] | [0].blueprintId" --output text)"
  [[ -n "$blueprint" && "$blueprint" != "None" ]] || die "Ubuntu 24.04 のブループリントが見つかりません。LIGHTSAIL_BLUEPRINT_ID を指定してください"
fi

instance_exists=false
if aws_ls get-instance --instance-name "$LIGHTSAIL_INSTANCE_NAME" >/dev/null 2>&1; then
  instance_exists=true
fi

existing_note=""
$instance_exists && existing_note=" ※作成済み"

cat <<SUMMARY

作成・設定するもの（リージョン ${AWS_REGION}）
  インスタンス   : ${LIGHTSAIL_INSTANCE_NAME}（${blueprint} / ${LIGHTSAIL_BUNDLE_ID}: メモリ ${bundle_ram}GB・SSD ${bundle_disk}GB・月 ${bundle_price} USD）${existing_note}
  静的 IP        : ${LIGHTSAIL_STATIC_IP_NAME}（インスタンスに割り当てている間は無料。Lightsail の仕様でタグは付けられない）
  SSH 鍵         : ${LIGHTSAIL_KEY_PAIR_NAME}（秘密鍵は ${SSH_KEY_PATH}。AWS には公開鍵だけを登録）
  ファイアウォール: 22 番は接続元を限定、80/443 番は公開
  タグ           : ${RESOURCE_TAGS}（インスタンスと SSH 鍵に付ける）
  自動スナップショット: ${ENABLE_AUTO_SNAPSHOT}（毎日 ${AUTO_SNAPSHOT_TIME_UTC} UTC、7 世代。0.05 USD/GB月）

料金はインスタンスを削除するまで発生します（停止中も課金）。削除は ./deploy/destroy.sh で行えます。
SUMMARY
confirm "上記のリソースを作成しますか"

# --- SSH 鍵 ------------------------------------------------------------
mkdir -p "$(dirname "$SSH_KEY_PATH")"
chmod 700 "$(dirname "$SSH_KEY_PATH")"
if [[ ! -f "$SSH_KEY_PATH" ]]; then
  info "SSH 鍵を作成します: ${SSH_KEY_PATH}"
  # Lightsail の鍵のインポートは RSA のみ対応
  ssh-keygen -t rsa -b 4096 -N "" -C "miruriku-lightsail" -f "$SSH_KEY_PATH" >/dev/null
fi
chmod 600 "$SSH_KEY_PATH"
if ! aws_ls get-key-pair --key-pair-name "$LIGHTSAIL_KEY_PAIR_NAME" >/dev/null 2>&1; then
  info "公開鍵を Lightsail に登録します: ${LIGHTSAIL_KEY_PAIR_NAME}"
  aws_ls import-key-pair --key-pair-name "$LIGHTSAIL_KEY_PAIR_NAME" --public-key-base64 "file://${SSH_KEY_PATH}.pub" >/dev/null
fi

# --- インスタンス --------------------------------------------------------
if ! $instance_exists; then
  info "インスタンスを作成します: ${LIGHTSAIL_INSTANCE_NAME}"
  aws_ls create-instances \
    --instance-names "$LIGHTSAIL_INSTANCE_NAME" \
    --availability-zone "$LIGHTSAIL_AVAILABILITY_ZONE" \
    --blueprint-id "$blueprint" \
    --bundle-id "$LIGHTSAIL_BUNDLE_ID" \
    --key-pair-name "$LIGHTSAIL_KEY_PAIR_NAME" \
    --user-data "$(cat "${DEPLOY_DIR}/cloud-init.sh")" \
    --tags "${TAG_ARGS[@]}" >/dev/null
fi

info "インスタンスの起動を待っています"
for _ in $(seq 1 60); do
  state="$(aws_ls get-instance --instance-name "$LIGHTSAIL_INSTANCE_NAME" --query 'instance.state.name' --output text)"
  [[ "$state" == "running" ]] && break
  sleep 5
done
[[ "$state" == "running" ]] || die "インスタンスが running になりません（状態: ${state}）"

# --- タグ ----------------------------------------------------------------
# 作成済みのリソースや、RESOURCE_TAGS を変えた場合にも反映するよう、毎回付け直す（既存のタグは消さない）
info "タグを付けます: ${RESOURCE_TAGS}"
tag_resource "$LIGHTSAIL_INSTANCE_NAME"
tag_resource "$LIGHTSAIL_KEY_PAIR_NAME"

# --- 静的 IP ------------------------------------------------------------
if ! aws_ls get-static-ip --static-ip-name "$LIGHTSAIL_STATIC_IP_NAME" >/dev/null 2>&1; then
  info "静的 IP を確保します: ${LIGHTSAIL_STATIC_IP_NAME}"
  aws_ls allocate-static-ip --static-ip-name "$LIGHTSAIL_STATIC_IP_NAME" >/dev/null
fi
attached_to="$(aws_ls get-static-ip --static-ip-name "$LIGHTSAIL_STATIC_IP_NAME" --query 'staticIp.attachedTo' --output text)"
if [[ "$attached_to" != "$LIGHTSAIL_INSTANCE_NAME" ]]; then
  [[ "$attached_to" == "None" || -z "$attached_to" ]] || die "静的 IP ${LIGHTSAIL_STATIC_IP_NAME} は別のインスタンス（${attached_to}）に割り当て済みです"
  info "静的 IP をインスタンスに割り当てます"
  aws_ls attach-static-ip --static-ip-name "$LIGHTSAIL_STATIC_IP_NAME" --instance-name "$LIGHTSAIL_INSTANCE_NAME" >/dev/null
  sleep 5
fi
ip="$(static_ip)"

# --- ファイアウォール・自動スナップショット -----------------------------------
apply_firewall "$(current_ssh_cidr)"

if [[ "$ENABLE_AUTO_SNAPSHOT" == "true" ]]; then
  info "自動スナップショットを有効にします（毎日 ${AUTO_SNAPSHOT_TIME_UTC} UTC）"
  aws_ls enable-add-on --resource-name "$LIGHTSAIL_INSTANCE_NAME" \
    --add-on-request "addOnType=AutoSnapshot,autoSnapshotAddOnRequest={snapshotTimeOfDay=${AUTO_SNAPSHOT_TIME_UTC}}" >/dev/null
fi

# --- 初期設定（cloud-init.sh）の完了を待つ -------------------------------------
# 新しいインスタンスが同じ IP を使う場合に備えて、古いホスト鍵を消す
if ! $instance_exists && [[ -f "$KNOWN_HOSTS_FILE" ]]; then
  ssh-keygen -R "$ip" -f "$KNOWN_HOSTS_FILE" >/dev/null 2>&1 || true
fi
info "初期設定（Docker の導入など）の完了を待っています。数分かかります"
ready=false
rerun_done=false
last_error=""
for _ in $(seq 1 60); do
  if last_error="$(remote "$ip" "test -f ${REMOTE_BASE}/.provisioned && docker compose version >/dev/null" 2>&1)"; then
    ready=true
    break
  fi
  # 初回起動スクリプトが完了の印を残さずに終わっていたら（失敗・途中終了）、SSH 経由で実行し直す
  if ! $rerun_done; then
    init_status="$(remote "$ip" "cloud-init status 2>/dev/null | sed -n 's/^status: //p'" 2>/dev/null || true)"
    if [[ "$init_status" == "done" || "$init_status" == "error" ]]; then
      warn "初回起動時の初期設定が完了していません（cloud-init: ${init_status}）。SSH 経由で実行し直します（数分かかります）"
      rerun_done=true
      if ! remote "$ip" "sudo sh -s > ~/miruriku-init.log 2>&1" <"${DEPLOY_DIR}/cloud-init.sh"; then
        remote "$ip" "tail -n 30 ~/miruriku-init.log" >&2 || true
        die "初期設定に失敗しました。上のログ（サーバーの ~/miruriku-init.log）を確認してください"
      fi
      continue
    fi
  fi
  sleep 10
done
if ! $ready; then
  [[ -n "$last_error" ]] && printf '%s\n' "$last_error" >&2
  die "初期設定が完了しません。./deploy/ops.sh ssh で接続し、cloud-init status --long と /var/log/cloud-init-output.log を確認してください"
fi

cat <<DONE

準備ができました。
  静的 IP : ${ip}
  公開 URL: https://$(public_domain "$ip")/ （deploy.sh の実行後）

次に ./deploy/deploy.sh を実行してください。
DONE
