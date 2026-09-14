# OtoBeyan

OtoBeyan tamamen `otobeyan/` klasöründe tutulur. Ana uygulamadaki tek bağlantı:

```html
<script src="./otobeyan/loader.js"></script>
```

Bu satır kaldırılır veya yorumlanırsa özellik kullanıcıdan tamamen gizlenir.

## Hedef klasör yapısı

```text
otobeyan/
├── quickbeyan.js                 # uçuş satırındaki Hızlı Beyan düğmesi + modal
├── config.js                     # Worker adresi ve geçici erişim kodu
├── loader.js                     # index.html içindeki tek OtoBeyan bağlantısı
├── client/                       # tarayıcı tarafı yardımcı modüller
│   ├── api.js
│   ├── gendec-parser.js           # planlanan bağımsız parser modülü
│   └── cache.js                   # planlanan parse edilmiş ekip cache'i
├── cloudflare-worker/            # tek OtoBeyan Worker projesi
│   ├── src/
│   │   ├── worker.js             # ana router + iGO
│   │   └── mail.js               # EWS / SXS\GenDec
│   ├── package.json
│   └── wrangler.jsonc
└── README.md
```

Geçiş sırasında `chrome-extension/` yalnız geri dönüş seçeneği olarak korunur.
Worker tabanlı Hızlı Beyan akışı doğrulandıktan sonra kaldırılır. Ana dizindeki eski `cloudflare-ews-probe/`
kaynağı mail modülü olarak `cloudflare-worker/src/mail.js` altına taşınmıştır.

## Çalışma biçimi

- `index.html` doğrudan `file://` olarak açılır.
- Node, npm, pnpm veya yerel sunucu kullanılmaz.
- GenDec PDF mevcut parser ile okunur.
- Merkezi posta kutusunda yalnız son altı saatteki mesajlar değerlendirilir.
- GenDec eşleştirmesinde tek iş anahtarı normalize edilmiş sefer numarasıdır.
- Tarih ve kuyruk mail filtresi değildir; bulunan PDF'in içeriği ve Excel uçuşu
  sonradan çapraz doğrulanır.
- iGO uçuş ve Load Sheet sorgusu Chrome köprüsüyle, mevcut iGO oturumu üzerinden yalnız okunur.
- PAX + INFANT ve OffBlock Fuel kullanıcıya gösterilir; Load Sheet'te `Digitally Signed` yoksa uyarı verilir.
- Ekip ve HGBS crew type alanları kullanıcı tarafından düzeltilebilir.
- Kullanıcı son ekranda yalnız uçuş açmayı veya uçuş + ekip + yolcu/yakıt beyanını seçer.

## Chrome köprüsü kurulumu

1. Chrome'da `chrome://extensions` açılır.
2. **Geliştirici modu** etkinleştirilir.
3. **Paketlenmemiş öğe yükle** ile `otobeyan/chrome-extension` klasörü seçilir.
4. Eklentinin **Ayrıntılar** sayfasında **Dosya URL'lerine erişime izin ver** açılır.
5. `index.html` yeniden açılır veya tam yenilenir.

Eklenti yalnız `https://igo.sunexpress.com/*` alanına erişir ve `scripting` yetkisi ister. `tabs`/geçmiş yetkisi istemez. Kullanıcı parolayı yalnız iGO'nun kendi sayfasına girer; parola OtoBeyan'a aktarılmaz.

Şirket politikası Geliştirici Modu'nu veya paketlenmemiş eklentileri kapatıyorsa bu kodla aşılmaz. O durumda eklentinin kurum tarafından izin listesine alınması/dağıtılması ya da resmi API/kurumsal köprü gerekir.

## iGO eşleştirme

Arama sefer numarası + Excel tarihi ile yapılır. Sonuç, mümkün olduğunda kuyruk, rota ve saatle çapraz doğrulanır. Load Sheet adresinde `ID` güncel `WBMainID`, `MODE=LS` Load Sheet modudur; `Sxs` yalnız cache-buster'dır.

- `Y 183+3` = 183 PAX + 3 INFANT
- Beyan yakıtı = `OffBlock Fuel`
- `Digitally Signed` yoksa veri hazırlanır fakat kullanıcıya finalize uyarısı gösterilir.
- Load Sheet crew sayısı beyan kaynağı değildir; ekip GenDec tablosundan gelir.

## Tek Cloudflare Worker

iGO ve TGS mail erişimi aynı `otobeyan/cloudflare-worker/` projesindedir. Tek
Worker kullanılması tek kod tabanı ve tek istemci adresi anlamına gelir; iGO
Browser Rendering oturumu ile EWS istekleri yine ayrı modüllerde kalır. Kurulum
adımları için `otobeyan/cloudflare-worker/README.md` dosyasına bakın. Yerel npm,
Wrangler kurulumu veya deploy işlemi yapılmaz.
