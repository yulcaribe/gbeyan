# Render mail/API sunucusu

Mail ve deterministik parser modüllerini Node.js üzerinde kullanır.
Sunucu modüllerinin tamamı bu klasördedir. Veriler istek üzerine güncellenir.

## Render kurulumu

**New > Web Service** seç ve GitHub'daki `yulcaribe/gbeyan` deposunu bağla.

| Alan | Değer |
| --- | --- |
| Name | `gbeyan-api` (uygunsa) |
| Branch | `main` |
| Runtime / Language | `Node` |
| Root Directory | Boş bırak |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | `Free` |
| Health Check Path | `/healthz` |

Environment bölümünde aşağıdakileri gir. Gerçek değerleri GitHub'a veya sohbete koyma.

| Key | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `TEST_API_KEY` | Personelin kullanacağı API anahtarı |
| `EWS_USERNAME` | Mevcut TGS kullanıcı adı |
| `EWS_PASSWORD` | Mevcut TGS şifresi |
| `GENDEC_FOLDER_PATH` | Mevcut GenDec klasör yolu |
| `LDM_FOLDER_PATH` | Mevcut LDM klasör yolu |
| `TRIP_INFO_FOLDER_PATH` | Mevcut Trip Info klasör yolu |

Klasör değişkenleri boş bırakılırsa üçü de `SXS\GenDec` kullanır.
Klasör adında `/` varsa seviyeleri `>` ile ayırabilirsin.
Statik siteye verdiğin `SKIP_INSTALL_DEPS` bu servis için gerekli değildir.

## Uygulamaya bağlama

Yayın bittikten sonra Render'ın verdiği gerçek API adresini al.
`otobeyan/config.js` içindeki `apiUrl` bu adresle değiştirilmeli,
ardından `otobeyan/loader.js` içindeki config hash'i ve `index.html` içindeki
loader hash'i yeniden hesaplanmalıdır. Bu adım tamamlanana kadar istemci
mevcut API adresini kullanmaya devam eder.

Mevcut API adresi `https://gbeyan-api.onrender.com` olarak ayarlanmıştır.

`/` adresi mevcut mail veri ekranını açar. `/healthz` yalnızca sunucunun ayakta
olduğunu gösterir; Exchange bağlantısını doğrulamaz. API anahtarıyla
`/api/auth/verify` kontrolü yapıldıktan sonra `/api/mail/messages?hours=15`
ilk gerçek Exchange taramasını başlatır. `/api/mail/sync` POST taramayı zorlar.

## Ücretsiz çalışma modeli

İstek geldiğinde son 15 saatlik mail verisi taranır. Snapshot 5 dakika boyunca
ortak kullanılır. Eşzamanlı taramalar aynı promise'i bekler; her personel için
ayrı Exchange taraması başlatılmaz. Sunucu uyurken mail kontrolü yapılmaz.
Yeni istek geldiğinde gerekiyorsa son 15 saat yeniden taranır. GenDec, LDM ve
Trip Info klasörlerinde 15 saatten eski mesajlar kalıcı silinir. Çöp Kutusu
saatte en fazla bir kez taranır ve yalnızca bu üç veri türüyle eşleşen eski
mesajlar kalıcı olarak temizlenir.

Snapshot ve panelden değiştirilen klasör ayarları bellektedir; sunucu yeniden
başladığında kaybolur. Kalmasını istediğin klasör yollarını Render Environment
alanına gir. Önceki sunucunun önbelleği taşınmaz; yeniden oluşturulur.

API, local HTML'nin `null` origin'ine, `https://gbeyan.onrender.com` origin'ine
ve Render'ın `RENDER_EXTERNAL_URL` ile verdiği kendi adresine izin verir.
Dosya adı başlıkları local istemci tarafından okunabilir. API anahtarı kontrolü
ve hatalı anahtar denemeleri için bellek içinde hız sınırı uygulanır.

## Doğrulama

```sh
npm test
```

Testler sahte Exchange WBXML yanıtları kullanır; gerçek kimlik bilgisi veya
canlı Exchange bağlantısı gerekmez. Gerçek Exchange bağlantısı Render'da
Environment değerleri girildikten sonra ayrıca doğrulanmalıdır.
