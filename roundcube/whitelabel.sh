#!/bin/bash
# Apply Mailwart whitelabel branding post container setup
cp -f /usr/src/roundcubemail/skins/elastic/images/logo.svg /var/www/html/skins/elastic/images/logo.svg
cp -f /usr/src/roundcubemail/skins/elastic/images/favicon.ico /var/www/html/skins/elastic/images/favicon.ico
cp -f /usr/src/roundcubemail/skins/elastic/images/favicon.ico /var/www/html/favicon.ico 2>/dev/null || true

if ! grep -q "Mailwart Theme Integration" /var/www/html/skins/elastic/styles/styles.min.css 2>/dev/null; then
    cat /usr/src/roundcubemail/skins/elastic/styles/theme-override.css >> /var/www/html/skins/elastic/styles/styles.min.css
fi
if ! grep -q "Mailwart Theme Integration" /var/www/html/skins/elastic/styles/styles.css 2>/dev/null; then
    cat /usr/src/roundcubemail/skins/elastic/styles/theme-override.css >> /var/www/html/skins/elastic/styles/styles.css
fi
