require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

// İzin verilen kullanıcıları yükle
let allowedUsers = { admin: [], users: [] };
try {
    const allowedUsersPath = path.join(__dirname, 'allowed-users.json');
    if (fs.existsSync(allowedUsersPath)) {
        allowedUsers = JSON.parse(fs.readFileSync(allowedUsersPath, 'utf8'));
    }
} catch (error) {
    console.error('allowed-users.json yüklenemedi:', error);
}

const localUsersPath = path.join(__dirname, 'local-users.json');
let localUsers = [];

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function loadLocalUsers() {
    try {
        if (fs.existsSync(localUsersPath)) {
            const parsed = JSON.parse(fs.readFileSync(localUsersPath, 'utf8'));
            localUsers = Array.isArray(parsed.users) ? parsed.users : [];
        } else {
            localUsers = [];
            saveLocalUsers();
        }
    } catch (error) {
        console.error('local-users.json yüklenemedi:', error);
        localUsers = [];
    }
}

function saveLocalUsers() {
    try {
        fs.writeFileSync(localUsersPath, JSON.stringify({ users: localUsers }, null, 2), 'utf8');
    } catch (error) {
        console.error('local-users.json kaydedilemedi:', error);
    }
}

function getLocalUserByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    return localUsers.find(user => normalizeEmail(user.email) === normalizedEmail) || null;
}

function sanitizeLocalUser(user) {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        hasPassword: Boolean(user.passwordHash),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt || null
    };
}

function syncAllowedUsersRole(email, name, role) {
    const normalizedEmail = normalizeEmail(email);

    if (!allowedUsers.admin) allowedUsers.admin = [];
    if (!allowedUsers.users) allowedUsers.users = [];

    allowedUsers.admin = allowedUsers.admin.filter(user => normalizeEmail(user.email) !== normalizedEmail);
    allowedUsers.users = allowedUsers.users.filter(user => normalizeEmail(user.email) !== normalizedEmail);

    const targetList = role === 'admin' ? allowedUsers.admin : allowedUsers.users;
    targetList.push({
        email: normalizedEmail,
        name: String(name || normalizedEmail.split('@')[0]).trim()
    });

    saveAllowedUsers();
}

function removeAllowedUserByEmail(email) {
    const normalizedEmail = normalizeEmail(email);

    if (!allowedUsers.admin) allowedUsers.admin = [];
    if (!allowedUsers.users) allowedUsers.users = [];

    allowedUsers.admin = allowedUsers.admin.filter(user => normalizeEmail(user.email) !== normalizedEmail);
    allowedUsers.users = allowedUsers.users.filter(user => normalizeEmail(user.email) !== normalizedEmail);

    saveAllowedUsers();
}

// Eğitim adları mapping dosyasını yükle ve kaydet
const educationMappingPath = path.join(__dirname, 'education-names.json');
let educationNames = {};

function loadEducationNames() {
    try {
        if (fs.existsSync(educationMappingPath)) {
            educationNames = JSON.parse(fs.readFileSync(educationMappingPath, 'utf8'));
        }
    } catch (error) {
        console.error('education-names.json yüklenemedi:', error);
        educationNames = {};
    }
}

function saveEducationNames() {
    try {
        fs.writeFileSync(educationMappingPath, JSON.stringify(educationNames, null, 2), 'utf8');
    } catch (error) {
        console.error('education-names.json kaydedilemedi:', error);
    }
}

function addEducationMapping(slug, originalName) {
    if (!educationNames[slug]) {
        educationNames[slug] = originalName;
        saveEducationNames();
    }
}

function slugifyEducationName(text) {
    const rawText = String(text || '').trim();
    const asciiText = turkishToEnglish(rawText);
    return asciiText
        .replace(/[^a-z0-9-_]/gi, '-')
        .toLowerCase()
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function getManagedEducationList() {
    const educationSlugs = Object.keys(educationNames);
    return educationSlugs.map(slug => {
        const egitimPath = path.join(uploadsDir, slug);
        let photoCount = 0;

        if (fs.existsSync(egitimPath)) {
            const files = fs.readdirSync(egitimPath);
            photoCount = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f)).length;
        }

        return {
            name: slug,
            displayName: educationNames[slug],
            photoCount
        };
    });
}

