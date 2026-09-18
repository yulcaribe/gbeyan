<?php
declare(strict_types=1);

final class MailService
{
    private array $config;
    private MailCache $cache;
    private EasClient $eas;
    private EwsClient $ews;

    public function __construct(array $config, MailCache $cache)
    {
        $this->config = $config;
        $this->cache = $cache;
        $username = (string) ($config['username'] ?? '');
        $password = (string) ($config['password'] ?? '');
        $this->eas = new EasClient($config, $username, $password);
        $this->ews = new EwsClient($config, $username, $password);
    }

    public function currentSettings(): array
    {
        $stored = $this->cache->getMailSettings() ?? [];
        $defaults = $this->config['settings_defaults'] ?? [];
        return $this->normalizeSettings($stored + $defaults);
    }

    public function normalizeSettings(array $value): array
    {
        $defaults = $this->config['settings_defaults'] ?? [];
        return [
            'gendec' => gb_folder_path((string) ($value['gendec'] ?? ''), (string) ($defaults['gendec'] ?? 'SXS\\GenDec')),
            'ldm' => gb_folder_path((string) ($value['ldm'] ?? ''), (string) ($defaults['ldm'] ?? 'SXS\\GenDec')),
            'tripInfo' => gb_folder_path((string) ($value['tripInfo'] ?? ''), (string) ($defaults['tripInfo'] ?? 'SXS\\GenDec')),
        ];
    }

    public function saveSettings(array $input): array
    {
        $settings = $this->normalizeSettings(isset($input['settings']) && is_array($input['settings']) ? $input['settings'] : $input);
        $this->cache->saveMailSettings($settings);
        $this->cache->clearMailSnapshot();
        return $settings;
    }

    public function getStoredSnapshot(): ?array
    {
        return $this->cache->getMailSnapshot();
    }

    public function getSnapshot(bool $force = false): array
    {
        $hours = (int) ($this->config['lookback_hours'] ?? 15);
        $stored = $this->cache->getMailSnapshot();
        $beforeCachedAt = is_array($stored) ? (string) ($stored['cachedAt'] ?? '') : '';

        if (!$force && $this->snapshotIsFresh($stored)) {
            return $this->snapshotForResponse($stored, $hours, true);
        }

        return $this->cache->withRefreshLock(function () use ($force, $beforeCachedAt, $hours): array {
            $current = $this->cache->getMailSnapshot();
            $currentCachedAt = is_array($current) ? (string) ($current['cachedAt'] ?? '') : '';

            if ($this->snapshotIsFresh($current) && (!$force || $currentCachedAt !== $beforeCachedAt)) {
                return $this->snapshotForResponse($current, $hours, true);
            }

            $snapshot = $this->refreshMailCache($hours);
            return $this->snapshotForResponse($snapshot, $hours, false);
        });
    }

    public function refreshMailCache(?int $hours = null): array
    {
        $hours ??= (int) ($this->config['lookback_hours'] ?? 15);
        $settings = $this->currentSettings();
        $previous = $this->cache->getMailSnapshot();
        $results = $this->loadConfiguredMessages($settings);
        $cleanup = $this->cleanOldMail($results, $hours);
        $snapshot = $this->snapshotFrom($results, $settings, $hours, $previous, $cleanup);
        $this->cache->saveMailSnapshot($snapshot);
        return $snapshot;
    }

    public function fetchAttachment(string $attachmentId): string
    {
        return $this->eas->fetchAttachment($attachmentId);
    }

