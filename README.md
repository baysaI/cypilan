# CYPILAN.COM - Kıbrıs Dijital Pazaryeri & İlan Ekosistemi

CYPILAN.COM, Kıbrıs genelinde Emlak, Vasıta, İkinci El, İş İlanları ve Usta/Hizmetler kategorilerinde hizmet veren modern dijital ilan platformudur.

## 🌍 Çeviri & Çoklu Dil (i18n) Yönetimi

Platform **5 dili** yerel düzeyde destekler:
- 🇹🇷 **Türkçe** (`tr`) - Ana Geliştirme Dili
- 🇬🇧 **İngilizce** (`en`)
- 🇬🇷 **Yunanca** (`el`)
- 🇷🇺 **Rusça** (`ru`)
- 🇮🇷 **Farsça** (`fa`) - RTL Desteği ile

### Yeni Özellik Eklerken Çeviri İş Akışı

Yeni bir özellik veya sayfa eklediğinizde dillerin yarım yamalak kalmaması için aşağıdaki basit adımları takip edin:

1. **Yeni Metinleri `locales/tr.json` Dosyasına Ekleyin**:
   Tüm yeni kullanıcı arayüzü metinlerini `tr.json` içindeki uygun namespace (`nav`, `listing`, `pages`, `auth` vb.) altına ekleyin.

2. **Otomatik Senkronizasyon & Çeviri Komutunu Çalıştırın**:
   ```bash
   npm run i18n:sync
   ```
   Bu komut `tr.json` dosyasındaki yeni eklenen tüm anahtarları otomatik olarak algılar ve Google Translate API altyapısı kullanarak **İngilizce, Yunanca, Rusça ve Farsça** JSON dosyalarına entegre eder. Değişken parametreleri (`{name}`, `{count}` vb.) otomatik olarak korur.

3. **Çeviri Paritesini Doğrulayın**:
   ```bash
   npm run i18n:check
   ```
   Tüm dillerin anahtar sayılarının 100% eşit ve eksiksiz olduğunu doğrular.

4. **Kod İçi Taramayı Çalıştırın**:
   ```bash
   npm run i18n:scan
   ```
   EJS ve JS dosyalarında kayıt dışı `t()` kullanımı veya unutulmuş sabit metin kalıntılarını tarar.

---

## 🚀 Kullanılabilir NPM Komutları

- `npm start` - Prodüksiyon sunucusunu başlatır.
- `npm run dev` - Nodemon ile geliştirme sunucusunu başlatır.
- `npm run i18n:check` - Locale JSON dosyaları arasındaki anahtar paritesini kontrol eder.
- `npm run i18n:sync` - `tr.json` dosyasındaki yeni anahtarları diğer 4 dile otomatik çevirir ve senkronize eder.
- `npm run i18n:scan` - EJS ve JS kodlarında sabit metin ve eksik dil anahtarlarını tarar.
