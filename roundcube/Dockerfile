# Roundcube with the em_sso plugin and Stalwart integration config baked in.
# These used to be bind mounts, but Dokploy re-clones the repo directory on every
# deploy, which leaves running containers bound to a deleted inode (an empty plugin
# directory, so SSO silently stops working). Shipping them in the image avoids that.
FROM roundcube/roundcubemail:1.6.11-apache

RUN ln -s /var/www/html /var/www/html/webmail

COPY config/integration.inc.php /var/roundcube/config/integration.inc.php
COPY plugins/em_sso /var/www/html/plugins/em_sso
COPY plugins/em_sso /usr/src/roundcubemail/plugins/em_sso

# Whitelabel branding: Mailwart logo, favicon, templates, and theme styles in both /usr/src and /var/www
COPY logo.svg /usr/src/roundcubemail/skins/elastic/images/logo.svg
COPY logo.svg /var/www/html/skins/elastic/images/logo.svg
COPY favicon.ico /usr/src/roundcubemail/skins/elastic/images/favicon.ico
COPY favicon.ico /var/www/html/skins/elastic/images/favicon.ico
COPY favicon.ico /var/www/html/favicon.ico
COPY login.html /usr/src/roundcubemail/skins/elastic/templates/login.html
COPY login.html /var/www/html/skins/elastic/templates/login.html
COPY watermark.html /usr/src/roundcubemail/skins/elastic/watermark.html
COPY watermark.html /var/www/html/skins/elastic/watermark.html
COPY watermark.html /usr/src/roundcubemail/watermark.html
COPY watermark.html /var/www/html/watermark.html
COPY menu.html /usr/src/roundcubemail/skins/elastic/templates/includes/menu.html
COPY menu.html /var/www/html/skins/elastic/templates/includes/menu.html
COPY theme-override.css /usr/src/roundcubemail/skins/elastic/styles/theme-override.css
COPY theme-override.css /var/www/html/skins/elastic/styles/theme-override.css

RUN cat /usr/src/roundcubemail/skins/elastic/styles/theme-override.css >> /usr/src/roundcubemail/skins/elastic/styles/styles.min.css \
    && cat /usr/src/roundcubemail/skins/elastic/styles/theme-override.css >> /usr/src/roundcubemail/skins/elastic/styles/styles.css \
    && cat /var/www/html/skins/elastic/styles/theme-override.css >> /var/www/html/skins/elastic/styles/styles.min.css \
    && cat /var/www/html/skins/elastic/styles/theme-override.css >> /var/www/html/skins/elastic/styles/styles.css

# Entrypoint task hook to re-apply whitelabel branding on container startup
COPY whitelabel.sh /entrypoint-tasks/post-setup/10-whitelabel.sh
RUN chmod +x /entrypoint-tasks/post-setup/10-whitelabel.sh
