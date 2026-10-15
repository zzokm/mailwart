# Rav Webmail — Modern Next.js 16 + React 19 + Rust Axum webmail client
# Upstream repository: https://github.com/naust-mail/rav
# Packaged container image: ghcr.io/naust-mail/rav:latest
FROM ghcr.io/naust-mail/rav:latest

# Internal cluster defaults for communication with Stalwart Mail Server
ENV IMAP_HOST=stalwart-mail \
    IMAP_PORT=993 \
    SMTP_HOST=stalwart-mail \
    SMTP_PORT=587 \
    TLS_ENABLED=true \
    DATA_DIR=/data \
    PORT=3001 \
    RUST_LOG=info

EXPOSE 3001
