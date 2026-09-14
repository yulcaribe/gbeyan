# OtoBeyan Worker

Bu proje OtoBeyan'ın tek sunucu bileşenidir. Aynı Worker iki ayrı entegrasyonu
barındırır:

- `/api/igo/*`: iGO uçuş ve Load Sheet sorguları
- `/api/mail/*`: TGS Exchange ActiveSync üzerinden `SXS\GenDec` okuma

`@cloudflare/playwright` yalnız iGO tarafında kullanılır. Mail tarafı doğrudan
HTTP/WBXML ile çalışır. Worker kodunu dashboard editörüne tek başına yapıştırmak
yeterli değildir; Workers Builds projeyi `package.json` ile bundle eder.

İlk iGO girişinde CAPTCHA kullanıcı tarafından Live View'da tamamlanır. Başarılı
girişin cookie ve tarayıcı storage durumu SQLite tabanlı Durable Object içinde
saklanır. Sonraki Load Sheet sorguları kayıtlı oturumu kullanır; iGO oturumu
gerçekten sona erdiğinde tekrar CAPTCHA istenir.

## Wrangler kurmadan yayınlama

1. Bu repository'yi GitHub'a gönderin.
2. Cloudflare'da **Workers & Pages → Create application → Import a repository**
   yolunu açın ve bu repository'yi seçin.
3. **Root directory** olarak `otobeyan/cloudflare-worker` girin.
4. Deploy command alanına `npm run deploy` girin.
5. Projeyi deploy edin.
6. Worker'ın **Settings → Variables and Secrets** bölümünde aşağıdakileri
   `Secret` türünde ekleyin:
   - `IGO_USERNAME`
   - `IGO_PASSWORD`
   - `EWS_USERNAME` (sabit TGS posta kutusu kullanıcı adı)
   - `EWS_PASSWORD` (sabit TGS posta kutusu parolası)
   - `TEST_API_KEY` (OtoBeyan istemcisinin erişim anahtarı)
7. Yeniden deploy edin ve Worker URL'sini açın.

`BROWSER` Browser Run ve `IGO_SESSION_STORE` Durable Object binding'leri
`wrangler.jsonc` içinde tanımlıdır; ayrıca dashboard'dan oluşturulmaları
gerekmez. Durable Object ilk deployment sırasında `v1` migration ile oluşturulur.

`GET /health` binding, secret ve kayıtlı oturum durumunu gösterir.

- `POST /api/igo/query`: Load Sheet sorgusu
- `POST /api/igo/session/reset`: kayıtlı iGO oturumunu temizleme
- `GET /api/mail/health`: mail modülü durumu
- `GET /api/mail/login`: sabit posta kutusu ve klasör erişim kontrolü
- `GET /api/mail/messages?hours=6`: yalnız son altı saatin mesajları
- `POST /api/mail/sync`: son altı saatlik mail metadata cache'ini zorla yenileme
- `GET /api/mail/flight-pdf?flightNo=XQ254&hours=6`: yalnız sefer numarasıyla
  son altı saatten en uygun PDF'i getirme
- `GET /api/mail/attachment?id=...`: seçilmiş eki indirme

Geçiş uyumluluğu için eski `/query`, `/session/reset` ve `/test` iGO yolları da
şimdilik korunur.

Mail endpointleri kullanıcı adı ve parolayı tarayıcıdan kabul etmez. Tüm özel
mail ve iGO endpointleri `Authorization: Bearer <TEST_API_KEY>` ister.
Mesaj listesi ortak Durable Object içinde beş dakika tutulur ve Cron Trigger ile
beş dakikada bir yenilenir. PDF'ten çıkarılmış ekip JSON cache'i bir sonraki
aşamada aynı state store'a eklenecektir; mevcut sürüm bu alanı hazırmış gibi
göstermez.

## Güvenlik

- Secret değerlerini kaynak koda veya Git'e yazmayın.
- Test Worker URL'sini paylaşmayın.
- Posta kutusundaki mailler silinmez. Altı saat kuralı yalnız sorgu/cache kapsamıdır.
- Daha önce mesaj, log veya ekran görüntüsünde görünen iGO parolasını üretime
  geçmeden önce değiştirin.
