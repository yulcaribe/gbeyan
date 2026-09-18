<?php
declare(strict_types=1);

/*
 * Copy this file to config.local.php on the cPanel server.
 * config.local.php is ignored by Git and must contain the real secrets only on the server.
 *
 * Real environment variables, when present, take precedence over these values.
 */
return [
    'TEST_API_KEY' => 'CHANGE_ME',
    'EWS_USERNAME' => 'CHANGE_ME',
    'EWS_PASSWORD' => 'CHANGE_ME',

    'GENDEC' => 'GENDEC',
    'LDM' => 'LDM',
    'TRIPINFO' => 'TRIPINFO',

    // Optional:
    // 'CORS_ALLOWED_ORIGINS' => 'https://beyan.example.com',
    // 'EXCHANGE_VERIFY_TLS' => true,
];
