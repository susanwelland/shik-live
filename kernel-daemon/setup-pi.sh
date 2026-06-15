#!/usr/bin/env bash
# Set up the SHIK kernel daemon on a Raspberry Pi (or any Debian/Ubuntu host).
# Installs Node 20 LTS if missing, installs deps, and registers a systemd
# service so the kernel runs on boot and restarts on failure.
#
# Usage:  ./kernel-daemon/setup-pi.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_USER="${SUDO_USER:-$(whoami)}"
DATA_DIR="${HOME}/.shik"

echo "==> SHIK kernel daemon setup"
echo "    repo:    ${REPO_DIR}"
echo "    user:    ${SERVICE_USER}"
echo "    data:    ${DATA_DIR}"

# 1. Node 20 LTS
if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js 20 LTS"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "==> Node already present: $(node -v)"
fi

# 2. Dependencies
echo "==> Installing npm dependencies"
cd "${REPO_DIR}"
npm install

# 3. Data directory
mkdir -p "${DATA_DIR}"

# 4. systemd service (generated so paths/user match this host)
UNIT=/etc/systemd/system/shik-kernel.service
echo "==> Installing systemd unit at ${UNIT}"
sudo tee "${UNIT}" >/dev/null <<UNITEOF
[Unit]
Description=SHIK Self-Hosted Identity Kernel daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${REPO_DIR}
Environment=PORT=4710
Environment=SHIK_NAME=pi-kernel
Environment=SHIK_DATA=${DATA_DIR}/kernel.json
Environment=SHIK_ROLES=research_companion,org:HappyAlien
ExecStart=/usr/bin/npx tsx kernel-daemon/server.ts
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNITEOF

sudo systemctl daemon-reload
sudo systemctl enable --now shik-kernel

echo "==> Done. The SHIK kernel is running and will start on boot."
echo "    Check:   systemctl status shik-kernel"
echo "    Logs:    journalctl -u shik-kernel -f"
echo "    Whoami:  curl -s localhost:4710/shik/whoami"
