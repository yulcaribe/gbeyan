<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

$config = require __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/EasClient.php';
require_once __DIR__ . '/EwsClient.php';
require_once __DIR__ . '/MailCache.php';
require_once __DIR__ . '/LdmParser.php';
require_once __DIR__ . '/TripInfoParser.php';
require_once __DIR__ . '/MailService.php';
require_once __DIR__ . '/private-page.php';

gb_apply_common_headers($config);

$path = gb_request_path();
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($path === '/healthz' && $method === 'GET') {
    gb_send_json(['ok' => true, 'version' => $config['version']]);
}

if (($path === '/api' || $path === '/api/') && $method === 'GET') {
    gb_send_private_page();
}

if (str_starts_with($path, '/api/') && !gb_origin_allowed($config)) {
    gb_send_json(['ok' => false, 'error' => 'Bu kaynaktan erişime izin verilmiyor.'], 403);
}

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!str_starts_with($path, '/api/')) {
    http_response_code(404);
    exit;
}

if (!in_array($method, ['GET', 'POST'], true)) {
    gb_send_json(['error' => 'Yöntem desteklenmiyor.'], 405);
}

if ((string) ($config['api_key'] ?? '') === '') {
    gb_send_json(['ok' => false, 'error' => 'Servis hazır değil.'], 503);
}

if (!gb_has_access($config)) {
    gb_send_json(['ok' => false, 'error' => 'Erişim reddedildi.'], 401);
}

if ($path === '/api/auth/verify' && $method === 'GET') {
    gb_send_json([
        'ok' => true,
        'version' => $config['version'],
        'backend' => 'mail',
        'ready' => (string) ($config['username'] ?? '') !== '' && (string) ($config['password'] ?? '') !== '',
        'storage' => 'file',
    ]);
}

if (!str_starts_with($path, '/api/mail/') && $path !== '/api/admin/snapshot') {
    http_response_code(404);
    exit;
}

if ((string) ($config['username'] ?? '') === '' || (string) ($config['password'] ?? '') === '') {
    gb_send_json(['error' => 'EWS_USERNAME, EWS_PASSWORD veya TEST_API_KEY secret eksik.'], 503);
}

