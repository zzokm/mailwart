# Rav Webmail — Modern Next.js 16 + React 19 + Rust Axum webmail client
# Upstream repository: https://github.com/naust-mail/rav
# Official release: https://github.com/naust-mail/rav/releases/tag/v0.2.4+7e153c3

FROM debian:bookworm-slim AS runtime

ARG RAV_VERSION="v0.2.4%2B7e153c3"
ARG RAV_TARBALL="rav-email-server-linux-x86_64.tar.gz"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tar \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Download pre-built release package containing rav-email-server binary and static frontend export
RUN curl -fSL "https://github.com/naust-mail/rav/releases/download/${RAV_VERSION}/${RAV_TARBALL}" -o /tmp/rav.tar.gz \
    && tar -xzf /tmp/rav.tar.gz -C /app \
    && rm -f /tmp/rav.tar.gz \
    && chmod +x /app/rav-email-server

# Runtime environment defaults
ENV STATIC_DIR=/app/static \
    DATA_DIR=/data \
    PORT=3001 \
    HOST=0.0.0.0 \
    BASE_PATH= \
    RUST_LOG=info

# Internal cluster defaults for communication with Stalwart Mail Server
ENV IMAP_HOST=stalwart-mail \
    IMAP_PORT=993 \
    SMTP_HOST=stalwart-mail \
    SMTP_PORT=587 \
    TLS_ENABLED=true

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD curl -f http://127.0.0.1:3001/api/health || exit 1

CMD ["/app/rav-email-server"]
