#!/bin/bash
set -e

# Apply Mailwart whitelabel branding post container setup

# 1. Custom Login template, Watermark empty state, and Menu navigation
if [ -f /usr/src/roundcubemail/skins/elastic/templates/login.html ]; then
    cp -f /usr/src/roundcubemail/skins/elastic/templates/login.html /var/www/html/skins/elastic/templates/login.html
fi
if [ -f /usr/src/roundcubemail/skins/elastic/watermark.html ]; then
    cp -f /usr/src/roundcubemail/skins/elastic/watermark.html /var/www/html/skins/elastic/watermark.html
    cp -f /usr/src/roundcubemail/skins/elastic/watermark.html /var/www/html/watermark.html
fi
if [ -f /usr/src/roundcubemail/skins/elastic/templates/includes/menu.html ]; then
    cp -f /usr/src/roundcubemail/skins/elastic/templates/includes/menu.html /var/www/html/skins/elastic/templates/includes/menu.html
fi

# Cache-bust logo.svg in templates to avoid Cloudflare/browser stale caching
for f in /var/www/html/skins/elastic/templates/*.html /usr/src/roundcubemail/skins/elastic/templates/*.html /var/www/html/skins/elastic/templates/includes/*.html /usr/src/roundcubemail/skins/elastic/templates/includes/*.html; do
    if [ -f "$f" ]; then
        sed -i 's/logo\.svg/logo.svg?v=mailwart/g' "$f" 2>/dev/null || true
    fi
done

# 2. Enforce clean tab name "Webmail" everywhere across PHP server and client JS
for php_file in /var/www/html/program/include/rcmail_output_html.php /usr/src/roundcubemail/program/include/rcmail_output_html.php; do
    if [ -f "$php_file" ]; then
        sed -i 's/protected function get_pagetitle($full = true)/protected function get_pagetitle($full = true) { return "Webmail"; } protected function _unused_get_pagetitle($full = true)/g' "$php_file" 2>/dev/null || true
    fi
done

for js_file in /var/www/html/program/js/app.js /usr/src/roundcubemail/program/js/app.js; do
    if [ -f "$js_file" ]; then
        sed -i 's/document\.title\s*=\s*title;/document.title = "Webmail";/g' "$js_file" 2>/dev/null || true
        sed -i 's/if (title && document.title)\s*document.title = title;/document.title = "Webmail";/g' "$js_file" 2>/dev/null || true
    fi
done

for js_min in /var/www/html/program/js/app.min.js /usr/src/roundcubemail/program/js/app.min.js; do
    if [ -f "$js_min" ]; then
        sed -i 's/document\.title=e/document.title="Webmail"/g' "$js_min" 2>/dev/null || true
        sed -i 's/if(e&&document.title)(document.title=e)/document.title="Webmail"/g' "$js_min" 2>/dev/null || true
        sed -i 's/if(a&&document.title)document.title=a/document.title="Webmail"/g' "$js_min" 2>/dev/null || true
    fi
done

# 3. Default dark mode, font preconnect, and title lock in layout.html
FONT_TAGS='<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800\&family=Plus+Jakarta+Sans:ital,wght@0,300..800;1,300..800\&display=swap"><script>document.title="Webmail";try{new MutationObserver(function(){if(document.title!=="Webmail"){document.title="Webmail";}}).observe(document.head,{subtree:true,characterData:true,childList:true});}catch(e){}</script>'

for layout in /var/www/html/skins/elastic/templates/includes/layout.html /usr/src/roundcubemail/skins/elastic/templates/includes/layout.html; do
    if [ -f "$layout" ]; then
        sed -i 's/document\.cookie\.indexOf('\''colorMode=dark'\'') > -1/document.cookie.indexOf('\''colorMode=light'\'') === -1/g' "$layout" 2>/dev/null || true
        if ! grep -q "Bricolage+Grotesque" "$layout" 2>/dev/null; then
            sed -i "s|<head>|<head>${FONT_TAGS}|g" "$layout" 2>/dev/null || true
        fi
    fi
done

# 4. Default dark mode in ui.js
for ui in /var/www/html/skins/elastic/ui.js /var/www/html/skins/elastic/ui.min.js /usr/src/roundcubemail/skins/elastic/ui.js /usr/src/roundcubemail/skins/elastic/ui.min.js; do
    if [ -f "$ui" ]; then
        sed -i 's/color_scheme\.matches ? '\''dark'\'' : '\''light'\''/'\''dark'\''/g' "$ui" 2>/dev/null || true
    fi
done

# 5. Eradicate all blue accents from CSS bundles
for css_bundle in /var/www/html/skins/elastic/styles/styles.min.css /var/www/html/skins/elastic/styles/styles.css /usr/src/roundcubemail/skins/elastic/styles/styles.min.css /usr/src/roundcubemail/skins/elastic/styles/styles.css; do
    if [ -f "$css_bundle" ]; then
        sed -i 's/#37beff/#ededed/g' "$css_bundle" 2>/dev/null || true
        sed -i 's/#00acff/#f4f4f5/g' "$css_bundle" 2>/dev/null || true
        sed -i 's/#006a9d/#71717a/g' "$css_bundle" 2>/dev/null || true
        sed -i 's/#217299/#52525b/g' "$css_bundle" 2>/dev/null || true
        sed -i 's/#21292c/#18181b/g' "$css_bundle" 2>/dev/null || true
        sed -i 's/#374549/#27272a/g' "$css_bundle" 2>/dev/null || true
        sed -i 's/#4d6066/#3f3f46/g' "$css_bundle" 2>/dev/null || true
    fi
done

for bs in /var/www/html/skins/elastic/deps/bootstrap.min.css /usr/src/roundcubemail/skins/elastic/deps/bootstrap.min.css; do
    if [ -f "$bs" ]; then
        sed -i 's/#007bff/#ededed/g' "$bs" 2>/dev/null || true
        sed -i 's/#0069d9/#d4d4d8/g' "$bs" 2>/dev/null || true
        sed -i 's/#0062cc/#a1a1aa/g' "$bs" 2>/dev/null || true
        sed -i 's/#0056b3/#71717a/g' "$bs" 2>/dev/null || true
        sed -i 's/rgba(0,123,255,/rgba(255,255,255,/g' "$bs" 2>/dev/null || true
    fi
done

for jq in /var/www/html/plugins/jqueryui/themes/elastic/jquery-ui.min.css /usr/src/roundcubemail/plugins/jqueryui/themes/elastic/jquery-ui.min.css; do
    if [ -f "$jq" ]; then
        sed -i 's/#37beff/#ededed/g' "$jq" 2>/dev/null || true
        sed -i 's/#21292c/#18181b/g' "$jq" 2>/dev/null || true
        sed -i 's/#374549/#27272a/g' "$jq" 2>/dev/null || true
    fi
done

# 6. Brand assets: logo and favicon
cp -f /usr/src/roundcubemail/skins/elastic/images/logo.svg /var/www/html/skins/elastic/images/logo.svg
cp -f /usr/src/roundcubemail/skins/elastic/images/favicon.ico /var/www/html/skins/elastic/images/favicon.ico
cp -f /usr/src/roundcubemail/skins/elastic/images/favicon.ico /var/www/html/favicon.ico 2>/dev/null || true

# 7. Concatenate theme override CSS
if ! grep -q "Mailwart Theme Integration" /var/www/html/skins/elastic/styles/styles.min.css 2>/dev/null; then
    cat /usr/src/roundcubemail/skins/elastic/styles/theme-override.css >> /var/www/html/skins/elastic/styles/styles.min.css
fi
if ! grep -q "Mailwart Theme Integration" /var/www/html/skins/elastic/styles/styles.css 2>/dev/null; then
    cat /usr/src/roundcubemail/skins/elastic/styles/theme-override.css >> /var/www/html/skins/elastic/styles/styles.css
fi
