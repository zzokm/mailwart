<?php

class em_sso extends rcube_plugin
{
    public function init()
    {
        $this->add_hook('startup', [$this, 'startup']);
        $this->add_hook('authenticate', [$this, 'authenticate']);
        $this->add_hook('storage_connect', [$this, 'storage_connect']);
        $this->add_hook('smtp_connect', [$this, 'smtp_connect']);
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