loadEducationNames();
loadLocalUsers();

// Email'in izine sahip olup olmadığını kontrol et ve rolünü döndür
function getUserRole(email) {
    const normalizedEmail = normalizeEmail(email);

    // Admin kontrol
    if (allowedUsers.admin && allowedUsers.admin.some(user => normalizeEmail(user.email) === normalizedEmail && user.enabled !== false)) {
        return 'admin';
    }
    
    // User kontrol
    if (allowedUsers.users && allowedUsers.users.some(user => normalizeEmail(user.email) === normalizedEmail && user.enabled !== false)) {
        return 'user';
    }
    
    return null; // İzinsiz
}

function isUserAllowed(email) {
    return getUserRole(email) !== null;
}

function buildAccessUsersList() {
    const accessMap = new Map();

    (allowedUsers.admin || []).forEach(user => {
        const email = normalizeEmail(user.email);
        if (!email) return;
        accessMap.set(email, {
            email,
            name: user.name || email.split('@')[0],
            role: 'admin',
            allowed: user.enabled !== false,
            googleEnabled: true,
            localEnabled: false
        });
    });

    (allowedUsers.users || []).forEach(user => {
        const email = normalizeEmail(user.email);
        if (!email) return;
        const existing = accessMap.get(email);
        if (existing) {
            existing.role = existing.role || 'user';
            existing.allowed = existing.allowed || (user.enabled !== false);
            existing.googleEnabled = true;
            existing.name = existing.name || user.name || email.split('@')[0];
            return;
        }

        accessMap.set(email, {
            email,
            name: user.name || email.split('@')[0],
            role: 'user',
            allowed: user.enabled !== false,
            googleEnabled: true,
            localEnabled: false
        });
    });

    localUsers.forEach(localUser => {
        const email = normalizeEmail(localUser.email);
        if (!email) return;

        const existing = accessMap.get(email);
        if (existing) {
            existing.localEnabled = true;
            existing.name = existing.name || localUser.name || email.split('@')[0];
            existing.role = existing.role || localUser.role || 'user';
            return;
        }

        accessMap.set(email, {
            email,
            name: localUser.name || email.split('@')[0],
            role: localUser.role || 'user',
            allowed: false,
            googleEnabled: false,
            localEnabled: true
        });
    });

    return Array.from(accessMap.values()).sort((a, b) => a.email.localeCompare(b.email, 'tr'));
}

function getActiveAdminCount() {
    return buildAccessUsersList().filter(user => user.role === 'admin' && user.allowed).length;
}

function isLastActiveAdminEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    const users = buildAccessUsersList();
    const target = users.find(user => user.email === normalizedEmail);
    if (!target) return false;

    return target.role === 'admin' && target.allowed && getActiveAdminCount() <= 1;
}

// Türkçe karakterleri İngilizce karşılıklarına çevir
function turkishToEnglish(text) {
    const charMap = {
        'ç': 'c', 'Ç': 'C',
        'ğ': 'g', 'Ğ': 'G',
        'ı': 'i', 'İ': 'I',
        'ö': 'o', 'Ö': 'O',
        'ş': 's', 'Ş': 'S',
        'ü': 'u', 'Ü': 'U'
    };
    
    return text.split('').map(char => charMap[char] || char).join('');
}

const app = express();
app.set('trust proxy', 1); 
const PORT = process.env.PORT || 3000;

// Session konfigürasyonu
app.use(session({
    secret: process.env.SESSION_SECRET || 'photo-gallery-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 saat
        sameSite: 'lax'  // ← BU SATIRI EKLE
    }
}));

