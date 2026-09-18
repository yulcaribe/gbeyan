<?php
declare(strict_types=1);

$gbLocalConfig = [];
$gbLocalConfigPath = __DIR__ . '/config.local.php';
if (is_file($gbLocalConfigPath)) {
    $loadedLocalConfig = require $gbLocalConfigPath;
    if (is_array($loadedLocalConfig)) {
        $gbLocalConfig = $loadedLocalConfig;
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

function gb_origin_from_url(?string $url): ?string
{
    $value = trim((string) $url);
    if ($value === '') {
        return null;
    }
    $parts = parse_url($value);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
        return null;
    }
    $origin = strtolower((string) $parts['scheme']) . '://' . (string) $parts['host'];
    if (isset($parts['port'])) {
        $origin .= ':' . (int) $parts['port'];
    }
    return $origin;
}

$origins = ['null', 'https://gbeyan.onrender.com'];
$extraOrigins = preg_split('/\\s*,\\s*/', (string) gb_env('CORS_ALLOWED_ORIGINS', ''), -1, PREG_SPLIT_NO_EMPTY) ?: [];
foreach ($extraOrigins as $origin) {
    $origins[] = rtrim($origin, '/');
}
foreach ([gb_env('PUBLIC_URL'), gb_env('RENDER_EXTERNAL_URL')] as $publicUrl) {
    $origin = gb_origin_from_url($publicUrl);
    if ($origin !== null) {
        $origins[] = $origin;
    }
}

return [
    'version' => '1.8.6-php-mail-browser-parse',
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
    'settings_defaults' => [
        'gendec' => (string) (gb_env('GENDEC_FOLDER_PATH') ?: gb_env('GENDEC', 'SXS\\GenDec')),
        'ldm' => (string) (gb_env('LDM_FOLDER_PATH') ?: gb_env('LDM', 'SXS\\GenDec')),
        'tripInfo' => (string) (gb_env('TRIP_INFO_FOLDER_PATH') ?: gb_env('TRIPINFO', 'SXS\\GenDec')),
    ],
    'allowed_origins' => array_values(array_unique($origins)),
];
