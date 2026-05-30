FROM python:3.11-slim

# System deps: git for clone, ripgrep for file search, ffmpeg for audio, Node.js for TS components
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
      git curl ripgrep ffmpeg ca-certificates gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install uv (fast Python package manager)
RUN pip install --no-cache-dir uv

# Clone and install Hermes Agent
RUN git clone https://github.com/NousResearch/hermes-agent /opt/hermes --depth=1 && \
    cd /opt/hermes && \
    uv pip install --system -e ".[all]" --quiet

WORKDIR /root
EXPOSE 8080

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
