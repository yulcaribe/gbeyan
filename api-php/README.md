# gbeyan PHP backend

Bu proje cPanel/shared-hosting üzerinde çalışan PHP 8.1+ backend'dir. Node.js veya Render gerekmez.

## Gereksinimler

- PHP 8.1+
- cURL
- DOM/XML
- mbstring önerilir
- EWS çöp kutusu temizliği için cURL NTLM desteği

## Sunucu ayarları

Gerçek secret değerlerini repoya yazma. cPanel sunucusunda `api-php/config.local.php` oluştur ve
`api-php/config.local.example.php` dosyasını örnek al.

Desteklenen ayarlar:

- `TEST_API_KEY`
- `EWS_USERNAME`
- `EWS_PASSWORD`
- `GENDEC` veya `GENDEC_FOLDER_PATH`
- `LDM` veya `LDM_FOLDER_PATH`
- `TRIPINFO` veya `TRIP_INFO_FOLDER_PATH`
- isteğe bağlı `CORS_ALLOWED_ORIGINS`
- isteğe bağlı `EXCHANGE_VERIFY_TLS`

## Adresler

Domain document root'u bu repo kökü olmalıdır.

- Ana uygulama: `https://gbeyan.yulcaribe.com/`
- API paneli: `https://gbeyan.yulcaribe.com/api/`
- Auth: `GET /api/auth/verify`
- Mail cache: `GET /api/mail/messages?hours=15`
- Senkronizasyon: `POST /api/mail/sync`
- GenDec eki: `GET /api/mail/flight-attachment?flightNo=XQ660&hours=15`
- Önceki GenDec adayı: aynı endpoint + `candidate=1`
- Uçuş verisi: `GET /api/mail/flight-data?flightNumber=XQ660&flightDate=2026-09-18&tailNumber=TC-SNU`
- Ayarlar: `GET/POST /api/mail/settings`
- Yönetim snapshot: `GET /api/admin/snapshot`

## Çalışma modeli

- GenDec PDF/XLS/XLSX PHP'de parse edilmez; ham ek tarayıcıya gider ve mevcut browser parser'ları okur.
- LDM eşleşmesi sefer no + kuyruk ile yapılır.
- TripInfo mevcut parser mantığıyla block fuel ve diğer alanları üretir.
- Mail cache dosya tabanlıdır ve 5 dakika TTL kullanır.
- Gerçek Exchange refresh'i `flock` ile tekilleştirilir.
- GENDEC/LDM/TRIPINFO kaynaklarında 15 saatten eski iletiler Trash'e taşınır.
- Her gerçek refresh sonunda Deleted Items EWS HardDelete ile tamamen boşaltılır.

## Statik bağımlılıklar

Frontend dosyaları, GenDec parser'ları, CSS, PDF.js ve XLSX bu repodan ve aynı domainden servis edilir.
Harici uygulama servisi olarak yalnızca gerçek HGBS endpoint'i kullanılır.