// Passport konfigürasyonu
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
},
function(accessToken, refreshToken, profile, cb) {
    const email = profile.emails[0].value;
    
    // Kullanıcının izni olup olmadığını kontrol et
    if (!isUserAllowed(email)) {
        return cb(null, false, { 
            message: `Üzgünüm! Email adresin (${email}) sisteme erişim için yetkili değil. Lütfen yöneticiyle iletişime geç.` 
        });
    }

    // Kullanıcı bilgilerini döndür (rol bilgisi ekle)
    const user = {
        id: profile.id,
        displayName: profile.displayName,
        firstName: profile.name.givenName,
        lastName: profile.name.familyName,
        email: email,
        photo: profile.photos[0].value,
        role: getUserRole(email)  // Admin veya user
    };
    return cb(null, user);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// Middleware
app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true
})); 

app.use(express.json());
app.use(express.static('public'));


// Uploads klasörünü oluştur
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer konfigürasyonu - dosya yükleme (önce geçici klasöre)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Önce geçici uploads klasörüne kaydet
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const userId = req.user ? req.user.id : 'anonymous';
        
        // Okunabilir tarih formatı: YYYYMMDD-HHMM
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const dateStr = `${year}${month}${day}-${hour}${minute}`;
        
        const random = Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        
        // Format: userid-YYYYMMDD-HHMM-random.ext
        // Örnek: 12345678-20260227-1430-987654321.jpg
        cb(null, `${userId}-${dateStr}-${random}${extension}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Sadece resim dosyalarına izin ver
    const allowedTypes = /jpeg|jpg|png|gif|heic|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Sadece resim dosyaları yüklenebilir!'));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

// Uploads klasörünü statik olarak serve et
app.use('/uploads', express.static(uploadsDir));

// Auth Middleware - Giriş kontrolü
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Giriş yapmanız gerekiyor' });
}

// Auth Routes

// Google OAuth başlat
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth callback
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/?auth_error=denied' }),
    (req, res) => {
        res.redirect('/');
    }
);

app.post('/api/auth/local-login', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || '');

        if (!email || !password) {
            return res.status(400).json({ error: 'Email ve şifre zorunludur' });
        }

        const localUser = getLocalUserByEmail(email);
        if (!localUser || !localUser.passwordHash) {
            return res.status(401).json({ error: 'Email veya şifre hatalı' });
        }

        if (!isUserAllowed(email)) {
            return res.status(403).json({ error: 'Bu hesap için giriş yetkisi kapalı' });
        }

        const isValidPassword = await bcrypt.compare(password, localUser.passwordHash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Email veya şifre hatalı' });
        }

        const sessionUser = {
            id: `local-${localUser.id}`,
            displayName: localUser.name,
            firstName: localUser.name,
            lastName: '',
            email: localUser.email,
            photo: `https://ui-avatars.com/api/?background=667eea&color=fff&name=${encodeURIComponent(localUser.name)}`,
            role: getUserRole(localUser.email) || localUser.role,
            authProvider: 'local'
        };

        req.login(sessionUser, (err) => {
            if (err) {
                return res.status(500).json({ error: 'Giriş yapılamadı' });
            }

            res.json({ message: 'Başarıyla giriş yapıldı', user: sessionUser });
        });
    } catch (error) {
        console.error('Local login hatası:', error);
        res.status(500).json({ error: 'Giriş sırasında hata oluştu' });
    }
});

// Kullanıcı bilgilerini getir
app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json(req.user);
    } else {
        res.status(401).json({ error: 'Giriş yapılmamış' });
    }
});

// Çıkış yap
app.post('/api/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ error: 'Çıkış yapılamadı' });
        }
        res.json({ message: 'Başarıyla çıkış yapıldı' });
    });
});

// API Endpoints

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Eğitim listesini getir
app.get('/api/egitimler', isAuthenticated, (req, res) => {
    try {
        const egitimler = getManagedEducationList();
        res.json(egitimler);
    } catch (error) {
        console.error('Eğitim listesi hatası:', error);
        res.status(500).json({ error: 'Eğitimler okunamadı' });
    }
});

