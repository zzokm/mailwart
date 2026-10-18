<?php

class em_sso extends rcube_plugin
{
    public function init()
    {
        $this->add_hook('startup', [$this, 'startup']);
        $this->add_hook('authenticate', [$this, 'authenticate']);
        $this->add_hook('storage_connect', [$this, 'storage_connect']);
        $this->add_hook('smtp_connect', [$this, 'smtp_connect']);
        $this->add_hook('render_page', [$this, 'render_page']);
        $this->add_hook('send_page', [$this, 'render_page']);
    }

    public function render_page($args)
    {
        if (isset($args['content'])) {
            $task = rcmail::get_instance()->task;
            $defaultTitle = ($task === 'login') ? 'Webmail Login' : 'Webmail Inbox';
            $args['content'] = preg_replace_callback('/<title>(.*?)<\/title>/is', function($matches) use ($defaultTitle) {
                $t = trim($matches[1]);
                if ($t === '' || $t === 'Roundcube Webmail' || $t === 'Webmail') {
                    return "<title>{$defaultTitle}</title>";
                }
                $count = '';
                if (preg_match('/^(\(\d+\))\s*/', $t, $cm)) {
                    $count = $cm[1] . ' ';
                    $t = substr($t, strlen($cm[0]));
                }
                $t = preg_replace('/^(Roundcube\s+Webmail|Roundcube|Webmail)\s*[:\-\x{2013}\x{2014}|]*\s*/ui', '', $t);
                $t = trim($t);
                if ($t === '') {
                    return "<title>{$count}{$defaultTitle}</title>";
                }
                return "<title>{$count}Webmail {$t}</title>";
            }, $args['content']);

            $title_script = '<script>try{var _wfmt=function(t){var task=(window.rcmail&&window.rcmail.env&&window.rcmail.env.task)||"mail";var d=(task==="login"||window.location.search.indexOf("_task=login")!==-1)?"Login":"Inbox";if(!t)return"Webmail "+d;var c=(t.match(/^\\(\\d+\\)\\s*/)||[""])[0];var cl=t.replace(/^\\(\\d+\\)\\s*/,"").replace(/^(Roundcube\\s+Webmail|Roundcube|Webmail)\\s*[:\\-\\u2013\\u2014|]*\\s*/i,"").trim();if(!cl)cl=d;return(c?c.trim()+" ":"")+"Webmail "+cl;};if(document.title&&!document.title.includes("Webmail ")){document.title=_wfmt(document.title);}new MutationObserver(function(){var t=document.title;if(t&&!t.includes("Webmail ")){document.title=_wfmt(t);}}).observe(document.head,{subtree:true,characterData:true,childList:true});}catch(e){}</script>';
            if (strpos($args['content'], 'new MutationObserver') === false && strpos($args['content'], '</head>') !== false) {
                $args['content'] = str_replace('</head>', $title_script . '</head>', $args['content']);
            }
        }
        return $args;
    }

    public function startup($args)
    {
        if (!isset($_GET['_em_sso'])) {
            return $args;
        }

        if (!$this->token_claims()) {
            rcube::write_log('em_sso', 'rejected SSO token (bad signature, malformed, or expired)');
            return $args;
        }

        // Roundcube only runs the login flow for task=login + action=login, and it keeps
        // an existing session otherwise, which makes a repeat hand-off render the login
        // template instead of signing in. Drop the previous session so every hand-off
        // authenticates as the mailbox named in the token.
        if (!empty($_SESSION['user_id'])) {
            rcmail::get_instance()->kill_session();
        }

        $args['task'] = 'login';
        $args['action'] = 'login';

        return $args;
    }

    public function authenticate($args)
    {
        $claims = $this->token_claims();
        $password = getenv('WEBMAIL_IMPERSONATOR_PASSWORD');

        if (!$claims || !$password || !$this->impersonator()) {
            return $args;
        }

        $_SESSION['em_sso_target'] = $claims['email'];
        $args['user'] = $claims['email'];
        $args['pass'] = $password;
        $args['cookiecheck'] = false;
        $args['valid'] = true;

        return $args;
    }

    public function storage_connect($args)
    {
        $target = $_SESSION['em_sso_target'] ?? null;
        $impersonator = $this->impersonator();
        $password = getenv('WEBMAIL_IMPERSONATOR_PASSWORD');

        if ($target && $impersonator && $password && $args['user'] === $target) {
            $args['user'] = $target . '%' . $impersonator;
            $args['pass'] = $password;
        }

        return $args;
    }

    public function smtp_connect($args)
    {
        $target = $_SESSION['em_sso_target'] ?? null;
        $impersonator = $this->impersonator();
        $password = getenv('WEBMAIL_IMPERSONATOR_PASSWORD');

        if ($target && $impersonator && $password) {
            $args['smtp_user'] = $target . '%' . $impersonator;
            $args['smtp_pass'] = $password;
        }

        return $args;
    }

    private function impersonator()
    {
        $value = getenv('WEBMAIL_IMPERSONATOR_USER');
        return is_string($value) && $value !== '' ? $value : null;
    }

    private function token_claims()
    {
        $token = $_GET['_em_sso'] ?? '';
        $secret = getenv('WEBMAIL_SSO_SECRET');

        if (!is_string($token) || !is_string($secret) || strlen($secret) < 32) {
            return null;
        }

        $parts = explode('.', $token);
        if (count($parts) !== 2) {
            return null;
        }

        [$encoded, $signature] = $parts;
        $expected = $this->base64url_encode(
            hash_hmac('sha256', $encoded, $secret, true)
        );

        if (!hash_equals($expected, $signature)) {
            return null;
        }

        $json = $this->base64url_decode($encoded);
        $claims = $json === false ? null : json_decode($json, true);
        $email = is_array($claims) ? ($claims['email'] ?? null) : null;
        $expires = is_array($claims) ? ($claims['exp'] ?? null) : null;

        if (
            !is_string($email)
            || !filter_var($email, FILTER_VALIDATE_EMAIL)
            || !is_int($expires)
            || $expires < time()
            || $expires > time() + 60
        ) {
            return null;
        }

        return ['email' => strtolower($email), 'exp' => $expires];
    }

    private function base64url_encode($value)
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64url_decode($value)
    {
        $padding = strlen($value) % 4;
        if ($padding) {
            $value .= str_repeat('=', 4 - $padding);
        }

        return base64_decode(strtr($value, '-_', '+/'), true);
    }
}
