#!/usr/bin/env bash
# 手元のリポジトリの HEAD（コミット済みの内容）を Lightsail インスタンスへデプロイする。
#
#   ./deploy/deploy.sh                    # ビルド → マイグレーション → 実在データの反映 → 起動 → 確認
#   ./deploy/deploy.sh --skip-data-load   # 実在データ（data/real-events.ts）の反映を行わない
#   ./deploy/deploy.sh --allow-dirty      # 未コミットの変更があっても続ける（デプロイされるのは HEAD のみ）
#
# 流れ:
#   1. git archive で HEAD をサーバーの /opt/miruriku/releases/<日時>-<コミット> に展開
#   2. 初回だけ DB パスワードをサーバー上で生成（/opt/miruriku/shared/secrets.env。手元には保存しない）
#   3. サーバー上で docker compose build（web / migrate / tools）
#   4. prisma migrate deploy → pnpm data:load 相当 → web・caddy を起動
#   5. https://<ドメイン>/api/health と /admin（404 になること）を確認
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

skip_data_load=false
allow_dirty=false
for arg in "$@"; do
  case "$arg" in
    --skip-data-load) skip_data_load=true ;;
    --allow-dirty) allow_dirty=true ;;
    -h | --help)
      awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
      exit 0
      ;;
    *) die "不明なオプション: ${arg}（--help を参照）" ;;
  esac
done

require_commands aws ssh git curl tar gzip
load_config
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

ip="$(static_ip)"
domain="$(public_domain "$ip")"
release="$(date +%Y%m%d%H%M%S)-${commit}"
release_dir="${REMOTE_BASE}/releases/${release}"
compose_file="${release_dir}/deploy/compose.prod.yml"
compose="$(remote_compose_prefix "$compose_file")"

info "デプロイ先: ${domain}（${ip}）、コミット ${commit}"

# --- 1. ソースの転送 ------------------------------------------------------
info "ソースを転送します（git archive HEAD）"
git archive --format=tar HEAD | gzip | remote "$ip" "mkdir -p '${release_dir}' && tar -xz -C '${release_dir}'"

# --- 2. 環境変数ファイル ---------------------------------------------------
# DB パスワードはサーバー上で 1 回だけ生成し、以後は変えない（変えると既存の DB に接続できなくなる）
remote "$ip" "set -e; umask 077; f='${REMOTE_BASE}/shared/secrets.env'; if [ ! -s \"\$f\" ]; then printf 'POSTGRES_PASSWORD=%s\n' \"\$(openssl rand -hex 24)\" > \"\$f\"; echo 'DB パスワードを生成しました'; fi"

# 秘密ではない設定は毎回書き出す。値は compose の env ファイル形式に合わせて単一引用符で囲む
quote_env() { printf "'%s'" "${1//\'/}"; }
{
  printf 'RELEASE=%s\n' "$(quote_env "$release")"
  printf 'DOMAIN=%s\n' "$(quote_env "$domain")"
  printf 'COLLECTOR_USER_AGENT=%s\n' "$(quote_env "$COLLECTOR_USER_AGENT")"
} | remote "$ip" "umask 077; cat > '${REMOTE_BASE}/shared/settings.env'"

# --- 3〜4. ビルド・マイグレーション・データ反映・起動 -----------------------------------
info "サーバー上でイメージをビルドします（初回は 10 分ほどかかります）"
remote "$ip" "cd '${release_dir}' && ${compose} --profile tasks build"

info "DB を起動し、マイグレーションを適用します"
remote "$ip" "${compose} up -d --wait db && ${compose} run --rm migrate"

if $skip_data_load; then
  info "実在データの反映は行いません（--skip-data-load）"
else
  info "実在の大会データ（data/real-events.ts）を反映します"
  remote "$ip" "${compose} run --rm --entrypoint ./node_modules/.bin/tsx tools scripts/load-real-events.ts"
fi

info "Web と Caddy を起動します"
remote "$ip" "${compose} up -d --wait --remove-orphans web caddy"

# 現在のリリースを記録し、古いリリースと使われなくなったイメージを片付ける（直近 3 件を残す）
remote "$ip" "set -e
ln -sfn '${release_dir}' '${REMOTE_BASE}/current'
cd '${REMOTE_BASE}/releases' && ls -1t | tail -n +4 | xargs -r rm -rf
docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^miruriku-(web|migrate|tools):' | grep -v ':${release}\$' | xargs -r docker rmi >/dev/null 2>&1 || true
docker image prune -f >/dev/null
docker builder prune -f --filter until=168h >/dev/null"

# --- 5. 動作確認 ----------------------------------------------------------
info "公開 URL を確認します（初回は HTTPS 証明書の取得に 1 分ほどかかります）"
if ! curl -fsS --retry 20 --retry-delay 6 --retry-all-errors --max-time 15 "https://${domain}/api/health" >/dev/null; then
  die "https://${domain}/api/health に接続できません。./deploy/ops.sh logs caddy / ./deploy/ops.sh logs web でログを確認してください"
fi
admin_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://${domain}/admin")"
[[ "$admin_status" == "404" ]] || die "/admin が 404 になりません（HTTP ${admin_status}）。公開を止めて設定を確認してください"
top_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "https://${domain}/")"
[[ "$top_status" == "200" ]] || warn "トップページが HTTP ${top_status} を返しました。./deploy/ops.sh logs web を確認してください"

cat <<DONE

デプロイが完了しました（コミット ${commit}）。
  公開 URL: https://${domain}/
  管理画面: 本番では無効（/admin は 404）
DONE