    public function findFlightAttachments(array $messages, string $flightNo): array
    {
        $flightKeys = $this->flightNumberVariants($flightNo);
        $candidates = [];

        foreach ($messages as $message) {
            $subjectKey = gb_search_key((string) ($message['subject'] ?? ''));
            $bodyKey = gb_search_key((string) ($message['body'] ?? ''));

            foreach (($message['attachments'] ?? []) as $attachment) {
                $extension = $this->crewAttachmentExtension((string) ($attachment['name'] ?? ''));
                if ($extension === '') {
                    continue;
                }
                $nameKey = gb_search_key((string) ($attachment['name'] ?? ''));

                $flightMatch = false;
                foreach ($flightKeys as $key) {
                    $pattern = '/' . preg_quote($key, '/') . '(?!\d)/';
                    if (preg_match($pattern, $nameKey) === 1 || preg_match($pattern, $subjectKey) === 1 || preg_match($pattern, $bodyKey) === 1) {
                        $flightMatch = true;
                        break;
                    }
                }
                if (!$flightMatch) {
                    continue;
                }

                $score = 0;
                foreach ($flightKeys as $key) {
                    if (str_contains($nameKey, $key)) {
                        $score += 50;
                        break;
                    }
                }
                foreach ($flightKeys as $key) {
                    if (str_contains($subjectKey, $key)) {
                        $score += 30;
                        break;
                    }
                }
                foreach ($flightKeys as $key) {
                    if (str_contains($bodyKey, $key)) {
                        $score += 15;
                        break;
                    }
                }
                if (str_contains($nameKey, 'GENDEC')) {
                    $score += 10;
                }
                if (str_contains($nameKey, 'HGBS')) {
                    $score += 10;
                }
                if ($extension === '.xlsx') {
                    $score += 3;
                }

                $candidates[] = [
                    'message' => $message,
                    'attachment' => $attachment,
                    'score' => $score,
                ];
            }
        }

        usort($candidates, static function (array $left, array $right): int {
            $dateOrder = strcmp((string) ($right['message']['date'] ?? ''), (string) ($left['message']['date'] ?? ''));
            return $dateOrder !== 0 ? $dateOrder : ((int) $right['score'] <=> (int) $left['score']);
        });

        return $candidates;
    }

    public function flightDataFromSnapshot(array $snapshot, string $flightNumber, string $flightDate, string $tailNumber): ?array
    {
        $tail = gb_normalize_tail($tailNumber);
        if ($tail === '') {
            return null;
        }

        $baseCandidates = array_values(array_filter($snapshot['flights'] ?? [], static fn(array $item): bool =>
            (string) ($item['flightNumber'] ?? '') === $flightNumber
            && gb_normalize_tail((string) ($item['tailNumber'] ?? '')) === $tail
        ));
        usort($baseCandidates, static fn(array $left, array $right): int =>
            strcmp((string) ($right['sources']['tripInfo']['receivedAt'] ?? ''), (string) ($left['sources']['tripInfo']['receivedAt'] ?? ''))
        );
        $base = $baseCandidates[0] ?? null;

        $ldmCandidates = array_values(array_filter($snapshot['parsed']['ldm'] ?? [], static fn(array $item): bool =>
            (string) ($item['flightNumber'] ?? '') === $flightNumber
            && gb_normalize_tail((string) ($item['tailNumber'] ?? '')) === $tail
        ));
        usort($ldmCandidates, static fn(array $left, array $right): int =>
            strcmp((string) ($right['source']['receivedAt'] ?? ''), (string) ($left['source']['receivedAt'] ?? ''))
        );
        $ldm = $ldmCandidates[0] ?? null;

        if ($base === null && $ldm === null) {
            return null;
        }
        if ($ldm === null) {
            return $base;
        }

        $paxValid = ($ldm['validations']['paxMatchesMessage'] ?? false) === true;
        $confidence = $paxValid ? 1 : 0.55;
        $field = static fn(mixed $value): array => [
            'value' => $value,
            'source' => $ldm['source'],
            'confidence' => $confidence,
            'validation' => $ldm['validations'],
        ];

        if ($base === null) {
            $base = [
                'key' => $flightNumber . '|' . $tail,
                'flightNumber' => $flightNumber,
                'flightDate' => $flightDate,
                'originPortCode' => '',
                'destinationPortCode' => (string) ($ldm['destinationPortCode'] ?? ''),
                'fields' => [
                    'blockFuelKg' => [
                        'value' => null,
                        'source' => null,
                        'confidence' => 0,
                        'validation' => ['available' => false],
                    ],
                ],
                'sources' => ['tripInfo' => null],
                'validations' => ['blockFuel' => false],
            ];
        }

        $base['tailNumber'] = (string) ($base['tailNumber'] ?? $ldm['tailNumber'] ?? $tail);
        $base['cockpitCrew'] = $base['cockpitCrew'] ?? $ldm['cockpitCrew'] ?? null;
        $base['cabinCrew'] = $base['cabinCrew'] ?? $ldm['cabinCrew'] ?? null;
        $base['fields'] = ($base['fields'] ?? []) + [];
        $base['fields']['pax'] = $field($ldm['pax'] ?? null);
        $base['fields']['infant'] = $field($ldm['infant'] ?? null);
        $base['sources'] = ($base['sources'] ?? []) + [];
        $base['sources']['ldm'] = $ldm['source'];
        $base['validations'] = ($base['validations'] ?? []) + [];
        $base['validations']['pax'] = $paxValid;

        return $base;
    }

