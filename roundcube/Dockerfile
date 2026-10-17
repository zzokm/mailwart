# Roundcube with the em_sso plugin and Stalwart integration config baked in.
# These used to be bind mounts, but Dokploy re-clones the repo directory on every
# deploy, which leaves running containers bound to a deleted inode (an empty plugin
# directory, so SSO silently stops working). Shipping them in the image avoids that.
FROM roundcube/roundcubemail:1.6.11-apache

RUN ln -s /var/www/html /var/www/html/webmail

COPY config/integration.inc.php /var/roundcube/config/integration.inc.php
COPY plugins/em_sso /var/www/html/plugins/em_sso

# Whitelabel branding: Mailwart logo, favicon, and theme styles
COPY logo.svg /var/www/html/skins/elastic/images/logo.svg
COPY favicon.ico /var/www/html/skins/elastic/images/favicon.ico
COPY theme-override.css /var/www/html/skins/elastic/styles/theme-override.css
RUN cat /var/www/html/skins/elastic/styles/theme-override.css >> /var/www/html/skins/elastic/styles/styles.min.css \
    && cat /var/www/html/skins/elastic/styles/theme-override.css >> /var/www/html/skins/elastic/styles/styles.css
