#!/bin/bash
# Lightsail インスタンスの起動スクリプト（初回起動時に root で 1 回だけ実行される）。
# deploy/provision.sh が create-instances の --user-data として渡す。
# 内容: スワップ追加、Docker Engine と Compose プラグインの導入、ログの上限設定、配置先ディレクトリの作成。
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

# next build はメモリを多く使うため、2GB のスワップを追加する
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Docker 公式の apt リポジトリから導入する（BuildKit / Compose v2 を使うため）
apt-get update
apt-get install -y ca-certificates curl unattended-upgrades
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
# shellcheck disable=SC1091
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# コンテナのログがディスクを埋めないよう上限を設ける
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "local",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}
JSON
systemctl enable docker
systemctl restart docker
usermod -aG docker ubuntu

# セキュリティ更新を自動で適用する（Ubuntu の既定設定を有効化）
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

mkdir -p /opt/miruriku/releases /opt/miruriku/shared /opt/miruriku/backups
chown -R ubuntu:ubuntu /opt/miruriku
chmod 700 /opt/miruriku/shared

touch /opt/miruriku/.provisioned
