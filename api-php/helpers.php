<?php
declare(strict_types=1);

function gb_lower(string $value): string
{
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

function gb_folder_segments(string $value): array
{
    $raw = trim($value);
    $parts = preg_match('/[>›]/u', $raw)
        ? preg_split('/\s*[>›]\s*/u', $raw)
        : preg_split('/\\\\+/', $raw);
    $segments = array_values(array_filter(array_map('trim', $parts ?: []), static fn(string $part): bool => $part !== ''));
    if ($segments === [] || count($segments) > 8) {
        throw new InvalidArgumentException('Mail klasoru yolu gecersiz.');
    }
    return $segments;
}

function gb_folder_path(string $value, string $fallback): string
{
    $segments = gb_folder_segments(trim($value) !== '' ? $value : $fallback);
    $normalized = implode('\\', $segments);
    if (strlen($normalized) > 300) {
        throw new InvalidArgumentException('Mail klasoru yolu cok uzun.');
    }
    return $normalized;
}

function gb_normalize_flight_number(?string $value): string
{
    if (preg_match('/\b([A-Z0-9]{2,3})\s*[- ]?(\d{1,5}[A-Z]?)\b/i', strtoupper((string) $value), $match) !== 1) {
        return '';
    }
    return strtoupper($match[1] . $match[2]);
}

function gb_normalize_date(?string $value): string
{
    $text = trim((string) $value);
    if (preg_match('/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/', $text, $match) === 1) {
        return sprintf('%04d-%02d-%02d', (int) $match[1], (int) $match[2], (int) $match[3]);
    }
    if (preg_match('/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/', $text, $match) === 1) {
        return sprintf('%04d-%02d-%02d', (int) $match[3], (int) $match[2], (int) $match[1]);
    }
    return '';
}

function gb_normalize_tail(?string $value): string
{
    $compact = preg_replace('/[^A-Z0-9]/', '', strtoupper((string) $value)) ?: '';
    return str_starts_with($compact, 'TC') && strlen($compact) > 2
        ? 'TC-' . substr($compact, 2)
        : $compact;
}

function gb_search_key(?string $value): string
{
    $text = strtoupper((string) $value);
    return preg_replace('/[^A-Z0-9]/', '', $text) ?: '';
}

function gb_now_iso(): string
{
    return gmdate('Y-m-d\TH:i:s.000\Z');
}

function gb_parse_time(?string $value): ?int
{
    $timestamp = strtotime((string) $value);
    return $timestamp === false ? null : $timestamp;
}

function gb_header_value(string $name): string
{
    $serverName = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    if (isset($_SERVER[$serverName])) {
        return (string) $_SERVER[$serverName];
    }
    if ($name === 'Authorization' && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return (string) $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $key => $value) {
            if (strcasecmp((string) $key, $name) === 0) {
                return (string) $value;
            }
        }
    }
    return '';
}

function gb_has_access(array $config): bool
{
    $key = (string) ($config['api_key'] ?? '');
    $header = gb_header_value('Authorization');
    if ($key === '' || !str_starts_with($header, 'Bearer ')) {
        return false;
    }
    return hash_equals($key, substr($header, 7));
}

function gb_apply_common_headers(array $config): void
{
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Expose-Headers: X-Attachment-Name, X-Mail-Subject, X-Mail-Date, X-Candidate-Index, X-Candidate-Count, Content-Disposition');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('X-Frame-Options: DENY');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
    header('Vary: Origin');

    $origin = gb_header_value('Origin');
    if ($origin !== '' && in_array($origin, $config['allowed_origins'] ?? [], true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
}

function gb_origin_allowed(array $config): bool
{
    $origin = gb_header_value('Origin');
    return $origin === '' || in_array($origin, $config['allowed_origins'] ?? [], true);
}

function gb_send_json(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function gb_read_json_body(int $maxBytes = 65536): array
{
    $length = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($length > $maxBytes) {
        gb_send_json(['error' => 'İstek gövdesi çok büyük.'], 413);
    }
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    if (strlen($raw) > $maxBytes) {
        gb_send_json(['error' => 'İstek gövdesi çok büyük.'], 413);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        gb_send_json(['error' => 'Geçersiz JSON.'], 400);
    }
    return $data;
}

function gb_request_path(): string
{
    $path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';
    $apiPos = strpos($path, '/api/');
    if ($apiPos !== false) {
        return substr($path, $apiPos);
    }
    if (str_ends_with($path, '/api')) {
        return '/api';
    }
    if (str_ends_with($path, '/healthz')) {
        return '/healthz';
    }
    return $path;
}

function gb_file_content_type(string $name): string
{
    $lower = strtolower($name);
    return str_ends_with($lower, '.pdf')
        ? 'application/pdf'
        : (str_ends_with($lower, '.xlsx')
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : (str_ends_with($lower, '.xls') ? 'application/vnd.ms-excel' : 'application/octet-stream'));
}

function gb_send_file(string $bytes, string $name, array $extraHeaders = []): never
{
    $safeName = str_replace('"', '', $name !== '' ? $name : 'attachment');
    http_response_code(200);
    header('Content-Type: ' . gb_file_content_type($safeName));
    header('Content-Length: ' . strlen($bytes));
    header('Content-Disposition: attachment; filename="' . $safeName . '"');
    header('X-Attachment-Name: ' . rawurlencode($safeName));
    foreach ($extraHeaders as $key => $value) {
        header($key . ': ' . $value);
    }
    echo $bytes;
    exit;
}
