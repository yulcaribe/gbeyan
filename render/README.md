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
| `GENDEC` | Mevcut GenDec klasör yolu |
| `LDM` | Mevcut LDM klasör yolu |
| `TRIPINFO` | Mevcut Trip Info klasör yolu |

Klasör değişkenleri boş bırakılırsa üçü de `SXS\GenDec` kullanır.
Eski `GENDEC_FOLDER_PATH`, `LDM_FOLDER_PATH`, `TRIP_INFO_FOLDER_PATH` adları da geriye dönük desteklenir.
Klasör adında `/` varsa seviyeleri `>` ile ayırabilirsin.
Statik siteye verdiğin `SKIP_INSTALL_DEPS` bu servis için gerekli değildir.

## Uygulamaya bağlama

Yayın bittikten sonra Render'ın verdiği gerçek API adresini al.
API adresi değişirse `otobeyan/api.js` içindeki `API_URL` güncellenmelidir.

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
Trip Info klasörlerinde 15 saatten eski mesajlar önce Çöp Kutusu'na taşınır.
Her gerçek mail yenilemesinin sonunda Çöp Kutusu için saat filtresi uygulanmaz;
içindeki tüm öğeler çalışan Beyan Mail projesindeki EWS EmptyFolder +
HardDelete yöntemiyle kalıcı olarak temizlenir.

Snapshot ve panelden değiştirilen klasör ayarları bellektedir; sunucu yeniden
başladığında kaybolur. Kalmasını istediğin klasör yollarını Render Environment
alanına gir. Önceki sunucunun önbelleği taşınmaz; yeniden oluşturulur.

API, local HTML'nin `null` origin'ine, `https://gbeyan.onrender.com` origin'ine
ve Render'ın `RENDER_EXTERNAL_URL` ile verdiği kendi adresine izin verir.
API anahtarı kontrolü
ve hatalı anahtar denemeleri için bellek içinde hız sınırı uygulanır.

## Doğrulama

`npm run build:static` ile statik paket ve `npm start` ile API başlangıcı
kontrol edilir. Canlı Exchange silme/doğrulama akışı yalnızca Render'da gerçek
Environment değerleri girildikten sonra manuel olarak doğrulanabilir.
