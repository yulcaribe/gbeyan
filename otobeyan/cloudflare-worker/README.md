# OtoBeyan iGO Worker

Bu proje `@cloudflare/playwright` paketini Cloudflare Workers Builds sırasında
kurup bundle eder. Worker kodunu dashboard editörüne tek başına yapıştırmak
yeterli değildir.

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
   - `TEST_API_KEY` (sizin belirleyeceğiniz test ekranı parolası)
7. Yeniden deploy edin ve Worker URL'sini açın.

`BROWSER` Browser Run ve `IGO_SESSION_STORE` Durable Object binding'leri
`wrangler.jsonc` içinde tanımlıdır; ayrıca dashboard'dan oluşturulmaları
gerekmez. Durable Object ilk deployment sırasında `v1` migration ile oluşturulur.

`GET /health` binding, secret ve kayıtlı oturum durumunu gösterir. `POST /query`
Load Sheet sorgusunu çalıştırır. Yetkili `POST /session/reset` isteği kayıtlı iGO
oturumunu temizler. Eski `/test` adresi geçiş uyumluluğu için korunmuştur.

## Güvenlik

- Secret değerlerini kaynak koda veya Git'e yazmayın.
- Test Worker URL'sini paylaşmayın.
- Daha önce mesaj, log veya ekran görüntüsünde görünen iGO parolasını üretime
  geçmeden önce değiştirin.
