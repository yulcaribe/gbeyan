<?php
declare(strict_types=1);

$gbLocalConfig = [];
$gbLocalConfigPaths = [
    __DIR__ . '/config.local.php',   // cPanel / Docker runtime copy
    '/etc/secrets/config.local.php', // Render secret file fallback
];

foreach ($gbLocalConfigPaths as $gbLocalConfigPath) {
    if (!is_file($gbLocalConfigPath) || !is_readable($gbLocalConfigPath)) {
        continue;
    }

    try {
        $loadedLocalConfig = require $gbLocalConfigPath;
    } catch (Throwable $error) {
        error_log('[gbeyanphp] config load failed for ' . $gbLocalConfigPath . ': ' . $error->getMessage());
        continue;
    }

    if (is_array($loadedLocalConfig)) {
        $gbLocalConfig = $loadedLocalConfig;
        break;
    }
}

function gb_env(string $name, ?string $default = null): ?string
{
    $value = getenv($name);
    if ($value !== false) {
        return $value;
    }

    global $gbLocalConfig;
    if (array_key_exists($name, $gbLocalConfig)) {
        $localValue = $gbLocalConfig[$name];
        if ($localValue === null) {
            return $default;
        }
        if (is_bool($localValue)) {
            return $localValue ? '1' : '0';
        }
        if (is_scalar($localValue)) {
            return (string) $localValue;
        }
    }

    return $default;
}

function gb_env_bool(string $name, bool $default): bool
{
    $raw = gb_env($name);
    if ($raw === null || trim($raw) === '') {
        return $default;
    }
    $value = filter_var($raw, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
    return $value ?? $default;
}

$origins = ['null'];
$extraOrigins = preg_split('/\\s*,\\s*/', (string) gb_env('CORS_ALLOWED_ORIGINS', ''), -1, PREG_SPLIT_NO_EMPTY) ?: [];
foreach ($extraOrigins as $origin) {
    $origins[] = rtrim($origin, '/');
}
return [
    'version' => '1.9.0-php-mail-browser-parse',
    'api_key' => (string) gb_env('TEST_API_KEY', ''),
    'username' => (string) gb_env('EWS_USERNAME', ''),
    'password' => (string) gb_env('EWS_PASSWORD', ''),
    'eas_url' => 'https://posta.tgs.aero/Microsoft-Server-ActiveSync',
    'ews_url' => 'https://posta.tgs.aero/EWS/Exchange.asmx',
    'domain' => 'tgs',
    'device_id' => (string) gb_env('EAS_DEVICE_ID', 'BeyanMailClient01'),
    'device_type' => (string) gb_env('EAS_DEVICE_TYPE', 'BeyanWeb'),
    'protocol_version' => (string) gb_env('EAS_PROTOCOL_VERSION', '14.1'),
    'window_size' => 100,
    'max_sync_pages' => 5,
    'body_type' => '1',
    'body_truncation' => '32768',
    'verify_tls' => gb_env_bool('EXCHANGE_VERIFY_TLS', true),
    'lookback_hours' => 15,
    'cache_ttl_seconds' => 300,
    'storage_dir' => __DIR__ . '/storage',
    // First-run labels only. After the first save, folder paths live in storage/settings.json.
    'settings_defaults' => [
        'gendec' => 'GENDEC',
        'ldm' => 'LDM',
        'tripInfo' => 'TRIPINFO',
    ],
    'allowed_origins' => array_values(array_unique($origins)),
];
