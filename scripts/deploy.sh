#!/usr/bin/env bash
# ============================================================
# SelfClawy Update Script
# Run this to pull latest changes and restart
# Usage: curl -fsSL https://raw.githubusercontent.com/hbkdad/selfclawy/main/scripts/deploy.sh | bash
# ============================================================
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="${SELFCLAWY_DIR:-$HOME/selfclawy}"

echo -e "${CYAN}${BOLD}SelfClawy Update${NC}"
echo ""

if [[ ! -d "$INSTALL_DIR" ]]; then
  echo -e "${RED}Error: $INSTALL_DIR not found. Run install.sh first.${NC}"
  exit 1
fi

echo -e "${CYAN}Pulling latest changes...${NC}"
git -C "$INSTALL_DIR" pull --ff-only

echo -e "${CYAN}Rebuilding containers...${NC}"
cd "$INSTALL_DIR"
docker compose pull --quiet 2>/dev/null || true
docker compose up -d --build --remove-orphans

echo ""
echo -e "${GREEN}${BOLD}✓ SelfClawy updated successfully!${NC}"
echo ""
local_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
echo -e "  Dashboard: ${CYAN}http://$local_ip:3001${NC}"
echo ""