// Belirli bir eğitime ait fotoğrafları listele
app.get('/api/photos/:egitimAdi', isAuthenticated, (req, res) => {
    const egitimAdi = req.params.egitimAdi;
    const egitimDir = path.join(uploadsDir, egitimAdi);
    
    if (!fs.existsSync(egitimDir)) {
        return res.json([]);
    }
    
    fs.readdir(egitimDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Dosyalar okunamadı' });
        }
        
        let photos = files
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => {
                const filePath = path.join(egitimDir, file);
                const stats = fs.statSync(filePath);
                const uploadedBy = file.split('-')[0]; // Filename formatı: userId-YYYYMMDD-HHMM-random.ext
                return {
                    filename: file,
                    url: `/uploads/${egitimAdi}/${file}`,
                    uploadDate: stats.mtime,
                    size: stats.size,
                    egitim: egitimAdi,
                    uploadedBy: uploadedBy
                };
            });
        
        // User ise sadece kendi fotoğraflarını göster
        if (req.user.role === 'user') {
            photos = photos.filter(photo => photo.uploadedBy === req.user.id);
        }
        
        photos.sort((a, b) => b.uploadDate - a.uploadDate);
        res.json(photos);
    });
});

// Tüm fotoğrafları listele (tüm eğitimlerden)
app.get('/api/photos', isAuthenticated, (req, res) => {
    fs.readdir(uploadsDir, { withFileTypes: true }, (err, items) => {
        if (err) {
            return res.status(500).json({ error: 'Dosyalar okunamadı' });
        }
        
        let allPhotos = [];
        const directories = items.filter(item => item.isDirectory());
        
        directories.forEach(dir => {
            const egitimPath = path.join(uploadsDir, dir.name);
            const files = fs.readdirSync(egitimPath);
            
            files.filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
                .forEach(file => {
                    const filePath = path.join(egitimPath, file);
                    const stats = fs.statSync(filePath);
                    const uploadedBy = file.split('-')[0]; // Filename formatı: userId-YYYYMMDD-HHMM-random.ext
                    
                    allPhotos.push({
                        filename: file,
                        url: `/uploads/${dir.name}/${file}`,
                        uploadDate: stats.mtime,
                        size: stats.size,
                        egitim: dir.name,
                        egitimDisplay: educationNames[dir.name] || dir.name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                        uploadedBy: uploadedBy
                    });
                });
        });
        
        // User ise sadece kendi fotoğraflarını göster
        if (req.user.role === 'user') {
            allPhotos = allPhotos.filter(photo => photo.uploadedBy === req.user.id);
        }
        
        allPhotos.sort((a, b) => b.uploadDate - a.uploadDate);
        res.json(allPhotos);
    });
});

// Fotoğraf yükle (sadece giriş yapmış kullanıcılar)
app.post('/api/upload', isAuthenticated, (req, res) => {
    const uploadHandler = upload.single('photo');
    
    uploadHandler(req, res, function(err) {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: 'Fotoğraf seçilmedi' });
        }
        
        if (!req.body.egitimAdi) {
            // Geçici dosyayı sil
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Eğitim adı girilmedi' });
        }

        const requestedValue = String(req.body.egitimAdi || '').trim();
        let egitimAdi = requestedValue;

        if (!educationNames[egitimAdi]) {
            const slugFromText = slugifyEducationName(requestedValue);
            if (educationNames[slugFromText]) {
                egitimAdi = slugFromText;
            }
        }

        if (!educationNames[egitimAdi]) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Geçersiz eğitim seçimi. Lütfen listeden eğitim seçin.' });
        }

        const originalEgitimAdi = educationNames[egitimAdi];
        const egitimDir = path.join(uploadsDir, egitimAdi);

        // Eğitim klasörünü oluştur
        if (!fs.existsSync(egitimDir)) {
            fs.mkdirSync(egitimDir, { recursive: true });
        }
        
        // Dosya adı formatı: userid-YYYYMMDD-HHMM-random.ext
        const filename = req.file.filename;
        const newPath = path.join(egitimDir, filename);
        
        // Dosyayı taşı
        fs.renameSync(req.file.path, newPath);
        
        res.json({
            message: 'Fotoğraf başarıyla yüklendi',
            file: {
                filename: filename,
                url: `/uploads/${egitimAdi}/${filename}`,
                size: req.file.size,
                egitim: egitimAdi,
                egitimDisplay: originalEgitimAdi
            }
        });
    });
});

