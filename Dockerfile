FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
        curl \
        wget \
        ca-certificates \
        gnupg \
        unzip \
        xz-utils \
        git \
        build-essential \
        python3 \
        libgtk-3-0 \
        libgbm1 \
        libasound2 \
        libx11-xcb1 \
        libxcb1 \
        libxcomposite1 \
        libxcursor1 \
        libxdamage1 \
        libxi6 \
        libxtst6 \
        libnss3 \
        libcups2 \
        libdrm2 \
        libpango-1.0-0 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libnspr4 \
        libxrandr2 \
        libxfixes3 \
        libxss1 \
        fonts-liberation \
        libappindicator3-1 \
        libu2f-udev \
        xdg-utils \
        && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Buat direktori yang perlu write permission
RUN mkdir -p /app/files /app/data /app/logs /app/data/sessions /app/data/session && \
    chmod -R 777 /app/files /app/data /app/logs && \
    chown -R root:root /app/files /app/data /app/logs

# Copy app files
COPY package.json ./
RUN npm install

COPY server.js ./
COPY public/ ./public/

ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
