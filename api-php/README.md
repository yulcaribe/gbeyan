# gbeyanphp PHP backend

Parallel PHP backend for gbeyan. The existing Node backend in `yulcaribe/gbeyan` remains independent and is not required by this repository.

## cPanel target

Recommended PHP: **8.1+**

Required:
- cURL
- DOM/XML
- cURL built with NTLM support for EWS

Recommended:
- mbstring

The repository-root `.htaccess` routes `/api/...` to `api-php/index.php`. If `api-php/` itself is configured as the domain/subdomain document root, its own `.htaccess` handles routing.

## Server-only configuration

Do not commit credentials.

Required environment variables:
- `TEST_API_KEY`
- `EWS_USERNAME`
- `EWS_PASSWORD`

Folder defaults:
- `GENDEC` or `GENDEC_FOLDER_PATH`
- `LDM` or `LDM_FOLDER_PATH`
- `TRIPINFO` or `TRIP_INFO_FOLDER_PATH`

Optional:
- `CORS_ALLOWED_ORIGINS` — comma-separated origins
- `PUBLIC_URL`
- `RENDER_EXTERNAL_URL`
- `EXCHANGE_VERIFY_TLS` — defaults to true

Built-in Exchange endpoints:
- ActiveSync: `https://posta.tgs.aero/Microsoft-Server-ActiveSync`
- EWS: `https://posta.tgs.aero/EWS/Exchange.asmx`
- Domain: `tgs`

## Implemented API

- `GET /api/auth/verify`
- `GET /api/mail/messages`
- `POST /api/mail/sync`
- `GET /api/mail/flight-attachment?flightNo=XQ660&candidate=0`
- `GET /api/mail/flight-data?flightNumber=XQ660&flightDate=2026-09-18&tailNumber=TC-SNU`
- `GET /api/mail/settings`
- `POST /api/mail/settings`
- `GET /api/mail/attachment?id=...&name=...`

All protected API calls require:

`Authorization: Bearer <TEST_API_KEY>`

## Runtime behavior

- Mail snapshot cache: 5 minutes.
- Refresh lock: `storage/mail-refresh.lock` with `flock`.
- Snapshot: `storage/mail-cache.json`, written atomically.
- Persistent non-secret folder settings: `storage/settings.json`.
- Source mail older than 15 hours: moved to Deleted Items with ActiveSync `DeletesAsMoves=1`.
- Every real Exchange refresh: Deleted Items are emptied via EWS `EmptyFolder DeleteType="HardDelete"` with no age filter.
- GenDec PDF/XLS/XLSX is never parsed on PHP; the attachment is returned as raw binary for browser-side parsing.
- GenDec candidates match flight number only and are ordered newest mail first.
- LDM/TripInfo behavior follows the current Node parsers.

## Production error handling

`index.php` disables `display_errors` and enables server-side error logging so PHP warnings/notices cannot be mixed into binary attachment responses.

## Before frontend cutover

Keep the Node backend active. Compare Node and PHP responses for the same flights, then switch the frontend base URL only after the cPanel Exchange tests pass.
