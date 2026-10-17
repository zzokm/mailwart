#!/bin/bash
set -e

# Apply Mailwart whitelabel branding post container setup

# 1. Custom Login template and Watermark empty state
if [ -f /usr/src/roundcubemail/skins/elastic/templates/login.html ]; then
    cp -f /usr/src/roundcubemail/skins/elastic/templates/login.html /var/www/html/skins/elastic/templates/login.html
fi
if [ -f /usr/src/roundcubemail/skins/elastic/watermark.html ]; then
    cp -f /usr/src/roundcubemail/skins/elastic/watermark.html /var/www/html/skins/elastic/watermark.html
fi

# 2. Enforce default dark mode on layout.html for unregistered / new visitors
sed -i 's/document\.cookie\.indexOf('\''colorMode=dark'\'') > -1/document.cookie.indexOf('\''colorMode=light'\'') === -1/g' /var/www/html/skins/elastic/templates/includes/layout.html 2>/dev/null || true
sed -i 's/document\.cookie\.indexOf('\''colorMode=dark'\'') > -1/document.cookie.indexOf('\''colorMode=light'\'') === -1/g' /usr/src/roundcubemail/skins/elastic/templates/includes/layout.html 2>/dev/null || true

# 3. Default dark mode in ui.js
sed -i 's/color_scheme\.matches ? '\''dark'\'' : '\''light'\''/'\''dark'\''/g' /var/www/html/skins/elastic/ui.js 2>/dev/null || true
sed -i 's/color_scheme\.matches ? '\''dark'\'' : '\''light'\''/'\''dark'\''/g' /var/www/html/skins/elastic/ui.min.js 2>/dev/null || true
sed -i 's/color_scheme\.matches ? '\''dark'\'' : '\''light'\''/'\''dark'\''/g' /usr/src/roundcubemail/skins/elastic/ui.js 2>/dev/null || true
sed -i 's/color_scheme\.matches ? '\''dark'\'' : '\''light'\''/'\''dark'\''/g' /usr/src/roundcubemail/skins/elastic/ui.min.js 2>/dev/null || true

# 4. Brand assets: logo and favicon
cp -f /usr/src/roundcubemail/skins/elastic/images/logo.svg /var/www/html/skins/elastic/images/logo.svg
cp -f /usr/src/roundcubemail/skins/elastic/images/favicon.ico /var/www/html/skins/elastic/images/favicon.ico
cp -f /usr/src/roundcubemail/skins/elastic/images/favicon.ico /var/www/html/favicon.ico 2>/dev/null || true

# 5. Concatenate theme override CSS
if ! grep -q "Mailwart Theme Integration" /var/www/html/skins/elastic/styles/styles.min.css 2>/dev/null; then
    cat /usr/src/roundcubemail/skins/elastic/styles/theme-override.css >> /var/www/html/skins/elastic/styles/styles.min.css
fi
if ! grep -q "Mailwart Theme Integration" /var/www/html/skins/elastic/styles/styles.css 2>/dev/null; then
    cat /usr/src/roundcubemail/skins/elastic/styles/theme-override.css >> /var/www/html/skins/elastic/styles/styles.css
fi
