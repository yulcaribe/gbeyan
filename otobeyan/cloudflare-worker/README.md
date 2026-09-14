# OtoBeyan iGO Worker testi

Bu proje, `@cloudflare/playwright` paketini Cloudflare Workers Builds sırasında
kurup bundle etmek için hazırlanmıştır. Worker kodunu dashboard editörüne tek
başına yapıştırmak yeterli değildir.

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

`BROWSER` Browser Run binding'i `wrangler.jsonc` içinde tanımlıdır. CAPTCHA
otomatik çözülmez; test sırasında açılan Live View bağlantısında kullanıcı
tarafından tamamlanır.

## Güvenlik

- Secret değerlerini kaynak koda veya Git'e yazmayın.
- Test Worker URL'sini paylaşmayın.
- Daha önce mesaj, log veya ekran görüntüsünde görünen iGO parolasını üretime
  geçmeden önce değiştirin.