    private function loadConfiguredMessages(array $settings): array
    {
        $folders = $this->eas->listFolders();
        $paths = array_values(array_unique(array_values($settings)));
        $byPath = [];
        $errors = [];

        foreach ($paths as $path) {
            try {
                $folder = $this->targetFolder($folders, (string) $path);
                $loaded = $this->eas->listMessages($folder['id']);
                $loaded['folder'] = $folder;
                $byPath[(string) $path] = $loaded;
            } catch (Throwable $error) {
                $errors[(string) $path] = $error->getMessage();
            }
        }

        return ['byPath' => $byPath, 'errors' => $errors, 'records' => $folders];
    }

    private function targetFolder(array $records, string $folderPath): array
    {
        $segments = gb_folder_segments($folderPath);
        $parentId = null;
        $current = null;

        foreach ($segments as $segment) {
            $wanted = gb_lower($segment);
            $candidates = array_values(array_filter($records, static fn(array $folder): bool =>
                gb_lower((string) ($folder['name'] ?? '')) === $wanted
            ));

            if ($parentId === null) {
                $current = $candidates[0] ?? null;
            } else {
                $current = null;
                foreach ($candidates as $candidate) {
                    if ((string) ($candidate['parentId'] ?? '') === $parentId) {
                        $current = $candidate;
                        break;
                    }
                }
            }

            if (!is_array($current)) {
                $available = array_map(static fn(array $folder): string => (string) ($folder['name'] ?? ''), $records);
                sort($available, SORT_NATURAL | SORT_FLAG_CASE);
                throw new RuntimeException('Mail klasoru bulunamadi: ' . implode('\\', $segments) . '. Bulunan klasorler: ' . substr(implode(', ', $available), 0, 2500));
            }
            $parentId = (string) ($current['id'] ?? '');
        }

        return $current;
    }

    private function cleanOldMail(array &$results, int $hours): array
    {
        $now = time();
        $cutoff = $now - ($hours * 3600);
        $cleanup = [
            'at' => gmdate('Y-m-d\TH:i:s.000\Z', $now),
            'cutoff' => gmdate('Y-m-d\TH:i:s.000\Z', $cutoff),
            'sourceDeleted' => 0,
            'trashDeleted' => 0,
            'trashCleared' => false,
            'errors' => [],
            'trashAt' => gmdate('Y-m-d\TH:i:s.000\Z', $now),
        ];

        foreach ($results['byPath'] as $path => &$loaded) {
            $ids = [];
            foreach (($loaded['messages'] ?? []) as $message) {
                $receivedAt = gb_parse_time((string) ($message['date'] ?? ''));
                if ($receivedAt !== null && $receivedAt < $cutoff) {
                    $id = (string) ($message['id'] ?? '');
                    if ($id !== '') {
                        $ids[$id] = $id;
                    }
                }
            }
            $ids = array_values($ids);
            if ($ids === []) {
                continue;
            }

            try {
                $syncKey = (string) ($loaded['syncKey'] ?? '');
                foreach (array_chunk($ids, 100) as $batch) {
                    $syncKey = $this->eas->deleteMessages((string) $loaded['folder']['id'], $syncKey, $batch, true);
                    $cleanup['sourceDeleted'] += count($batch);
                }
                $loaded['syncKey'] = $syncKey;

                $verification = $this->eas->listMessages((string) $loaded['folder']['id']);
                $remaining = [];
                foreach ($verification['messages'] ?? [] as $message) {
                    $remaining[(string) ($message['id'] ?? '')] = true;
                }
                $failed = array_values(array_filter($ids, static fn(string $id): bool => isset($remaining[$id])));
                if ($failed !== []) {
                    throw new RuntimeException('Exchange silme/tasima dogrulamasi basarisiz: ' . count($failed) . ' mail hâlâ kaynak klasörde.');
                }
                $loaded['messages'] = array_values(array_filter($loaded['messages'] ?? [], static fn(array $message): bool =>
                    !in_array((string) ($message['id'] ?? ''), $ids, true)
                ));
            } catch (Throwable $error) {
                $cleanup['errors'][] = (string) $path . ': ' . $error->getMessage();
            }
        }
        unset($loaded);

        try {
            $trashFolder = null;
            foreach ($results['records'] as $folder) {
                if ((int) ($folder['type'] ?? 0) === 4) {
                    $trashFolder = $folder;
                    break;
                }
            }
            if ($trashFolder !== null) {
                try {
                    $trash = $this->eas->listMessages((string) $trashFolder['id']);
                    $cleanup['trashDeleted'] = count($trash['messages'] ?? []);
                } catch (Throwable $error) {
                    $cleanup['errors'][] = 'Çöp Kutusu sayımı: ' . $error->getMessage();
                }
            }

            $this->ews->emptyDeletedItems();
            $cleanup['trashCleared'] = true;
        } catch (Throwable $error) {
            $cleanup['errors'][] = 'Çöp Kutusu HardDelete: ' . $error->getMessage();
        }

        return $cleanup;
    }

