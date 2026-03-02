# 📸 Fotoğraf Galerisi Projesi

Docker tabanlı, modern web fotoğraf galerisi uygulaması.

## 🎯 Özellikler

- ✅ Çoklu fotoğraf yükleme
- ✅ Fotoğraf görüntüleme (lightbox)
- ✅ Fotoğraf silme
- ✅ Responsive tasarım
- ✅ Docker ile kolay kurulum
- ✅ Kalıcı veri saklama (volume)

## 🛠️ Teknolojiler

- **Backend:** Node.js + Express
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Dosya Yükleme:** Multer
- **Container:** Docker & Docker Compose

## 📋 Gereksinimler

Ubuntu Server sanal makinenizde şunların kurulu olması gerekir:

- Docker (20.10+)
- Docker Compose (1.29+)

### Docker Kurulumu (Ubuntu Server)

```bash
# Docker kurulumu
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Docker Compose kurulumu
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Kullanıcıyı docker grubuna ekle
sudo usermod -aG docker $USER
```

## 🚀 Kurulum ve Çalıştırma

### 1. Projeyi Ubuntu Server'a Aktarın

Windows Server'dan Ubuntu Server'a dosyaları aktarmak için SCP kullanabilirsiniz:

```bash
# Windows PowerShell'den
scp -r C:\Users\Cem\Desktop\photo-gallery username@ubuntu-server-ip:/home/username/
```

Alternatif olarak:
- Shared folder kullanarak
- Git repository üzerinden
- USB/Network drive ile

### 2. Ubuntu Server'da Çalıştırma

```bash
# Proje klasörüne gidin
cd /home/username/photo-gallery

# Docker container'ı başlatın
docker-compose up -d

# Logları görüntüleyin
docker-compose logs -f
```

### 3. Uygulamaya Erişim

Tarayıcınızdan şu adrese gidin:
```
http://ubuntu-server-ip:3000
```

## 📁 Proje Yapısı

```
photo-gallery/
├── server.js              # Backend sunucu
├── package.json           # Node.js bağımlılıkları
├── Dockerfile            # Docker imaj tanımı
├── docker-compose.yml    # Docker Compose yapılandırması
├── .dockerignore         # Docker ignore dosyası
├── .gitignore           # Git ignore dosyası
├── public/              # Frontend dosyaları
│   ├── index.html       # Ana sayfa
│   ├── styles.css       # Stil dosyası
│   └── app.js          # JavaScript mantığı
└── uploads/            # Yüklenen fotoğraflar (otomatik oluşur)
```

## 🔧 Yapılandırma

### Port Değiştirme

`docker-compose.yml` dosyasında portu değiştirebilirsiniz:

```yaml
ports:
  - "8080:3000"  # Sol taraf: dış port, sağ taraf: iç port
```

### Upload Limiti Değiştirme

`server.js` dosyasında upload limitini ayarlayabilirsiniz (varsayılan: 5MB):

```javascript
limits: { fileSize: 5 * 1024 * 1024 }, // 5MB (güvenlik için sınırlandırılmıştır)
```

## 📝 API Endpoints

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/photos` | Tüm fotoğrafları listele |
| POST | `/api/upload` | Yeni fotoğraf yükle |
| DELETE | `/api/photos/:filename` | Fotoğraf sil |

## 🐳 Docker Komutları

```bash
# Container'ı başlat
docker-compose up -d

# Container'ı durdur
docker-compose down

# Logları görüntüle
docker-compose logs -f

# Container'ı yeniden başlat
docker-compose restart

# Container durumunu kontrol et
docker-compose ps

# İmajı yeniden oluştur
docker-compose build --no-cache
```

## � Veri Kalıcılığı (Docker Volume)

Resimleri içeren `uploads` klasörü **Named Volume** ile Docker sisteminde saklanır:

```bash
# Volume listesini görüntüle
docker volume ls

# Spesifik volume bilgileri
docker volume inspect photo-gallery-uploads

# Volume yedekle
docker run --rm -v photo-gallery-uploads:/data -v $(pwd):/backup alpine tar czf /backup/photo-gallery-backup.tar.gz -C /data .

# Volume'dan yedek geri yükle
docker run --rm -v photo-gallery-uploads:/data -v $(pwd):/backup alpine tar xzf /backup/photo-gallery-backup.tar.gz -C /data

# Volume silme (dikkat: veriler kalıcı olarak silinir)
docker volume rm photo-gallery-uploads
```

**Avantajları:**
- ✅ Container silinse/yeniden oluşturulsa bile veriler kalır
- ✅ Host makinesi formatlanırsa da Docker volumeleri korunur
- ✅ Docker tarafından otomatik yönetilir
- ✅ Kolay yedekleme ve taşıma
- ✅ Üretim ortamı için güvenli

## 🔒 Güvenlik Notları

**Üretim ortamı için öneriler:**

1. **Google OAuth** yapılandırması kontrol edin (`.env` dosyasında)
2. **Session Secret** güçlü olduğundan emin olun
3. **Nginx Reverse Proxy** kullanın
4. **SSL/TLS** sertifikası ekleyin (Let's Encrypt)
5. **Kimlik doğrulama** sistemi (mevcut)
6. **Rate limiting** uygulayın
7. **Dosya boyutu** (5MB) ve **format kontrolü** yapın (mevcut)
8. `.env` dosyası ile hassas bilgileri saklayın
9. **Regular backups** alın

## 🌐 Yerel Geliştirme (İsteğe Bağlı)

Docker olmadan geliştirme yapmak için:

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme modunda çalıştır (nodemon ile)
npm run dev

# Normal çalıştırma
npm start
```

## 📊 Veri Yedekleme

Fotoğraflar `./uploads` klasöründe saklanır. Yedekleme için:

```bash
# Yedek al
tar -czf photo-backup-$(date +%Y%m%d).tar.gz uploads/

# Yedekten geri yükle
tar -xzf photo-backup-20260227.tar.gz
```

## 🐛 Sorun Giderme

### Container başlamıyor
```bash
docker-compose logs
```

### Port zaten kullanımda
```bash
# Port değiştirin veya çakışan servisi durdurun
sudo lsof -i :3000
```

### Fotoğraflar kayboldu
- Volume bağlantısını kontrol edin
- `./uploads` klasör izinlerini kontrol edin

## 📄 Lisans

MIT License

## 👤 İletişim

Sorularınız için issue açabilirsiniz.

---

**Not:** Bu proje Windows Server 2016 üzerinde çalışan Ubuntu Server sanal makinesinde Docker ile çalıştırılmak üzere tasarlanmıştır.
