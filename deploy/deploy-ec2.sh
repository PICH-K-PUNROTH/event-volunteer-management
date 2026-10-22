#!/usr/bin/env bash
# One-command deployment of the whole stack on a single Ubuntu 24.04 EC2 instance.
# Usage (from the project root or from this folder):  bash deploy/deploy-ec2.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1/5 Checking Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi
D="docker"
docker info >/dev/null 2>&1 || D="sudo docker"

echo "==> 2/5 Making sure there is swap (small instances run out of memory while building)"
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if [ "${SWAP_MB:-0}" -lt 1024 ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> 3/5 Checking the root .env file"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Edit it (nano .env), then run this script again."
  exit 1
fi
if grep -q 'change-me' .env; then
  echo "JWT_SECRET in .env is still the placeholder. Generate one with: openssl rand -hex 32"
  exit 1
fi

echo "==> 4/5 Building and starting the containers"
$D compose up -d --build

echo "==> 5/5 Waiting for the gateway to answer"
for i in $(seq 1 40); do
  if curl -fs http://localhost:3000/health >/dev/null 2>&1; then
    echo; curl -s http://localhost:3000/health; echo
    $D compose ps
    PUBLIC_IP=$(curl -s --max-time 2 http://checkip.amazonaws.com || true)
    echo "Gateway URL for Postman: http://${PUBLIC_IP:-<EC2-PUBLIC-IP>}:3000"
    exit 0
  fi
  sleep 3
done
echo "Gateway did not become healthy in time. Check: $D compose logs --tail 50"
exit 1