    private function snapshotFrom(array $results, array $settings, int $hours, ?array $previous, array $cleanup): array
    {
        $recentFor = function (string $source) use ($results, $settings, $hours): array {
            $path = $settings[$source];
            return $this->recentMessages($results['byPath'][$path]['messages'] ?? [], $hours);
        };
        $samePreviousSetting = static fn(string $source): bool =>
            is_array($previous) && (($previous['settings'][$source] ?? null) === ($settings[$source] ?? null));

        if (isset($results['byPath'][$settings['gendec']])) {
            $gendecMessages = array_map([$this, 'compactMessage'], $recentFor('gendec'));
        } elseif ($samePreviousSetting('gendec')) {
            $gendecMessages = $this->recentMessages($previous['gendecMessages'] ?? $previous['messages'] ?? [], $hours);
        } else {
            $gendecMessages = [];
        }

        if (isset($results['byPath'][$settings['ldm']])) {
            $ldmRecords = [];
            foreach ($recentFor('ldm') as $message) {
                $parsed = LdmParser::parse($message, $settings['ldm']);
                if ($parsed !== null) {
                    $ldmRecords[] = $parsed;
                }
            }
        } elseif ($samePreviousSetting('ldm')) {
            $ldmRecords = $this->recentParsed($previous['parsed']['ldm'] ?? [], $hours);
        } else {
            $ldmRecords = [];
        }

        if (isset($results['byPath'][$settings['tripInfo']])) {
            $tripInfoRecords = [];
            foreach ($recentFor('tripInfo') as $message) {
                $parsed = TripInfoParser::parse($message, $settings['tripInfo']);
                if ($parsed !== null) {
                    $tripInfoRecords[] = $parsed;
                }
            }
        } elseif ($samePreviousSetting('tripInfo')) {
            $tripInfoRecords = $this->recentParsed($previous['parsed']['tripInfo'] ?? [], $hours);
        } else {
            $tripInfoRecords = [];
        }

        $folderStatus = [];
        foreach ($settings as $source => $path) {
            $result = $results['byPath'][$path] ?? null;
            $folderStatus[$source] = [
                'path' => $path,
                'ok' => is_array($result),
                'error' => $results['errors'][$path] ?? null,
                'stale' => !is_array($result) && $samePreviousSetting($source),
                'fetchedMessages' => is_array($result) ? count($result['messages'] ?? []) : 0,
                'pages' => is_array($result) ? (int) ($result['pages'] ?? 0) : 0,
                'moreAvailable' => is_array($result) ? (bool) ($result['moreAvailable'] ?? false) : false,
            ];
        }

        $cachedAt = gb_now_iso();
        return [
            'cacheVersion' => 2,
            'settings' => $settings,
            'folderStatus' => $folderStatus,
            'messages' => $gendecMessages,
            'gendecMessages' => $gendecMessages,
            'parsed' => ['ldm' => $ldmRecords, 'tripInfo' => $tripInfoRecords],
            'flights' => $this->buildFlightRecords($ldmRecords, $tripInfoRecords),
            'lookbackHours' => $hours,
            'cachedAt' => $cachedAt,
            'expiresAt' => gmdate('Y-m-d\TH:i:s.000\Z', time() + (int) ($this->config['cache_ttl_seconds'] ?? 300)),
            'cleanup' => $cleanup,
        ];
    }

