ARG APP_IMAGE=ghcr.io/gottschalkfelix4-source/sharedrive@sha256:0c2185b76b2b63475ec1b7f319d725c37b5ffd2a73e6ad6766ac46047fcb41fb
ARG MINIO_IMAGE=ghcr.io/gottschalkfelix4-source/sharedrive-minio@sha256:7375f98534db7f3580fe7a6716090d9ca4f38739e7a147a5fa118874ba5f3b7c

FROM ${APP_IMAGE} AS app
FROM ${MINIO_IMAGE} AS minio
FROM clamav/clamav:1.4.3@sha256:75fb5fd95fcbe1d7e6d240c369c1572b686ee2c95949d1042b5148de8eddebb4 AS clamav-seed

FROM postgres:16-bookworm@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4 AS postgres-runtime

# Keep the official PostgreSQL filesystem without its unused anonymous volume or exposed database port.
FROM scratch
COPY --from=postgres-runtime / /
LABEL org.opencontainers.image.source="https://github.com/gottschalkfelix4-source/sharedrive" \
      org.opencontainers.image.title="ShareDrive AIO for Unraid" \
      org.opencontainers.image.description="ShareDrive, PostgreSQL 16, Redis, MinIO and ClamAV in one supervised container" \
      org.opencontainers.image.licenses="MIT AND PostgreSQL AND BSD-3-Clause AND AGPL-3.0-only AND GPL-2.0-or-later" \
      io.sharedrive.minio.upstream.source="https://github.com/minio/minio" \
      io.sharedrive.minio.upstream.revision="9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       bash ca-certificates clamav-daemon clamav-freshclam curl gosu \
       libstdc++6 openssl python3 redis-server supervisor \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 node \
    && useradd --uid 1000 --gid node --create-home --shell /bin/bash node \
    && mkdir -p /data /opt/sharedrive/aio /usr/share/doc/sharedrive /usr/share/doc/nodejs

COPY --from=app /usr/local/bin/node /usr/local/bin/node
COPY --from=app /usr/local/LICENSE /usr/share/doc/nodejs/LICENSE
COPY --from=app --chown=node:node /app /app
COPY --from=minio /usr/local/bin/minio /usr/local/bin/minio
COPY --from=minio /usr/share/doc/minio/LICENSE /usr/share/doc/minio/LICENSE
COPY --from=clamav-seed /var/lib/clamav/*.cvd /opt/sharedrive/clamav-seed/
COPY LICENSE /usr/share/doc/sharedrive/LICENSE
COPY backend/src/lib/environmentSettings.json /opt/sharedrive/aio/environment-settings.json
COPY unraid/aio/entrypoint.sh unraid/aio/entrypoint.py unraid/aio/service.py \
     unraid/aio/healthcheck.py unraid/aio/healthcheck.sh \
     unraid/aio/supervisord.conf unraid/aio/clamd.conf unraid/aio/freshclam.conf /opt/sharedrive/aio/
RUN chmod 755 /opt/sharedrive/aio/entrypoint.sh /opt/sharedrive/aio/healthcheck.sh \
    && node --version \
    && minio --version \
    && /usr/lib/postgresql/16/bin/postgres --version \
    && redis-server --version \
    && clamd --version

WORKDIR /app
ENV LANG=en_US.utf8 \
    PG_MAJOR=16 \
    NODE_ENV=production \
    PGDATA=/data/postgres \
    SETUP_TOKEN_FILE=/data/.setup/token
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
    CMD ["python3", "/opt/sharedrive/aio/healthcheck.py"]
ENTRYPOINT ["/opt/sharedrive/aio/entrypoint.sh"]
CMD []
