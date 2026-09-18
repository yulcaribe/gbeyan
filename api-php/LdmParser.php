<?php
declare(strict_types=1);

final class LdmParser
{
    private static function dateFromLdmDay(string $dayValue, string $receivedAt): string
    {
        $day = (int) $dayValue;
        if ($day < 1 || $day > 31) {
            return '';
        }
        try {
            $received = new DateTimeImmutable($receivedAt);
            $received = $received->setTimezone(new DateTimeZone('UTC'));
        } catch (Throwable) {
            return '';
        }

        $candidates = [];
        $monthAnchor = $received->modify('first day of this month')->setTime(0, 0, 0);
        foreach ([-1, 0, 1] as $offset) {
            $monthBase = $offset === 0
                ? $monthAnchor
                : $monthAnchor->modify(($offset > 0 ? '+' : '') . $offset . ' month');
            $ym = $monthBase->format('Y-m');
            $candidate = DateTimeImmutable::createFromFormat('!Y-m-d', $ym . '-' . sprintf('%02d', $day), new DateTimeZone('UTC'));
            if (!$candidate || $candidate->format('d') !== sprintf('%02d', $day) || $candidate->format('Y-m') !== $ym) {
                continue;
            }
            $candidates[] = $candidate;
        }

        if ($candidates === []) {
            return '';
        }
        usort($candidates, static fn(DateTimeImmutable $a, DateTimeImmutable $b): int =>
            abs($a->getTimestamp() - $received->getTimestamp()) <=> abs($b->getTimestamp() - $received->getTimestamp())
        );
        return $candidates[0]->format('Y-m-d');
    }

    public static function parse(array $message, string $folder = ''): ?array
    {
        $text = (string) ($message['subject'] ?? '') . "\n" . (string) ($message['body'] ?? '');
        $headerPattern = '/\b([A-Z0-9]{2,3}\s*[- ]?\d{1,5}[A-Z]?)\/(\d{1,2})\.TC[- ]?([A-Z0-9]{3})\.[A-Z]\d+\.(\d+)\/(\d+)\b/i';
        $loadPattern = '/-([A-Z]{3})\.(\d+)\/(\d+)\/(\d+)\/(\d+)\.[^\r\n]*?\bPAX\/(\d+)\b/i';

        if (preg_match($headerPattern, $text, $header) !== 1 || preg_match($loadPattern, $text, $load) !== 1) {
            return null;
        }

        $groups = [(int) $load[2], (int) $load[3], (int) $load[4], (int) $load[5]];
        $flightNumber = gb_normalize_flight_number($header[1]);
        $flightDate = self::dateFromLdmDay($header[2], (string) ($message['date'] ?? ''));
        $tailNumber = gb_normalize_tail('TC' . $header[3]);
        if ($flightNumber === '' || $flightDate === '' || $tailNumber === '') {
            return null;
        }

        $pax = $groups[0] + $groups[1] + $groups[2];
        $statedPax = (int) $load[6];

        return [
            'kind' => 'ldm',
            'key' => $flightNumber . '|' . $tailNumber,
            'flightNumber' => $flightNumber,
            'flightDate' => $flightDate,
            'tailNumber' => $tailNumber,
            'destinationPortCode' => strtoupper($load[1]),
            'cockpitCrew' => (int) $header[4],
            'cabinCrew' => (int) $header[5],
            'pax' => $pax,
            'infant' => $groups[3],
            'statedPax' => $statedPax,
            'passengerBreakdown' => $groups,
            'validations' => [
                'paxMatchesMessage' => $pax === $statedPax,
                'countsNonNegative' => count(array_filter($groups, static fn(int $value): bool => $value < 0)) === 0,
            ],
            'source' => [
                'type' => 'ldm',
                'folder' => $folder,
                'messageId' => (string) ($message['id'] ?? ''),
                'receivedAt' => (string) ($message['date'] ?? ''),
                'subject' => (string) ($message['subject'] ?? ''),
            ],
        ];
    }
}