try {
    $cache = new MailCache((string) $config['storage_dir']);
    $service = new MailService($config, $cache);
    $hours = (int) ($config['lookback_hours'] ?? 15);

    if ($path === '/api/admin/snapshot' && $method === 'GET') {
        $snapshot = $service->getSnapshot(false);
        $genDec = [];

        foreach (($snapshot['gendecMessages'] ?? $snapshot['messages'] ?? []) as $message) {
            $attachments = [];
            foreach (($message['attachments'] ?? []) as $attachment) {
                $name = (string) ($attachment['name'] ?? '');
                if (preg_match('/\.(pdf|xlsx|xls)$/i', $name) !== 1) {
                    continue;
                }
                $attachments[] = [
                    'name' => $name,
                    'size' => (int) ($attachment['size'] ?? 0),
                ];
            }
            if ($attachments === []) {
                continue;
            }
            $genDec[] = [
                'date' => (string) ($message['date'] ?? ''),
                'subject' => (string) ($message['subject'] ?? ''),
                'from' => (string) ($message['from'] ?? ''),
                'attachments' => $attachments,
            ];
        }

        gb_send_json([
            'ok' => true,
            'version' => $config['version'],
            'cachedAt' => $snapshot['cachedAt'] ?? null,
            'expiresAt' => $snapshot['expiresAt'] ?? null,
            'settings' => $snapshot['settings'] ?? [],
            'folderStatus' => $snapshot['folderStatus'] ?? [],
            'cleanup' => $snapshot['cleanup'] ?? [],
            'flights' => $snapshot['flights'] ?? [],
            'parsed' => $snapshot['parsed'] ?? ['ldm' => [], 'tripInfo' => []],
            'genDec' => $genDec,
        ]);
    }

    if ($path === '/api/mail/settings' && $method === 'GET') {
        gb_send_json(['ok' => true, 'settings' => $service->currentSettings()]);
    }

    if ($path === '/api/mail/settings' && $method === 'POST') {
        $settings = $service->saveSettings(gb_read_json_body());
        $snapshot = $service->getSnapshot(true);
        gb_send_json([
            'ok' => true,
            'settings' => $settings,
            'cachedAt' => $snapshot['cachedAt'] ?? null,
            'folderStatus' => $snapshot['folderStatus'] ?? [],
        ]);
    }

    if ($path === '/api/mail/messages' && $method === 'GET') {
        $snapshot = $service->getSnapshot((string) ($_GET['refresh'] ?? '') === '1');
        gb_send_json($snapshot);
    }

    if (($path === '/api/mail/flight-attachment' || $path === '/api/mail/flight-pdf') && $method === 'GET') {
        $flightNo = gb_normalize_flight_number((string) ($_GET['flightNo'] ?? $_GET['flightNumber'] ?? ''));
        if ($flightNo === '') {
            gb_send_json(['error' => 'Uçuş numarası gerekli.'], 400);
        }

        $cacheOnly = (string) ($_GET['cache'] ?? '') === '1';
        if ($cacheOnly) {
            $snapshot = $service->getStoredSnapshot();
            if ($snapshot === null) {
                gb_send_json(['error' => 'Mail önbelleği henüz hazır değil. Önce mail verisini yenile.'], 409);
            }
            $now = time();
            $cutoff = $now - ($hours * 3600);
            $messages = array_values(array_filter($snapshot['gendecMessages'] ?? $snapshot['messages'] ?? [], static function (array $message) use ($cutoff, $now): bool {
                $receivedAt = gb_parse_time((string) ($message['date'] ?? ''));
                return $receivedAt !== null && $receivedAt >= $cutoff && $receivedAt <= ($now + 300);
            }));
            $snapshot['gendecMessages'] = $messages;
            $snapshot['messages'] = $messages;
        } else {
            $snapshot = $service->getSnapshot(false);
        }

        $candidates = $service->findFlightAttachments($snapshot['gendecMessages'] ?? $snapshot['messages'] ?? [], $flightNo);
        $candidateIndex = max(0, (int) ($_GET['candidate'] ?? 0));
        $match = $candidates[$candidateIndex] ?? null;

        if ($match === null) {
            gb_send_json([
                'error' => $candidateIndex > 0
                    ? $flightNo . ' için başka GenDec adayı kalmadı.'
                    : 'Son ' . $hours . ' saatte ' . $flightNo . ' uçuşu için PDF veya Excel GenDec eki bulunamadı.',
                'searchedMessages' => count($snapshot['gendecMessages'] ?? $snapshot['messages'] ?? []),
                'candidateCount' => count($candidates),
                'candidateIndex' => $candidateIndex,
                'folder' => (string) ($snapshot['settings']['gendec'] ?? ''),
            ], 404);
        }

        $bytes = $service->fetchAttachment((string) $match['attachment']['id']);
        gb_send_file($bytes, (string) $match['attachment']['name'], [
            'X-Mail-Subject' => rawurlencode((string) ($match['message']['subject'] ?? '')),
            'X-Mail-Date' => rawurlencode((string) ($match['message']['date'] ?? '')),
            'X-Candidate-Index' => (string) $candidateIndex,
            'X-Candidate-Count' => (string) count($candidates),
        ]);
    }

    if ($path === '/api/mail/attachment' && $method === 'GET') {
        $attachmentId = trim((string) ($_GET['id'] ?? ''));
        $name = (string) ($_GET['name'] ?? 'attachment');
        if ($attachmentId === '') {
            gb_send_json(['error' => 'id eksik.'], 400);
        }
        gb_send_file($service->fetchAttachment($attachmentId), $name);
    }

    if ($path === '/api/mail/flight-data' && $method === 'GET') {
        $flightNumber = gb_normalize_flight_number((string) ($_GET['flightNumber'] ?? ''));
        $flightDate = gb_normalize_date((string) ($_GET['flightDate'] ?? ''));
        $tailNumber = gb_normalize_tail((string) ($_GET['tailNumber'] ?? ''));

        if ($flightNumber === '' || $flightDate === '' || $tailNumber === '') {
            gb_send_json(['error' => 'Ucus numarasi, tarih veya kuyruk gecersiz.'], 400);
        }

        $snapshot = $service->getSnapshot(false);
        $flight = $service->flightDataFromSnapshot($snapshot, $flightNumber, $flightDate, $tailNumber);

        gb_send_json([
            'ok' => true,
            'status' => $flight !== null ? 'ready' : 'not_found',
            'query' => [
                'flightNumber' => $flightNumber,
                'flightDate' => $flightDate,
                'tailNumber' => $tailNumber,
            ],
            'flight' => $flight,
            'cachedAt' => $snapshot['cachedAt'] ?? null,
            'folderStatus' => $snapshot['folderStatus'] ?? [],
        ]);
    }

    if ($path === '/api/mail/sync' && $method === 'POST') {
        $snapshot = $service->getSnapshot(true);
        gb_send_json([
            'ok' => true,
            'cachedAt' => $snapshot['cachedAt'] ?? null,
            'expiresAt' => $snapshot['expiresAt'] ?? null,
            'messageCount' => count($snapshot['gendecMessages'] ?? []),
            'flightCount' => count($snapshot['flights'] ?? []),
            'lookbackHours' => $snapshot['lookbackHours'] ?? $hours,
        ]);
    }

    gb_send_json(['error' => 'Not found'], 404);
} catch (Throwable $error) {
    error_log('[gbeyanphp] ' . $error::class . ': ' . $error->getMessage());
    gb_send_json(['error' => $error->getMessage()], 502);
}