    private function buildFlightRecords(array $ldmRecords, array $tripInfoRecords): array
    {
        $keys = [];
        foreach (array_merge($ldmRecords, $tripInfoRecords) as $record) {
            $key = (string) ($record['key'] ?? '');
            if ($key !== '') {
                $keys[$key] = true;
            }
        }

        $flights = [];
        foreach (array_keys($keys) as $key) {
            $trip = $this->newest(array_values(array_filter($tripInfoRecords, static fn(array $record): bool => ($record['key'] ?? '') === $key)));
            $ldm = $this->newest(array_values(array_filter($ldmRecords, static fn(array $record): bool => ($record['key'] ?? '') === $key)));
            $selected = $trip ?? $ldm;
            $paxValid = ($ldm['validations']['paxMatchesMessage'] ?? false) === true;
            $fuelValid = ($trip['validations']['blockFuelPositive'] ?? false) === true
                && (($trip['validations']['blockFuelMatchesTakeOffPlusTaxi'] ?? null) !== false);

            $flights[] = [
                'key' => $key,
                'flightNumber' => (string) ($selected['flightNumber'] ?? ''),
                'flightDate' => (string) ($trip['flightDate'] ?? $ldm['flightDate'] ?? ''),
                'originPortCode' => (string) ($trip['originPortCode'] ?? ''),
                'destinationPortCode' => (string) ($trip['destinationPortCode'] ?? $ldm['destinationPortCode'] ?? ''),
                'tailNumber' => (string) ($selected['tailNumber'] ?? ''),
                'cockpitCrew' => $trip['cockpitCrew'] ?? $ldm['cockpitCrew'] ?? null,
                'cabinCrew' => $trip['cabinCrew'] ?? $ldm['cabinCrew'] ?? null,
                'fields' => [
                    'pax' => $this->valueField($ldm['pax'] ?? null, $ldm, $ldm ? ($paxValid ? 1 : 0.55) : 0, $ldm['validations'] ?? ['available' => false]),
                    'infant' => $this->valueField($ldm['infant'] ?? null, $ldm, $ldm ? ($paxValid ? 1 : 0.55) : 0, $ldm['validations'] ?? ['available' => false]),
                    'blockFuelKg' => $this->valueField($trip['blockFuelKg'] ?? null, $trip, $trip ? ($fuelValid ? 1 : 0.55) : 0, $trip['validations'] ?? ['available' => false]),
                ],
                'sources' => [
                    'ldm' => $ldm['source'] ?? null,
                    'tripInfo' => $trip['source'] ?? null,
                ],
                'validations' => [
                    'pax' => $paxValid,
                    'blockFuel' => $fuelValid,
                    'tailConsistent' => $ldm && $trip ? (($ldm['tailNumber'] ?? null) === ($trip['tailNumber'] ?? null)) : null,
                ],
            ];
        }

        usort($flights, static fn(array $left, array $right): int =>
            strcmp(
                (string) ($right['flightDate'] ?? '') . '|' . (string) ($right['flightNumber'] ?? ''),
                (string) ($left['flightDate'] ?? '') . '|' . (string) ($left['flightNumber'] ?? '')
            )
        );
        return $flights;
    }

    private function valueField(mixed $value, ?array $record, int|float $confidence, array $validation): array
    {
        return [
            'value' => $value,
            'source' => $record['source'] ?? null,
            'confidence' => $confidence,
            'validation' => $validation,
        ];
    }

