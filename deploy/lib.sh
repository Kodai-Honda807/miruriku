#!/usr/bin/env bash
# deploy/*.sh の共通処理。単体では実行しない（source して使う）。
# shellcheck disable=SC2034  # 呼び出し元のスクリプトで使う変数を定義する

set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${DEPLOY_DIR}/.." && pwd)"

# サーバー側の配置
REMOTE_USER="ubuntu"
REMOTE_BASE="/opt/miruriku"
COMPOSE_PROJECT="miruriku"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m警告:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31mエラー:\033[0m %s\n' "$*" >&2
  exit 1
}

require_commands() {
  local missing=() cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done
  if ((${#missing[@]} > 0)); then
    die "次のコマンドが見つかりません: ${missing[*]}（docs/deploy.md の「事前準備」を参照）"
  fi
}

load_config() {
  local env_file="${DEPLOY_DIR}/.env"
  [[ -f "$env_file" ]] || die "${env_file} がありません。cp deploy/.env.example deploy/.env で作成し、内容を確認してください"
  # CRLF（Windows 側のエディタで保存した場合）を検出する
  if grep -q $'\r' "$env_file"; then
    die "${env_file} の改行が CRLF です。LF に変換してください（例: sed -i 's/\\r\$//' deploy/.env）"
  fi
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a

  AWS_REGION="${AWS_REGION:-ap-northeast-1}"
  LIGHTSAIL_INSTANCE_NAME="${LIGHTSAIL_INSTANCE_NAME:-miruriku}"
  LIGHTSAIL_AVAILABILITY_ZONE="${LIGHTSAIL_AVAILABILITY_ZONE:-${AWS_REGION}a}"
  LIGHTSAIL_BUNDLE_ID="${LIGHTSAIL_BUNDLE_ID:-small_3_0}"
  LIGHTSAIL_BLUEPRINT_ID="${LIGHTSAIL_BLUEPRINT_ID:-}"
  LIGHTSAIL_STATIC_IP_NAME="${LIGHTSAIL_STATIC_IP_NAME:-miruriku-ip}"
  LIGHTSAIL_KEY_PAIR_NAME="${LIGHTSAIL_KEY_PAIR_NAME:-miruriku-key}"
  ENABLE_AUTO_SNAPSHOT="${ENABLE_AUTO_SNAPSHOT:-true}"
  AUTO_SNAPSHOT_TIME_UTC="${AUTO_SNAPSHOT_TIME_UTC:-18:00}"
  SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/miruriku-lightsail}"
  SSH_ALLOWED_CIDR="${SSH_ALLOWED_CIDR:-}"
  DOMAIN="${DOMAIN:-}"
  COLLECTOR_USER_AGENT="${COLLECTOR_USER_AGENT:-mirurikuBot/0.1 (+https://github.com/Kodai-Honda807/miruriku)}"
  KNOWN_HOSTS_FILE="$HOME/.ssh/miruriku_known_hosts"
  RESOURCE_TAGS="${RESOURCE_TAGS:-project=miruriku environment=production managed-by=miruriku-deploy}"
  parse_resource_tags

  case "$SSH_KEY_PATH" in
    /mnt/*) die "SSH_KEY_PATH は WSL のホーム配下（例: \$HOME/.ssh/miruriku-lightsail）にしてください。/mnt 配下では鍵の権限を 600 にできません" ;;
  esac
}

# RESOURCE_TAGS（"key=value key=value"）を検証し、AWS CLI の --tags 用の引数（TAG_ARGS）と
# 最初のタグ（一覧の絞り込みに使う TAG_FILTER_KEY / TAG_FILTER_VALUE）を用意する
parse_resource_tags() {
  TAG_ARGS=()
  local pair key value pairs=()
  local -A seen=()
  # 空白で分割する（ワイルドカードは展開しない）
  read -r -a pairs <<<"$RESOURCE_TAGS"
  for pair in "${pairs[@]}"; do
    [[ "$pair" == *=* ]] || die "RESOURCE_TAGS の形式が不正です（キー=値）: ${pair}"
    key="${pair%%=*}"
    value="${pair#*=}"
    [[ "$key" =~ ^[A-Za-z0-9+=._:/@-]{1,128}$ ]] || die "タグのキーに使えない文字があります: ${key}"
    [[ "$value" =~ ^[A-Za-z0-9+=._:/@-]{0,256}$ ]] || die "タグの値に使えない文字があります: ${value}"
    [[ "${key,,}" != aws:* ]] || die "aws: で始まるタグのキーは使えません: ${key}"
    [[ -z "${seen[$key]:-}" ]] || die "タグのキーが重複しています: ${key}"
    seen[$key]=1
    TAG_ARGS+=("key=${key},value=${value}")
    if [[ -z "${TAG_FILTER_KEY:-}" ]]; then
      TAG_FILTER_KEY="$key"
      TAG_FILTER_VALUE="$value"
    fi
  done
  ((${#TAG_ARGS[@]} > 0)) || die "RESOURCE_TAGS が空です。少なくとも 1 つ（例: project=miruriku）を指定してください"
  ((${#TAG_ARGS[@]} <= 50)) || die "タグは 1 リソースあたり 50 個までです"
}

# タグを付ける（既にあるタグは値を上書きする。何度実行してもよい）
tag_resource() {
  local name="$1"
  aws_ls tag-resource --resource-name "$name" --tags "${TAG_ARGS[@]}" >/dev/null
}

# AWS CLI（Lightsail）。AWS_PROFILE が設定されていればそのプロファイルを使う
aws_cli() {
  local args=(--region "$AWS_REGION" --no-cli-pager)
  if [[ -n "${AWS_PROFILE:-}" && -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
    args+=(--profile "$AWS_PROFILE")
  fi
  aws "${args[@]}" "$@"
}
aws_ls() { aws_cli lightsail "$@"; }

check_aws_identity() {
  local identity
  if ! identity="$(aws_cli sts get-caller-identity --query '[Account,Arn]' --output text 2>&1)"; then
    die "AWS の認証に失敗しました。aws configure / aws sso login --profile ${AWS_PROFILE:-<profile>} を確認してください: ${identity}"
  fi
  info "AWS アカウント: ${identity}"
}

static_ip() {
  local ip
  ip="$(aws_ls get-static-ip --static-ip-name "$LIGHTSAIL_STATIC_IP_NAME" --query 'staticIp.ipAddress' --output text 2>/dev/null || true)"
  [[ -n "$ip" && "$ip" != "None" ]] || die "静的 IP ${LIGHTSAIL_STATIC_IP_NAME} が見つかりません。先に deploy/provision.sh を実行してください"
  printf '%s' "$ip"
}

# 公開に使うドメイン。未設定なら sslip.io（IP をそのまま名前にするワイルドカード DNS）を使う
public_domain() {
  local ip="$1"
  if [[ -n "$DOMAIN" ]]; then
    printf '%s' "$DOMAIN"
  else
    sslip_domain "$ip"
  fi
}

# sslip.io の名前（IP をそのまま名前にするワイルドカード DNS）
sslip_domain() {
  local ip="$1"
  printf '%s.sslip.io' "${ip//./-}"
}

# 名前が指定の IPv4 アドレスに解決されるか（手元の DNS で確認する）
resolves_to() {
  local host="$1" ip="$2"
  getent ahostsv4 "$host" 2>/dev/null | awk '{print $1}' | grep -qxF "$ip"
}

# 公開ドメインへ 301 転送する名前（Caddy の REDIRECT_DOMAINS）。
#   - www.<公開ドメイン>（DNS で静的 IP に向いている場合だけ。向いていない名前は証明書を取得できないため）
#   - 独自ドメインを使う場合は、以前の sslip.io の URL（ブックマークや検索エンジンの評価を引き継ぐため）
# 必ず 1 つ以上返す（sslip.io の名前は常に静的 IP に解決される）。
redirect_domains() {
  local ip="$1" domain="$2" legacy list=()
  legacy="$(sslip_domain "$ip")"
  if resolves_to "www.${domain}" "$ip"; then list+=("www.${domain}"); fi
  if [[ "$domain" != "$legacy" ]]; then list+=("$legacy"); fi
  # 空にしない（sslip.io の www 付きの名前は常に静的 IP に解決される）
  if ((${#list[@]} == 0)); then list+=("www.${legacy}"); fi
  local IFS=,
  printf '%s' "${list[*]}" | sed 's/,/, /g'
}

ssh_opts() {
  printf '%s\n' -i "$SSH_KEY_PATH" \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=accept-new \
    -o UserKnownHostsFile="$KNOWN_HOSTS_FILE" \
    -o ServerAliveInterval=30 \
    -o ConnectTimeout=10
}

# リモートでコマンドを実行する（引数は 1 つのシェルコマンド文字列）
remote() {
  local ip="$1"
  shift
  local opts
  mapfile -t opts < <(ssh_opts)
  # shellcheck disable=SC2029  # コマンド文字列は手元で組み立ててから送る
  ssh "${opts[@]}" "${REMOTE_USER}@${ip}" "$@"
}

remote_tty() {
  local ip="$1"
  shift
  local opts
  mapfile -t opts < <(ssh_opts)
  ssh -t "${opts[@]}" "${REMOTE_USER}@${ip}" "$@"
}

# docker compose をリモートで実行するときの共通部分（compose ファイルは引数で指定）
remote_compose_prefix() {
  local compose_file="$1"
  printf 'docker compose -p %s --env-file %s/shared/secrets.env --env-file %s/shared/settings.env -f %s' \
    "$COMPOSE_PROJECT" "$REMOTE_BASE" "$REMOTE_BASE" "$compose_file"
}

current_ssh_cidr() {
  if [[ -n "$SSH_ALLOWED_CIDR" ]]; then
    printf '%s' "$SSH_ALLOWED_CIDR"
    return
  fi
  local ip
  ip="$(curl -fsS --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')" || die "グローバル IP を取得できませんでした。deploy/.env の SSH_ALLOWED_CIDR を設定してください"
  [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "グローバル IP の形式が不正です: ${ip}"
  printf '%s/32' "$ip"
}

# ファイアウォール: 80/443 は全体に公開、22 は指定した接続元だけ
apply_firewall() {
  local ssh_cidr="$1"
  info "ファイアウォールを設定します（SSH は ${ssh_cidr} のみ、HTTP/HTTPS は公開）"
  aws_ls put-instance-public-ports --instance-name "$LIGHTSAIL_INSTANCE_NAME" --port-infos "[
    {\"fromPort\":22,\"toPort\":22,\"protocol\":\"tcp\",\"cidrs\":[\"${ssh_cidr}\"]},
    {\"fromPort\":80,\"toPort\":80,\"protocol\":\"tcp\",\"cidrs\":[\"0.0.0.0/0\"],\"ipv6Cidrs\":[\"::/0\"]},
    {\"fromPort\":443,\"toPort\":443,\"protocol\":\"tcp\",\"cidrs\":[\"0.0.0.0/0\"],\"ipv6Cidrs\":[\"::/0\"]},
    {\"fromPort\":443,\"toPort\":443,\"protocol\":\"udp\",\"cidrs\":[\"0.0.0.0/0\"],\"ipv6Cidrs\":[\"::/0\"]}
  ]" >/dev/null
}

confirm() {
  local prompt="$1" expected="${2:-yes}" answer
  read -r -p "${prompt} [${expected} と入力]: " answer
  [[ "$answer" == "$expected" ]] || die "中止しました"
}
