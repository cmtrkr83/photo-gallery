# Node.js resmi imajını kullan
FROM node:18-alpine

# Çalışma dizinini oluştur
WORKDIR /app

# Package dosyalarını kopyala
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm install --production

# Uygulama dosyalarını kopyala
COPY . .

# Uploads klasörünü oluştur
RUN mkdir -p /app/uploads

# Port açıklaması
EXPOSE 3000

# Uygulamayı başlat
CMD ["node", "server.js"]
