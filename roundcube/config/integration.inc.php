<?php

$config['request_path'] = '/webmail/';
$config['login_autocomplete'] = 2;
$config['product_name'] = 'Email Manager Webmail';
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
