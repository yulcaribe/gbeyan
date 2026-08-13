# Beyan Mail - tek dosyalik Cloudflare Worker

`worker.js` hem mail arayuzunu hem de Exchange ActiveSync API'sini icerir. Ayri bir `index.html` yuklenmez.

1. Cloudflare Dashboard'da `steep-bird-37cf` Worker'ini acin.
2. **Edit Code** ekraninda mevcut kodun tamamini silin.
3. `worker.js` dosyasinin tamamini yapistirin ve **Deploy** tusuna basin.
4. `https://steep-bird-37cf.mehmetisaacar47.workers.dev/` adresini acin.
5. `tgs\\` sonrasindaki kullanici adini (ornegin `ma056814`) ve mail parolasini girip **Mailleri Getir** tusuna basin.

Istemci `SXS\\GenDec` klasorunu okur. Bir mailde PDF eki varsa ekin adina tiklayarak indirebilirsiniz. Kullanici adi ve parola Worker tarafinda saklanmaz; tarayicidan her istekte Exchange'e gonderilir. Parola zorunludur.

## Beyan entegrasyonu

Worker asagidaki endpoint'leri sunar:

- `GET /api/login`: Kullanici bilgilerini ve `SXS\\GenDec` erisimini kontrol eder.
- `GET /api/flight-pdf?flightNo=XQ111&date=2026-08-13`: Tarih ve sefer numarasina uyan GenDec PDF ekini dondurur.
- `GET /api/messages`: Bagimsiz test ekranindaki mail listesini dondurur.
- `GET /api/attachment?id=...`: Test ekranindan secilen eki indirir.

Beyan sayfasi `gendec/mail-integration.js` dosyasini yukler. Mail bilgileri localStorage'a yazilmaz; sayfa yenilendiginde veya HGBS'den cikis yapildiginda bellekten silinir.
