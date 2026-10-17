<?php

// Dynamically configure request_path:
// - If accessed under /webmail (e.g. email.yehia.dev/webmail/), use '/webmail/'
// - If accessed directly at root (e.g. webmail.lebasko.com/ or mail.zokm.me/), use '/'
$forwarded_prefix = $_SERVER['HTTP_X_FORWARDED_PREFIX'] ?? '';
$request_uri = $_SERVER['REQUEST_URI'] ?? '';

if (!empty($forwarded_prefix)) {
    $config['request_path'] = rtrim($forwarded_prefix, '/') . '/';
} elseif (strpos($request_uri, '/webmail') === 0) {
    $config['request_path'] = '/webmail/';
} else {
    $config['request_path'] = '/';
}

// Auto-detect default domain from webmail.<domain> host for convenience
$http_host = strtolower($_SERVER['HTTP_HOST'] ?? '');
$http_host = preg_replace('/:\d+$/', '', $http_host);
if (preg_match('/^webmail\.(.+)$/', $http_host, $matches)) {
    $config['username_domain'] = $matches[1];
}

$config['login_autocomplete'] = 2;
$config['product_name'] = 'mailwart webmail';
$config['skin_logo'] = [
    '*' => '/skins/elastic/images/logo.svg',
    'elastic:favicon' => '/skins/elastic/images/favicon.ico',
];
$config['ip_check'] = false;

$tls_options = [
    'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false,
        'allow_self_signed' => true,
    ],
];

$config['imap_conn_options'] = $tls_options;
$config['smtp_conn_options'] = $tls_options;
$config['managesieve_conn_options'] = $tls_options;
