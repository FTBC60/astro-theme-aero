FROM node:24.22.1-bookworm-slim

ARG SUPERCRONIC_VERSION=v0.2.51
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tzdata \
    && case "$(dpkg --print-architecture)" in \
         amd64) arch=amd64; checksum=cc232108374e8e2b537045f2d5eaa1229f619db314c3ba6a14d38b35dc0aa123 ;; \
         arm64) arch=arm64; checksum=4ae22576a78223d8ccdf5f3b3660a5cbb5288416bf0ca96afc4a36d195932b94 ;; \
         *) echo 'Unsupported publisher architecture' >&2; exit 1 ;; \
       esac \
    && curl -fsSL "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${arch}" -o /usr/local/bin/supercronic \
    && echo "${checksum}  /usr/local/bin/supercronic" | sha256sum -c - \
    && chmod +x /usr/local/bin/supercronic \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund && npm cache clean --force
COPY tools/deploy.mjs tools/export.mjs tools/scheduler.mjs ./tools/
COPY tools/lib ./tools/lib
RUN mkdir -p /theme /data \
    && printf '* * * * * echo scheduler-check\n' > /tmp/check.crontab \
    && supercronic -test /tmp/check.crontab \
    && rm /tmp/check.crontab

ENV PUBLISHER_DATA_DIR=/data \
    THEME_DIR=/theme \
    CRON_SCHEDULE="0 3 * * *" \
    TZ=UTC \
    CI=true \
    WRANGLER_SEND_METRICS=false
ENTRYPOINT ["node", "tools/scheduler.mjs"]
CMD ["schedule"]
