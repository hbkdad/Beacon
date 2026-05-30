#!/bin/sh
# Initialize Hermes config on first run, then start the gateway

HERMES_DIR="$HOME/.hermes"
mkdir -p "$HERMES_DIR"

# Write minimal config from environment variables if not already present
if [ ! -f "$HERMES_DIR/config.yaml" ]; then
  cat > "$HERMES_DIR/config.yaml" <<EOF
gateway:
  port: ${HERMES_PORT:-8080}
  secret: "${HERMES_SECRET:-}"

providers:
  anthropic:
    api_key: "${ANTHROPIC_API_KEY:-}"
    model: "${ANTHROPIC_MODEL:-claude-sonnet-4-6}"
  openai:
    api_key: "${OPENAI_API_KEY:-}"
  ollama:
    base_url: "${OLLAMA_BASE_URL:-}"

channels:
  telegram:
    token: "${TELEGRAM_TOKEN:-}"
  discord:
    token: "${DISCORD_TOKEN:-}"

memory:
  enabled: true
  path: "${HERMES_DIR}/memory"
EOF
fi

exec hermes gateway
