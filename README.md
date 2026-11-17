# Kremelim Butik Operasyon

TikTok canlı yayın stok takibi, WhatsApp ekran görüntüsü eşleştirme ve otomatik yanıt botu, 0–9 telefon son 4 hane raf gruplaması, IBAN dekont tekrar kontrolü, termal kargo barkod etiketleme, Three.js 3D ürün stüdyosu ve Gemini Live ses transkripsiyon platformu.

## Özellikler

- **Toptan Ürün & Beden Stok Yönetimi**: `S / M / L / XL` bazında toplam, ayrılan ve satılan adet takibi.
- **TikTok Canlı Yayın & Otomatik Stok Duyurusu**: Yayındaki ürünü değiştirme, stok tükendiğinde veya ödenmemiş ayırma bulunduğunda otomatik duyuru metni üretme.
- **WhatsApp Botu & Çoklu Sepet**: Ekran görüntüsü analizi (`gemini-4-hydrogen`), yeni/kayıtlı müşteri kontrolü, `@kullanıcı` eksik bilgi isteme, ilk yazan önceliğiyle sepete ayırma.
- **0–9 Raf & Son 4 Hane Gruplama**: Telefon numarasının son hanesine göre 0–9 raf grupları, fiziksel ayırma etiketi ve ek ürün ekleme.
- **IBAN Özeti & Dekont Tekrar Kontrolü**: Kalem kalem IBAN ödeme mesajı oluşturma, dekont saat/tarih/referans tekrar kontrolü, bekletme sebepleri ve 2–3 iş günü kargo SLA takibi.
- **Termal Kargo Barkod Etiketi**: Müşteri, telefon, adres, ürünler, toplam tutar ve bekletme sebebini içeren yazdırmaya hazır barkod etiketi.
- **Three.js 3D Stüdyo**: PBR kumaş malzemeleri, katman ayrımı, kamera önayarları ve etkileşimli 0–9 raf seçimi.
- **Gerçek Zamanlı Ses Deşifresi**: Gemini Live API (`gemini-3.5-transcribe-live`) WebSocket ses akışı ve ses dosyası çözümleme (`gemini-3.5-transcribe`).
- **Cloud SQL (PostgreSQL) & Drizzle ORM**: Firebase Authentication korumalı kalıcı ilişkisel veritabanı.

## Kurulum

```bash
npm install
npm run dev
```

Hedef GitHub deposu: `https://github.com/Kremelim/butik`
