# NaiaEnv — Minimal WSL2 distro for Naia OS Tier 2
# Builds a rootfs tar.gz that can be imported via: wsl --import NaiaEnv <path> <tar>
#
# Contents: Node.js 22 + OpenClaw Gateway + basic tools
# Target size: ~250MB compressed

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Essential packages only
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 LTS via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# OpenClaw Gateway — install to /opt/naia/openclaw/
RUN mkdir -p /opt/naia/openclaw \
    && cd /opt/naia/openclaw \
    && npm init -y \
    && npm install openclaw@latest \
    && npm cache clean --force

# WSL configuration
COPY wsl.conf /etc/wsl.conf

# Default user setup (WSL uses root by default for imported distros)
RUN echo 'export PATH="/opt/naia/openclaw/node_modules/.bin:$PATH"' >> /root/.bashrc

# Health check script
COPY healthcheck.sh /opt/naia/healthcheck.sh
RUN chmod +x /opt/naia/healthcheck.sh

CMD ["/bin/bash"]
