# AppCleaner (Linux)

> Kaldırılan uygulamaların geride bıraktığı artık dosyaları bulur ve temizler.

[🇬🇧 English README](README.md)

Linux'ta bir uygulamayı kaldırdığınızda paket dosyaları silinir — ama
yapılandırma, önbellek ve veri dosyaları genellikle ev dizininizde kalır.
AppCleaner bilinen konumları tarar, bulduklarını kurulu (veya kaldırılmış)
uygulamalarla fuzzy eşleştirme ile ilişkilendirir ve artıkları güvenle gözden
geçirip silmenizi sağlar.

**Tauri v2** (Rust backend) + **React** + **TypeScript** + **Tailwind CSS v4**
ile geliştirilmiştir.

## Özellikler

- Sistem, kullanıcı ve Flatpak export dizinlerindeki `.desktop` girdilerinden
  **uygulama keşfi** — isim, çalıştırılabilir ve icon çıkarımı
- Uygulamaların gerçekten iz bıraktığı yerlerde **artık taraması**:

  | Kategori | Konum |
  | --- | --- |
  | Yapılandırma | `~/.config` |
  | Önbellek | `~/.cache` |
  | Veri | `~/.local/share` |
  | Durum | `~/.local/state` |
  | Flatpak verisi | `~/.var/app` |
  | systemd user unit | `~/.config/systemd/user`, `~/.local/share/systemd/user` |
  | Otomatik başlatma | `~/.config/autostart` |

- **Güven skorlu fuzzy eşleştirme.** Paket adı ile dizin adı çoğu zaman birebir
  tutmaz (`org.gnome.Builder` / `gnome-builder` / `~/.cache/gnome-builder`).
  AppCleaner adları normalize eder; birebir, içerme ve Jaro-Winkler
  benzerliğini birleştirip her öğe için yüzde olarak güven skoru gösterir —
  neyin *neden* eşleştiğini her zaman görürsünüz.
- Her bulgu için **tam ayrıntı**: yol, boyut (dizinlerde özyinelemeli) ve son
  değişiklik tarihi.
- **Açık ve denetlenebilir silme:** checkbox ile seçin, özet ekranını inceleyin,
  "geri alınamaz" uyarısını onaylayın.
- **Varsayılan olarak açık dry-run modu.** İlk çalıştırma yalnızca neyin
  silineceğini raporlar; silmek için dry-run'ı bilinçli olarak kapatmanız
  gerekir.

## Güvenlik tasarımı

- Silme yalnızca taranan kök dizinlerin **kesinlikle içindeki** yollara izin
  verir — köklerin kendisi ve dışarıdaki hiçbir yol silinemez.
- `..` veya `.` bileşeni içeren yollar doğrudan reddedilir.
- Boyut hesaplama ve silmede sembolik bağlantılar asla izlenmez.
- Dry-run varsayılandır; gerçek silme açık bir anahtar **ve** onay penceresi
  gerektirir.
- Her eşleşme, güven skorunu ve neye göre eşleştiğini gösterir.

## Kaynaktan derleme

### Önkoşullar

- [Node.js](https://nodejs.org/) ≥ 20 ve npm
- [Rust](https://rustup.rs/) (stable)
- Linux'ta [Tauri v2 sistem bağımlılıkları](https://v2.tauri.app/start/prerequisites/#linux):

  ```sh
  # Debian / Ubuntu
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

### Derle & çalıştır

```sh
npm install
node scripts/make-icons.mjs   # uygulama ikonlarını üret (bir kez)
npm run tauri dev             # geliştirme modunda çalıştır
npm run tauri build           # dağıtım paketi üret
```

### Testler

```sh
npm run build                 # tip denetimi + frontend build
cd src-tauri
cargo test                    # birim testleri + uçtan uca akış testi
```

[`src-tauri/tests/flow.rs`](src-tauri/tests/flow.rs) tüm hattı arayüzsüz test
eder: tara → eşleştir → dry-run (hiçbir şeyin silinmediğini doğrular) →
gerçek silme → kök dışı yolların reddi.

## Gerçek ev dizinine dokunmadan deneme

İki ortam değişkeniyle **her** platformda (geliştirme için Windows/macOS dahil)
yalıtılmış test yapılabilir:

| Değişken | Amaç |
| --- | --- |
| `APPCLEANER_HOME` | Tarama/silmede kullanılan ev dizinini geçersiz kılar |
| `APPCLEANER_APP_DIRS` | `.desktop` dizinlerini geçersiz kılar (PATH ayracıyla liste) |

```sh
node scripts/make-fixture.mjs   # ./fixture altında sahte ev dizini + .desktop üretir
# scriptin yazdırdığı iki değişkeni ayarlayın, sonra:
npm run tauri dev
```

Fikstürde VLC, GNOME Builder, Spotify (Flatpak) ve Firefox için gerçekçi
artıklar var; fuzzy skorlamayı görebilmeniz için `spotifyd.service` gibi
birebir tutmayan adlar bilinçli eklendi.

## Sınırlamalar

- Tarama her kök içinde bir seviye derinliktedir; `~/.config/Vendor/App` gibi
  iç içe yollar gözden kaçabilir.
- Eşleştirme sezgiseldir. Yüksek güven kesinlik değildir — silmeden önce
  inceleyin, sonuçlara güvenene kadar dry-run'ı açık tutun.

## Lisans

[MIT Lisansı](LICENSE) ile yayınlanmıştır.
