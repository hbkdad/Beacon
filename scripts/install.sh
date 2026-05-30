#!/usr/bin/env bash
# ============================================================
# SelfClawy Installer
# One-command OpenClaw deployment on any Linux VPS
# ============================================================
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

REPO_URL="https://github.com/hbkdad/selfclawy"
INSTALL_DIR="$HOME/selfclawy"

print_banner() {
  echo -e "${CYAN}"
  echo '  ____       _  __ ____ _                         '
  echo ' / ___|  ___| |/ _/ ___| | __ _ _ __ __  ___   _ '
  echo ' \___ \ / _ \ | |_| |   | |/ _` | `_ \\ \/ / | | |'
  echo '  ___) |  __/ |  _| |___| | (_| | | | |>  <| |_| |'
  echo ' |____/ \___|_|_|  \____|_|\__,_|_| |_/_/\_\\__, |'
  echo '                                             |___/ '
  echo -e "${NC}"
  echo -e "${BOLD}  Self-hosted OpenClaw — Free alternative to Clawy${NC}\n"
}

check_root() {
  if [[ $EUID -eq 0 ]]; then
    echo -e "${YELLOW}Warning: Running as root. Consider using a non-root user.${NC}"
  fi
}

install_docker() {
  if command -v docker &>/dev/null; then
    echo -e "${GREEN}✓ Docker already installed${NC}"
    return
  fi
  echo -e "${CYAN}Installing Docker...${NC}"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
  echo -e "${GREEN}✓ Docker installed${NC}"
}

install_compose() {
  if docker compose version &>/dev/null 2>&1; then
    echo -e "${GREEN}✓ Docker Compose already available${NC}"
    return
  fi
  echo -e "${CYAN}Installing Docker Compose plugin...${NC}"
  DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
  mkdir -p "$DOCKER_CONFIG/cli-plugins"
  curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
    -o "$DOCKER_CONFIG/cli-plugins/docker-compose"
  chmod +x "$DOCKER_CONFIG/cli-plugins/docker-compose"
  echo -e "${GREEN}✓ Docker Compose installed${NC}"
}

clone_repo() {
  if [[ -d "$INSTALL_DIR" ]]; then
    echo -e "${YELLOW}Directory $INSTALL_DIR already exists — pulling latest...${NC}"
    git -C "$INSTALL_DIR" pull --ff-only
  else
    echo -e "${CYAN}Cloning SelfClawy...${NC}"
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
}

configure() {
  cd "$INSTALL_DIR"
  if [[ -f ".env" ]]; then
    echo -e "${YELLOW}.env already exists — skipping config.${NC}"
    return
  fi

  cp .env.example .env

  echo ""
  echo -e "${BOLD}Let's configure your instance:${NC}"
  echo ""

  read -rp "  Anthropic API key (sk-ant-...): " api_key
  if [[ -n "$api_key" ]]; then
    sed -i "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$api_key|" .env
  fi

  read -rp "  Telegram bot token (leave blank to skip): " tg_token
  if [[ -n "$tg_token" ]]; then
    sed -i "s|TELEGRAM_TOKEN=.*|TELEGRAM_TOKEN=$tg_token|" .env
  fi

  read -rp "  Your phone number in E.164 format (e.g. +15555550123): " phone
  if [[ -n "$phone" ]]; then
    sed -i "s|OPENCLAW_ALLOW_FROM=.*|OPENCLAW_ALLOW_FROM=$phone|" .env
  fi

  secret=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
  sed -i "s|OPENCLAW_SECRET=.*|OPENCLAW_SECRET=$secret|" .env

  read -rp "  Dashboard password (default: changeme): " dash_pass
  if [[ -n "$dash_pass" ]]; then
    sed -i "s|DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$dash_pass|" .env
  fi

  read -rp "  Enable multi-user JWT auth? (y/N): " use_jwt
  if [[ "$use_jwt" =~ ^[Yy]$ ]]; then
    sed -i "s|AUTH_MODE=.*|AUTH_MODE=jwt|" .env
    jwt_secret=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
    sed -i "s|JWT_SECRET=.*|JWT_SECRET=$jwt_secret|" .env
    echo -e "  ${GREEN}✓ JWT auth enabled${NC}"
  fi

  read -rp "  Alert webhook URL (Discord/Telegram, leave blank to skip): " webhook_url
  if [[ -n "$webhook_url" ]]; then
    sed -i "s|ALERT_WEBHOOK_URL=.*|ALERT_WEBHOOK_URL=$webhook_url|" .env
    echo -e "  ${GREEN}✓ Alert webhook configured${NC}"
  fi

  echo ""
  echo -e "${GREEN}✓ .env configured${NC}"
}

start_services() {
  cd "$INSTALL_DIR"
  echo -e "${CYAN}Starting SelfClawy...${NC}"
  docker compose up -d --build
  echo -e "${GREEN}✓ Services started${NC}"
}

print_success() {
  local server_ip
  server_ip=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || echo "YOUR_SERVER_IP")

  echo ""
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}${BOLD}  SelfClawy is running! 🦞${NC}"
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  OpenClaw dashboard:  ${CYAN}http://$server_ip:18789${NC}"
  echo -e "  SelfClawy dashboard: ${CYAN}http://$server_ip:3001${NC}"
  echo ""
  echo -e "  ${BOLD}Next steps:${NC}"
  echo -e "  1. Open the dashboard and verify the gateway is running"
  echo -e "  2. Connect a channel (Telegram is fastest)"
  echo -e "  3. Send a message — your lobster is waiting 🦞"
  echo ""
  echo -e "  Manage:  cd $INSTALL_DIR && docker compose [up/down/logs]"
  echo -e "  Docs:    https://docs.openclaw.ai"
  echo ""
}

main() {
  print_banner
  check_root

  echo -e "${CYAN}Checking dependencies...${NC}"
  command -v git &>/dev/null || { apt-get install -y git 2>/dev/null || yum install -y git; }
  command -v curl &>/dev/null || { apt-get install -y curl 2>/dev/null || yum install -y curl; }

  install_docker
  install_compose
  clone_repo
  configure
  start_services
  print_success
}

main "$@"
