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
INSTALL_DIR="${SELFCLAWY_DIR:-$HOME/selfclawy}"

# ── Headless mode ─────────────────────────────────────────────────────────────
# Set these env vars for zero-interaction install:
#   SC_API_KEY      — Anthropic API key
#   SC_PASSWORD     — Dashboard password
#   SC_TG_TOKEN     — Telegram bot token
#   SC_PHONE        — Allowed phone (E.164)
#   SC_BACKENDS     — "" | "hermes" | "ollama" | "hermes,ollama"
#   SC_WEBHOOK_URL  — Alert webhook URL
HEADLESS=false
[[ -n "${SC_API_KEY}${SC_PASSWORD}${SC_BACKENDS}" ]] && HEADLESS=true

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

  # ── Auto-generate secrets ──────────────────────────────────────────────────
  secret=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
  sed -i "s|OPENCLAW_SECRET=.*|OPENCLAW_SECRET=$secret|" .env

  if [[ "$HEADLESS" == "true" ]]; then
    # Non-interactive mode — use SC_* env vars
    echo -e "${CYAN}Headless mode — using environment variables${NC}"
    [[ -n "$SC_API_KEY" ]]     && sed -i "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$SC_API_KEY|" .env
    [[ -n "$SC_PASSWORD" ]]    && sed -i "s|DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$SC_PASSWORD|" .env
    [[ -n "$SC_TG_TOKEN" ]]    && sed -i "s|TELEGRAM_TOKEN=.*|TELEGRAM_TOKEN=$SC_TG_TOKEN|" .env
    [[ -n "$SC_PHONE" ]]       && sed -i "s|OPENCLAW_ALLOW_FROM=.*|OPENCLAW_ALLOW_FROM=$SC_PHONE|" .env
    [[ -n "$SC_WEBHOOK_URL" ]] && sed -i "s|ALERT_WEBHOOK_URL=.*|ALERT_WEBHOOK_URL=$SC_WEBHOOK_URL|" .env
    compose_profiles="${SC_BACKENDS:-}"
  else
    echo ""
    echo -e "${BOLD}Let's configure your instance:${NC}"
    echo ""

    read -rp "  Anthropic API key (sk-ant-...): " api_key
    [[ -n "$api_key" ]] && sed -i "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$api_key|" .env

    read -rp "  Telegram bot token (leave blank to skip): " tg_token
    [[ -n "$tg_token" ]] && sed -i "s|TELEGRAM_TOKEN=.*|TELEGRAM_TOKEN=$tg_token|" .env

    read -rp "  Your phone number in E.164 format (e.g. +15555550123): " phone
    [[ -n "$phone" ]] && sed -i "s|OPENCLAW_ALLOW_FROM=.*|OPENCLAW_ALLOW_FROM=$phone|" .env

    read -rp "  Dashboard password (leave blank for 'changeme'): " dash_pass
    [[ -n "$dash_pass" ]] && sed -i "s|DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$dash_pass|" .env

    read -rp "  Enable multi-user JWT auth? (y/N): " use_jwt
    if [[ "$use_jwt" =~ ^[Yy]$ ]]; then
      sed -i "s|AUTH_MODE=.*|AUTH_MODE=jwt|" .env
      jwt_secret=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
      sed -i "s|JWT_SECRET=.*|JWT_SECRET=$jwt_secret|" .env
      echo -e "  ${GREEN}✓ JWT auth enabled${NC}"
    fi

    read -rp "  Alert webhook URL (Discord/Telegram, leave blank to skip): " webhook_url
    [[ -n "$webhook_url" ]] && sed -i "s|ALERT_WEBHOOK_URL=.*|ALERT_WEBHOOK_URL=$webhook_url|" .env

    echo ""
    echo -e "${BOLD}  Optional backends (adds to docker-compose):${NC}"
    echo -e "    a) OpenClaw only  — lightweight Node.js gateway (default)"
    echo -e "    b) + Hermes Agent — Python gateway with memory, skills, cron (~180s startup)"
    echo -e "    c) + Ollama       — local LLM runner; zero API cost (needs 8+ GB RAM)"
    echo -e "    d) Both Hermes + Ollama"
    read -rp "  Your choice [a]: " backend_choice

    case "$backend_choice" in
      b|B) compose_profiles="hermes" ;;
      c|C) compose_profiles="ollama" ;;
      d|D) compose_profiles="hermes,ollama" ;;
      *) compose_profiles="" ;;
    esac
  fi

  if [[ -n "$compose_profiles" ]]; then
    sed -i "s|COMPOSE_PROFILES=.*|COMPOSE_PROFILES=$compose_profiles|" .env
    echo -e "  ${GREEN}✓ Profiles: $compose_profiles${NC}"
  fi

  if [[ "$compose_profiles" == *"hermes"* ]]; then
    hermes_secret=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
    sed -i "s|HERMES_SECRET=.*|HERMES_SECRET=$hermes_secret|" .env
    if [[ "$compose_profiles" == *"ollama"* ]]; then
      sed -i "s|OLLAMA_BASE_URL=.*|OLLAMA_BASE_URL=http://ollama:11434|" .env
      echo -e "  ${GREEN}✓ Hermes configured to use Ollama for local models${NC}"
    fi
    echo -e "  ${YELLOW}Note: Hermes Agent takes ~3 min to install on first start${NC}"
  fi

  if [[ "$compose_profiles" == *"ollama"* ]] && command -v nvidia-smi &>/dev/null; then
    echo -e "  ${GREEN}✓ NVIDIA GPU detected — for GPU acceleration, use:${NC}"
    echo -e "  ${CYAN}  docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d${NC}"
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
  echo -e "  OpenClaw gateway:    ${CYAN}http://$server_ip:18789${NC}"
  echo -e "  SelfClawy dashboard: ${CYAN}http://$server_ip:3001${NC}"
  if grep -q "hermes" "$INSTALL_DIR/.env" 2>/dev/null && grep -q "COMPOSE_PROFILES=.*hermes" "$INSTALL_DIR/.env" 2>/dev/null; then
    hermes_port=$(grep "^HERMES_PORT=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "8080")
    echo -e "  Hermes Agent UI:     ${CYAN}http://$server_ip:${hermes_port:-8080}${NC}"
  fi
  if grep -q "COMPOSE_PROFILES=.*ollama" "$INSTALL_DIR/.env" 2>/dev/null; then
    ollama_port=$(grep "^OLLAMA_PORT=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "11434")
    echo -e "  Ollama API:          ${CYAN}http://$server_ip:${ollama_port:-11434}${NC}"
  fi
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
