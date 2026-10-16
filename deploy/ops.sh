#!/usr/bin/env bash
# デプロイ後の運用コマンド。
#
#   ./deploy/ops.sh status               # コンテナの状態・ディスク・メモリ
#   ./deploy/ops.sh logs [web|caddy|db]  # ログを表示（Ctrl+C で終了）
#   ./deploy/ops.sh ssh                  # サーバーに SSH 接続
#   ./deploy/ops.sh collect <引数>       # 収集 CLI をドライランで実行（例: collect --all）
#   ./deploy/ops.sh backup               # DB をダンプして手元の deploy/backups/ に保存
#   ./deploy/ops.sh restart              # web と caddy を再起動
#   ./deploy/ops.sh allow-ssh [CIDR]     # SSH を許可する接続元を更新（省略時は現在のグローバル IP）
#   ./deploy/ops.sh resources            # このアプリの Lightsail リソースとタグを一覧表示
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
  exit "${1:-0}"
}

cmd="${1:-}"
[[ -n "$cmd" ]] || usage 1
[[ "$cmd" =~ ^(-h|--help|help)$ ]] && usage 0
shift

require_commands aws ssh curl
load_config

if [[ "$cmd" == "resources" ]]; then
  tag_query="[?tags[?key=='${TAG_FILTER_KEY}' && value=='${TAG_FILTER_VALUE}']]"
  info "タグ ${TAG_FILTER_KEY}=${TAG_FILTER_VALUE} が付いたインスタンス"
  aws_ls get-instances --query "instances${tag_query}.[name,state.name,bundleId,publicIpAddress]" --output table
  info "タグ ${TAG_FILTER_KEY}=${TAG_FILTER_VALUE} が付いた SSH 鍵"
  aws_ls get-key-pairs --query "keyPairs${tag_query}.[name,createdAt]" --output table
  info "静的 IP（タグ非対応のため名前で表示）"
  aws_ls get-static-ip --static-ip-name "$LIGHTSAIL_STATIC_IP_NAME" --query 'staticIp.[name,ipAddress,attachedTo]' --output table 2>/dev/null || echo "（${LIGHTSAIL_STATIC_IP_NAME} はありません）"
  info "自動スナップショット（タグは引き継がれないため、インスタンス名で表示）"
  aws_ls get-auto-snapshots --resource-name "$LIGHTSAIL_INSTANCE_NAME" --query 'autoSnapshots[].[date,status]' --output table 2>/dev/null || echo "（なし）"
  exit 0
fi

ip="$(static_ip)"
compose="$(remote_compose_prefix "${REMOTE_BASE}/current/deploy/compose.prod.yml")"

case "$cmd" in
  status)
    remote "$ip" "${compose} ps; echo; df -h /; echo; free -m; echo; readlink ${REMOTE_BASE}/current"
    ;;
  logs)
    service="${1:-web}"
    [[ "$service" =~ ^(web|caddy|db)$ ]] || die "サービスは web / caddy / db のどれかです"
    remote_tty "$ip" "${compose} logs --tail 200 -f ${service}"
    ;;
  ssh)
    remote_tty "$ip"
    ;;
  collect)
    # 本番では管理画面（候補のレビュー）が無効なので、候補を保存しないドライランだけを許可する
    args=()
    for a in "$@"; do
      [[ "$a" =~ ^[A-Za-z0-9:._/=-]+$ ]] || die "引数に使えない文字が含まれています: ${a}"
      [[ "$a" == "--dry-run" ]] || args+=("$a")
    done
    ((${#args[@]} > 0)) || die "対象を指定してください（例: ./deploy/ops.sh collect --all）"
    remote "$ip" "${compose} run --rm tools ${args[*]} --dry-run"
    ;;
  backup)
    mkdir -p "${DEPLOY_DIR}/backups"
    out="${DEPLOY_DIR}/backups/miruriku-$(date +%Y%m%d-%H%M%S).dump"
    info "DB をダンプします: ${out}"
    remote "$ip" "${compose} exec -T db pg_dump -U miruriku -d miruriku -Fc" >"$out"
    chmod 600 "$out"
    [[ -s "$out" ]] || die "ダンプが空です"
    info "保存しました（$(du -h "$out" | cut -f1)）。復元方法は docs/deploy.md を参照"
    ;;
  restart)
    remote "$ip" "${compose} restart web caddy"
    ;;
  allow-ssh)
    if [[ -n "${1:-}" ]]; then
      [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$ ]] || die "CIDR の形式が不正です: $1"
      SSH_ALLOWED_CIDR="$1"
    fi
    apply_firewall "$(current_ssh_cidr)"
    ;;
  -h | --help | help)
    usage 0
    ;;
  *)
    usage 1
    ;;
esac