    private function newest(array $records): ?array
    {
        usort($records, static fn(array $left, array $right): int =>
            strcmp((string) ($right['source']['receivedAt'] ?? ''), (string) ($left['source']['receivedAt'] ?? ''))
        );
        return $records[0] ?? null;
    }

    private function recentMessages(array $messages, int $hours): array
    {
        $now = time();
        $cutoff = $now - ($hours * 3600);
        return array_values(array_filter($messages, static function (array $message) use ($cutoff, $now): bool {
            $receivedAt = gb_parse_time((string) ($message['date'] ?? ''));
            return $receivedAt !== null && $receivedAt >= $cutoff && $receivedAt <= ($now + 300);
        }));
    }

    private function recentParsed(array $records, int $hours): array
    {
        $now = time();
        $cutoff = $now - ($hours * 3600);
        return array_values(array_filter($records, static function (array $record) use ($cutoff, $now): bool {
            $receivedAt = gb_parse_time((string) ($record['source']['receivedAt'] ?? ''));
            return $receivedAt !== null && $receivedAt >= $cutoff && $receivedAt <= ($now + 300);
        }));
    }

    private function compactMessage(array $message): array
    {
        $attachments = [];
        foreach (($message['attachments'] ?? []) as $attachment) {
            $attachments[] = [
                'id' => (string) ($attachment['id'] ?? ''),
                'name' => substr((string) ($attachment['name'] ?? ''), 0, 500),
                'contentType' => substr((string) ($attachment['contentType'] ?? ''), 0, 200),
                'size' => (int) ($attachment['size'] ?? 0),
                'inline' => (bool) ($attachment['inline'] ?? false),
            ];
        }

        return [
            'id' => (string) ($message['id'] ?? ''),
            'subject' => substr((string) ($message['subject'] ?? ''), 0, 1000),
            'from' => substr((string) ($message['from'] ?? ''), 0, 500),
            'to' => substr((string) ($message['to'] ?? ''), 0, 500),
            'date' => (string) ($message['date'] ?? ''),
            'read' => (bool) ($message['read'] ?? false),
            'body' => substr((string) ($message['body'] ?? ''), 0, 4000),
            'attachments' => $attachments,
        ];
    }

    private function snapshotIsFresh(?array $snapshot): bool
    {
        if (!is_array($snapshot) || empty($snapshot['cachedAt'])) {
            return false;
        }
        $cachedAt = gb_parse_time((string) $snapshot['cachedAt']);
        return $cachedAt !== null && (time() - $cachedAt) < (int) ($this->config['cache_ttl_seconds'] ?? 300);
    }

    private function snapshotForResponse(array $snapshot, int $hours, bool $fromCache): array
    {
        $messages = $this->recentMessages($snapshot['gendecMessages'] ?? $snapshot['messages'] ?? [], $hours);
        $snapshot['messages'] = $messages;
        $snapshot['gendecMessages'] = $messages;
        $snapshot['lookbackHours'] = $hours;
        $snapshot['fromCache'] = $fromCache;
        return $snapshot;
    }

    private function crewAttachmentExtension(string $name): string
    {
        $lower = strtolower($name);
        foreach (['.pdf', '.xlsx', '.xls'] as $extension) {
            if (str_ends_with($lower, $extension)) {
                return $extension;
            }
        }
        return '';
    }

    private function flightNumberVariants(string $flightNo): array
    {
        $flightKey = gb_normalize_flight_number($flightNo);
        if ($flightKey === '') {
            throw new InvalidArgumentException('Ucus numarasi eksik.');
        }
        if (preg_match('/^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/', $flightKey) !== 1) {
            throw new InvalidArgumentException('Ucus numarasi XQ254 biciminde olmali.');
        }

        $aliases = ['STW' => '2S', '2S' => 'STW', 'TWI' => 'TI', 'TI' => 'TWI'];
        $variants = [$flightKey => true];
        foreach ($aliases as $prefix => $alias) {
            if (str_starts_with($flightKey, $prefix)) {
                $number = substr($flightKey, strlen($prefix));
                if (preg_match('/^\d{1,5}[A-Z]?$/', $number) === 1) {
                    $variants[$alias . $number] = true;
                }
            }
        }
        return array_keys($variants);
    }
}