function requireAdminRole(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Giriş yapmanız gerekiyor' });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gerekli' });
    }

    next();
}

app.get('/api/admin/educations', requireAdminRole, (req, res) => {
    try {
        const egitimler = getManagedEducationList();
        res.json(egitimler);
    } catch (error) {
        console.error('Admin eğitim listesi hatası:', error);
        res.status(500).json({ error: 'Eğitimler okunamadı' });
    }
});

app.post('/api/admin/educations', requireAdminRole, (req, res) => {
    const originalName = String(req.body.name || '').trim();

    if (!originalName) {
        return res.status(400).json({ error: 'Eğitim adı zorunludur' });
    }

    const slug = slugifyEducationName(originalName);
    if (!slug) {
        return res.status(400).json({ error: 'Geçerli bir eğitim adı girin' });
    }

    if (educationNames[slug]) {
        return res.status(400).json({ error: 'Bu eğitim zaten mevcut' });
    }

    addEducationMapping(slug, originalName);

    const egitimDir = path.join(uploadsDir, slug);
    if (!fs.existsSync(egitimDir)) {
        fs.mkdirSync(egitimDir, { recursive: true });
    }

    res.json({
        message: 'Eğitim başarıyla eklendi',
        education: {
            name: slug,
            displayName: originalName,
            photoCount: 0
        }
    });
});

app.get('/api/admin/system-users', requireAdminRole, (req, res) => {
    const users = localUsers
        .map(sanitizeLocalUser)
        .sort((a, b) => a.email.localeCompare(b.email, 'tr'));

    res.json(users);
});

app.get('/api/admin/access-users', requireAdminRole, (req, res) => {
    const users = buildAccessUsersList();
    res.json(users);
});

app.patch('/api/admin/access-users/:email', requireAdminRole, (req, res) => {
    try {
        const email = normalizeEmail(req.params.email);
        const role = req.body.role === 'admin' ? 'admin' : 'user';
        const allowed = req.body.allowed !== false;

        const existingAccess = buildAccessUsersList().find(user => user.email === email);
        if (!existingAccess) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const isDemotingOrDisablingLastAdmin =
            existingAccess.role === 'admin' &&
            existingAccess.allowed &&
            (role !== 'admin' || !allowed) &&
            getActiveAdminCount() <= 1;

        if (isDemotingOrDisablingLastAdmin) {
            return res.status(400).json({ error: 'Sistemdeki son yönetici devre dışı bırakılamaz veya rolü düşürülemez' });
        }

        const displayName = existingAccess.name || email.split('@')[0];

        removeAllowedUserByEmail(email);
        const targetList = role === 'admin' ? (allowedUsers.admin || []) : (allowedUsers.users || []);
        if (role === 'admin') {
            allowedUsers.admin = targetList;
        } else {
            allowedUsers.users = targetList;
        }

        targetList.push({ email, name: displayName, enabled: allowed });
        saveAllowedUsers();

        const localUser = getLocalUserByEmail(email);
        if (localUser) {
            localUser.role = role;
            localUser.updatedAt = new Date().toISOString();
            saveLocalUsers();
        }

        const updated = buildAccessUsersList().find(user => user.email === email);
        res.json({ message: 'Giriş yetkisi güncellendi', user: updated });
    } catch (error) {
        console.error('Giriş yetkisi güncelleme hatası:', error);
        res.status(500).json({ error: 'Giriş yetkisi güncellenemedi' });
    }
});

app.delete('/api/admin/access-users/:email', requireAdminRole, (req, res) => {
    try {
        const email = normalizeEmail(req.params.email);

        if (!email) {
            return res.status(400).json({ error: 'Geçersiz email' });
        }

        if (normalizeEmail(req.user.email) === email) {
            return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz' });
        }

        if (isLastActiveAdminEmail(email)) {
            return res.status(400).json({ error: 'Sistemdeki son yönetici silinemez' });
        }

        const existingAccess = buildAccessUsersList().find(user => user.email === email);
        if (!existingAccess) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        removeAllowedUserByEmail(email);

        const localIndex = localUsers.findIndex(user => normalizeEmail(user.email) === email);
        if (localIndex !== -1) {
            localUsers.splice(localIndex, 1);
            saveLocalUsers();
        }

        res.json({ message: `${email} sistem erişiminden kaldırıldı` });
    } catch (error) {
        console.error('Erişim kullanıcısı silme hatası:', error);
        res.status(500).json({ error: 'Kullanıcı silinemedi' });
    }
});

