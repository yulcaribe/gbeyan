<?php
declare(strict_types=1);

final class TripInfoParser
{
    private static function field(string $text, string $pattern): string
    {
        return preg_match($pattern, $text, $match) === 1 ? (string) ($match[1] ?? '') : '';
    }

    public static function parse(array $message, string $folder = ''): ?array
    {
        $text = (string) ($message['subject'] ?? '') . "\n" . (string) ($message['body'] ?? '');
        $flightDate = gb_normalize_date(self::field($text, '/\bFLIGHT\s*DATE\s*:\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i'));
        $flightNumber = gb_normalize_flight_number(self::field($text, '/\bFLIGHT\s*NO\s*:\s*([A-Z0-9]{2,3}\s*[- ]?\d{1,5}[A-Z]?)/i'));
        $blockFuelText = self::field($text, '/\bBLOCK\s*FUEL\s*:\s*(\d{1,6})\b/i');
        if ($flightDate === '' || $flightNumber === '' || $blockFuelText === '') {
            return null;
        }

        $blockFuelKg = (int) $blockFuelText;
        $tailNumber = gb_normalize_tail(self::field($text, '/\bREGIST(?:RATION|IRATION|ERATION)\s*:\s*(TC[- ]?[A-Z0-9]{3,5})\b/i'));
        $crew = preg_match('/\bCREW\s*:\s*(\d+)\s*\/\s*(\d+)/i', $text, $crewMatch) === 1 ? $crewMatch : null;
        $takeOffRaw = self::field($text, '/\bT\/O\s*FUEL\s*:\s*(\d{1,6})\b/i');
        $taxiRaw = self::field($text, '/\bTAXI\s*FUEL\s*:\s*(\d{1,6})\b/i');
        $tripRaw = self::field($text, '/\bTRIP\s*FUEL\s*:\s*(\d{1,6})\b/i');
        $takeOffFuelKg = $takeOffRaw !== '' && (int) $takeOffRaw !== 0 ? (int) $takeOffRaw : null;
        $taxiFuelKg = $taxiRaw !== '' && (int) $taxiRaw !== 0 ? (int) $taxiRaw : null;
        $tripFuelKg = $tripRaw !== '' && (int) $tripRaw !== 0 ? (int) $tripRaw : null;
        $captain = trim(self::field($text, '/\bCAPTAIN\s*:\s*(.*?)(?=\s+FUEL\s+REQUIRED|\r?$)/im'));

        return [
            'kind' => 'trip-info',
            'key' => $flightNumber . '|' . $tailNumber,
            'flightNumber' => $flightNumber,
            'flightDate' => $flightDate,
            'tailNumber' => $tailNumber,
            'originPortCode' => strtoupper(self::field($text, '/\bORIGIN\s*:\s*([A-Z]{3})\b/i')),
            'destinationPortCode' => strtoupper(self::field($text, '/\bDESTINATION\s*:\s*([A-Z]{3})\b/i')),
            'cockpitCrew' => $crew ? (int) $crew[1] : null,
            'cabinCrew' => $crew ? (int) $crew[2] : null,
            'blockFuelKg' => $blockFuelKg,
            'takeOffFuelKg' => $takeOffFuelKg,
            'tripFuelKg' => $tripFuelKg,
            'taxiFuelKg' => $taxiFuelKg,
            'captain' => $captain,
            'validations' => [
                'blockFuelPositive' => $blockFuelKg > 0,
                'blockFuelMatchesTakeOffPlusTaxi' => $takeOffFuelKg !== null && $taxiFuelKg !== null
                    ? ($takeOffFuelKg + $taxiFuelKg === $blockFuelKg)
                    : null,
            ],
            'source' => [
                'type' => 'trip-info',
                'folder' => $folder,
                'messageId' => (string) ($message['id'] ?? ''),
                'receivedAt' => (string) ($message['date'] ?? ''),
                'subject' => (string) ($message['subject'] ?? ''),
            ],
        ];
    }
}
