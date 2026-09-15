# gbeyan statik sitesini Render'da yayınlama

Bu kurulum arayüzü ve tarayıcı modüllerini yayınlar. Mail API'si henüz
`otobeyan/config.js` dosyasındaki Cloudflare Worker adresini kullanır.

## Panelden kurulum

1. Render'da **New > Static Site** seç.
2. GitHub hesabını bağla ve **yulcaribe/gbeyan** deposunu seç.
3. Aşağıdaki alanları gir:

| Alan | Değer |
| --- | --- |
| Name | `gbeyan` |
| Branch | `main` |
| Root Directory | Boş bırak |
| Build Command | `node scripts/build-static.mjs` |
| Publish Directory | `dist` |

4. Environment bölümünde `SKIP_INSTALL_DEPS=true` ekle.
5. **Create Static Site** ile yayınla. Render'ın verdiği gerçek URL'yi kullan;
   `gbeyan.onrender.com` adı başka bir kullanıcıya ait olabilir.
6. **Settings > Headers** bölümüne `render.yaml` içindeki header kurallarını ekle.
   Alternatif olarak **New > Blueprint** ile aynı depoyu seçersen `render.yaml`
   yayın ayarlarını ve header kurallarını birlikte tanımlar.

## Güncellemeler

GitHub bağlantısı ve Auto-Deploy açık olduğunda `main` dalına gönderilen
güncellemeler otomatik yayınlanır. JavaScript ve CSS `https://gbeyan.onrender.com` adresinden yüklenir.
Statik site uykuya geçmez; 15 dakikalık uyku kuralı ücretsiz Web Service içindir.

Yayın klasörü yalnızca build scriptindeki dosya listesinden oluşturulur.
Yeni bir tarayıcı dosyası eklendiğinde bu liste de güncellenmelidir.
API anahtarını veya Exchange kullanıcı adı/şifresini statik siteye ekleme;
bunlar sonraki aşamada kurulacak sunucunun ortam değişkenlerinde tutulmalıdır.

## Yerel kontrol

```sh
node scripts/build-static.mjs
python -m http.server 8080 --directory dist
```

Tarayıcıda `http://localhost:8080` adresini aç. CSS, PDF.js worker ve
GenDec modüllerinin site adresinden geldiğini doğrula. HGBS ve mail erişimleri
ayrıca kendi API'lerinin erişim/CORS kurallarına bağlıdır.

## index.html dosyasını local kullanma

Güncel `index.html` dosyasını indirip bilgisayarda açabilirsin. CSS, JavaScript,
parser ve PDF.js dosyaları `https://gbeyan.onrender.com` üzerinden yüklenir.
Dosya yolları tam URL olduğu için yanına başka dosya kopyalamak gerekmez.

Render'da **Settings > Headers** bölümüne şu kuralı ekle:

| Path | Name | Value |
| --- | --- | --- |
| `/*` | `Access-Control-Allow-Origin` | `*` |

Bu kural local dosyanın `null` origin'i ve dosya bütünlüğü kontrolüyle yüklenen
OtoBeyan scriptleri için gereklidir. Panelden Static Site oluşturulduysa
`render.yaml` header kurallarını kendiliğinden uygulamaz; kural panelde eklenmelidir.
Blueprint üzerinden kurulmuşsa `render.yaml` içinde zaten tanımlıdır.

Mail/API adresi `otobeyan/config.js` içinde hâlâ Cloudflare Worker'dır;
API taşıması bu statik dosya güncellemesinden ayrı yapılacaktır.