app.post('/api/admin/system-users', requireAdminRole, async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const name = String(req.body.name || '').trim();
        const password = String(req.body.password || '');
        const role = req.body.role === 'admin' ? 'admin' : 'user';

        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Geçerli bir email girin' });
        }

        if (!name) {
            return res.status(400).json({ error: 'Ad Soyad zorunludur' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır' });
        }

        if (getLocalUserByEmail(email)) {
            return res.status(400).json({ error: 'Bu email ile kullanıcı zaten var' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const newUser = {
            id: randomUUID(),
            email,
            name,
            role,
            passwordHash,
            createdAt: new Date().toISOString()
        };

        localUsers.push(newUser);
        saveLocalUsers();
        syncAllowedUsersRole(email, name, role);

        res.json({
            message: 'Kullanıcı başarıyla eklendi',
            user: sanitizeLocalUser(newUser)
        });
    } catch (error) {
        console.error('Kullanıcı ekleme hatası:', error);
        res.status(500).json({ error: 'Kullanıcı eklenemedi' });
    }
});

app.patch('/api/admin/system-users/:email', requireAdminRole, async (req, res) => {
    try {
        const email = normalizeEmail(req.params.email);
        const user = getLocalUserByEmail(email);

        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const nextName = req.body.name !== undefined ? String(req.body.name).trim() : user.name;
        const nextRole = req.body.role !== undefined ? (req.body.role === 'admin' ? 'admin' : 'user') : user.role;
        const nextPassword = req.body.password !== undefined ? String(req.body.password) : '';

        if (!nextName) {
            return res.status(400).json({ error: 'Ad Soyad boş olamaz' });
        }

        const existingAccess = buildAccessUsersList().find(accessUser => accessUser.email === email);
        const isDemotingLastAdmin =
            existingAccess &&
            existingAccess.role === 'admin' &&
            existingAccess.allowed &&
            nextRole !== 'admin' &&
            getActiveAdminCount() <= 1;

        if (isDemotingLastAdmin) {
            return res.status(400).json({ error: 'Sistemdeki son yönetici rolü düşürülemez' });
        }

        user.name = nextName;
        user.role = nextRole;

        if (req.body.password !== undefined) {
            if (nextPassword.length < 6) {
                return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır' });
            }
            user.passwordHash = await bcrypt.hash(nextPassword, 10);
        }

        user.updatedAt = new Date().toISOString();
        saveLocalUsers();
        syncAllowedUsersRole(user.email, user.name, user.role);

        res.json({
            message: 'Kullanıcı güncellendi',
            user: sanitizeLocalUser(user)
        });
    } catch (error) {
        console.error('Kullanıcı güncelleme hatası:', error);
        res.status(500).json({ error: 'Kullanıcı güncellenemedi' });
    }
});

app.delete('/api/admin/system-users/:email', requireAdminRole, (req, res) => {
    try {
        const email = normalizeEmail(req.params.email);

        if (!email) {
            return res.status(400).json({ error: 'Geçersiz email' });
        }

        if (normalizeEmail(req.user.email) === email) {
            return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz' });
        }

        if (isLastActiveAdminEmail(email)) {
            return res.status(400).json({ error: 'Sistemdeki son yönetici silinemez' });
        }

        const userIndex = localUsers.findIndex(user => normalizeEmail(user.email) === email);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const deletedUser = localUsers[userIndex];
        localUsers.splice(userIndex, 1);
        saveLocalUsers();
        removeAllowedUserByEmail(email);

        res.json({ message: `${deletedUser.email} silindi` });
    } catch (error) {
        console.error('Kullanıcı silme hatası:', error);
        res.status(500).json({ error: 'Kullanıcı silinemedi' });
    }
});

// Admin Middleware - Sadece ilk kurulumda veya özel token ile
function isAdmin(req, res, next) {
    const adminToken = process.env.ADMIN_TOKEN || 'admin-secret-token-change-this';
    const token = req.headers['x-admin-token'];
    
    if (token === adminToken) {
        return next();
    }
    res.status(403).json({ error: 'Yönetici yetkisi gerekli' });
}

// İzin verilen kullanıcıları listele
app.get('/api/admin/allowed-users', isAdmin, (req, res) => {
    res.json(allowedUsers);
});

// Admin ekle
app.post('/api/admin/users/admin', isAdmin, (req, res) => {
    const { email, name } = req.body;
    
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Geçerli bir email girin' });
    }

    if (!allowedUsers.admin) {
        allowedUsers.admin = [];
    }

    if (allowedUsers.admin.some(user => user.email === email)) {
        return res.status(400).json({ error: 'Bu email zaten admin' });
    }
    
    // User listesinden çıkar
    if (allowedUsers.users) {
        allowedUsers.users = allowedUsers.users.filter(user => user.email !== email);
    }

    allowedUsers.admin.push({ email, name: name || email.split('@')[0] });
    saveAllowedUsers();
    
    res.json({ message: `${email} başarıyla yönetici olarak eklendi` });
});

// User ekle
app.post('/api/admin/users/user', isAdmin, (req, res) => {
    const { email, name } = req.body;
    
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Geçerli bir email girin' });
    }

    if (!allowedUsers.users) {
        allowedUsers.users = [];
    }

    if (allowedUsers.users.some(user => user.email === email)) {
        return res.status(400).json({ error: 'Bu email zaten kullanıcı' });
    }
    
    // Admin listesinden çıkar
    if (allowedUsers.admin) {
        allowedUsers.admin = allowedUsers.admin.filter(user => user.email !== email);
    }

    allowedUsers.users.push({ email, name: name || email.split('@')[0] });
    saveAllowedUsers();
    
    res.json({ message: `${email} başarıyla kullanıcı olarak eklendi` });
});

// Kullanıcı kaldır
app.delete('/api/admin/users', isAdmin, (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email gerekli' });
    }

    let removed = false;
    
    if (allowedUsers.admin) {
        const index = allowedUsers.admin.findIndex(user => user.email === email);
        if (index !== -1) {
            allowedUsers.admin.splice(index, 1);
            removed = true;
        }
    }
    
    if (allowedUsers.users && !removed) {
        const index = allowedUsers.users.findIndex(user => user.email === email);
        if (index !== -1) {
            allowedUsers.users.splice(index, 1);
            removed = true;
        }
    }

    if (!removed) {
        return res.status(400).json({ error: 'Kullanıcı bulunamadı' });
    }

    saveAllowedUsers();
    res.json({ message: `${email} başarıyla kaldırıldı` });
});

// İzin verilen kullanıcıları dosyaya kaydet
function saveAllowedUsers() {
    try {
        const allowedUsersPath = path.join(__dirname, 'allowed-users.json');
        fs.writeFileSync(allowedUsersPath, JSON.stringify(allowedUsers, null, 2), 'utf8');
    } catch (error) {
        console.error('allowed-users.json kaydedilemedi:', error);
    }
}
app.delete('/api/photos/:egitimAdi/:filename', isAuthenticated, (req, res) => {
    // Sadece admin resimleri silmeyi yapabilir
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Resimleri silme yetkisi sadece yöneticilere aittir' });
    }
    
    const { egitimAdi, filename } = req.params;
    const filePath = path.join(uploadsDir, egitimAdi, filename);
    
    fs.unlink(filePath, (err) => {
        if (err) {
            return res.status(500).json({ error: 'Dosya silinemedi' });
        }
        res.json({ message: 'Fotoğraf başarıyla silindi' });
    });
});

// Sunucuyu başlat
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Fotoğraf galerisi sunucusu http://localhost:${PORT} adresinde çalışıyor`);
});
