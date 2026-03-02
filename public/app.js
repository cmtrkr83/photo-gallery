const API_URL = window.location.origin;
let allPhotos = [];
let currentUser = null;
let allEgitimler = [];
let selectedEgitim = '';
let adminSystemUsers = [];
let adminAccessUsers = [];
let activeSettingsSection = 'account';

// Sayfa yüklendiğinde kullanıcı kontrolü yap
document.addEventListener('DOMContentLoaded', async () => {
    const localLoginForm = document.getElementById('localLoginForm');
    if (localLoginForm) {
        localLoginForm.addEventListener('submit', handleLocalLoginSubmit);
    }

    await checkAuth();
});

async function handleLocalLoginSubmit(event) {
    event.preventDefault();

    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
        showError('Email ve şifre zorunludur');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/auth/local-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password })
        });

        const result = await readJsonResponse(response);
        if (!response.ok) {
            throw new Error(result.error || 'Giriş başarısız');
        }

        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';

        showSuccess('Başarıyla giriş yapıldı');
        await checkAuth();
    } catch (error) {
        console.error('Local login hatası:', error);
        showError(error.message || 'Giriş yapılamadı');
    }
}

// Kullanıcı kimlik doğrulamasını kontrol et
async function checkAuth() {
    // URL parametrelerini kontrol et
    const urlParams = new URLSearchParams(window.location.search);
    const authError = urlParams.get('auth_error');
    
    if (authError === 'denied') {
        showLoginScreen();
        showError('Üzgünüm! Email adresin sisteme erişim için yetkili değil. Lütfen yöneticiyle iletişime geç.');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/user`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            currentUser = await response.json();
            showMainApp();
            displayUserInfo();
            updateSettingsSidebarLinks();
            await loadEgitimler();
            await loadPhotos();
            setupFileInput();
        } else {
            showLoginScreen();
        }
    } catch (error) {
        console.error('Auth kontrol hatası:', error);
        showLoginScreen();
    }
}

// Login ekranını göster
function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
}

// Ana uygulamayı göster
function showMainApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
}

// Kullanıcı bilgilerini göster
function displayUserInfo() {
    if (!currentUser) return;
    
    // Navbar'da göster
    const userNameNav = document.getElementById('userNameNav');
    const userPhotoNav = document.getElementById('userPhotoNav');
    
    if (userNameNav) userNameNav.textContent = currentUser.displayName;
    if (userPhotoNav) {
        userPhotoNav.src = currentUser.photo;
        userPhotoNav.alt = currentUser.displayName;
    }
}

function updateSettingsSidebarLinks() {
    const isAdmin = currentUser && currentUser.role === 'admin';
    const educationNavItem = document.getElementById('sidebarEducationsSettings');
    const usersNavItem = document.getElementById('sidebarUsersSettings');

    if (educationNavItem) {
        educationNavItem.style.display = isAdmin ? '' : 'none';
    }

    if (usersNavItem) {
        usersNavItem.style.display = isAdmin ? '' : 'none';
    }
}

function setActiveSidebarLink(linkId) {
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    const activeLink = document.getElementById(linkId);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}

// Dashboard görünüme geç
function showDashboard(event) {
    if (event) event.preventDefault();

    setActiveSidebarLink('navDashboard');
    
    // Sayfa başlığını güncelle
    document.querySelector('.page-title').textContent = '🏠 Ana Sayfa';
    
    // Görünümleri gizle
    document.querySelectorAll('.content-view').forEach(view => {
        view.classList.remove('active');
    });
    
    // Dashboard görünümünü göster
    document.getElementById('dashboardView').classList.add('active');
    
    // İstatistikleri hesapla ve göster
    calculateStats();
    loadEgitimlerForTable();
}

// Galeri görünüme geç
function showGallery(event) {
    if (event) event.preventDefault();

    setActiveSidebarLink('navGallery');
    
    // Sayfa başlığını güncelle
    document.querySelector('.page-title').textContent = '🖼️ Galeri';
    
    // Görünümleri gizle
    document.querySelectorAll('.content-view').forEach(view => {
        view.classList.remove('active');
    });
    
    // Galeri görünümünü göster
    document.getElementById('galleryView').classList.add('active');
    
    // Fotoğrafları yükle
    loadPhotos();
}

// Ayarlar görünüme geç
function showSettings(event) {
    showSettingsSection(event, 'account');
}

function showProfileSettings(event) {
    if (event) event.preventDefault();
    showSettingsSection(null, 'account');
}

function showSettingsSection(event, sectionName) {
    if (event) event.preventDefault();

    const navMap = {
        account: null,
        educations: 'navSettingsEducations',
        users: 'navSettingsUsers'
    };

    const pageTitleMap = {
        account: '👤 Profil',
        educations: '⚙️ Eğitim Ayarları',
        users: '⚙️ Sistem Kullanıcıları'
    };

    setActiveSidebarLink(navMap[sectionName]);
    document.querySelector('.page-title').textContent = pageTitleMap[sectionName] || '⚙️ Ayarlar';

    document.querySelectorAll('.content-view').forEach(view => {
        view.classList.remove('active');
    });

    document.getElementById('settingsView').classList.add('active');
    activeSettingsSection = sectionName;
    populateSettings();
}

// Ayarlar sayfasını doldur
function populateSettings() {
    if (!currentUser) return;
    
    const roleDisplay = currentUser.role === 'admin' ? '🔐 Yönetici' : '👤 Kullanıcı';
    const roleBadgeColor = currentUser.role === 'admin' ? '#667eea' : '#48bb78';
    
    const isAdmin = currentUser.role === 'admin';

    const settingsHTML = `
            <div class="settings-pages">
                <section id="settingsSection-account" class="settings-page">
                    <div class="settings-group">
                        <h3>📋 Hesap Bilgileri</h3>
                        <div class="settings-item">
                            <label>Ad Soyad</label>
                            <p>${currentUser.displayName}</p>
                        </div>
                        <div class="settings-item">
                            <label>E-posta</label>
                            <p>${currentUser.email}</p>
                        </div>
                        <div class="settings-item">
                            <label>Rol</label>
                            <p><span style="background: ${roleBadgeColor}; color: white; padding: 6px 12px; border-radius: 20px; font-weight: 600; display: inline-block;">${roleDisplay}</span></p>
                        </div>
                        <div class="settings-item">
                            <label>Profil Fotoğrafı</label>
                            <p><img src="${currentUser.photo}" style="max-width: 100px; border-radius: 50%;"></p>
                        </div>
                    </div>

                    <div class="settings-group danger">
                        <h3>🚪 Güvenlik</h3>
                        <p style="margin-bottom: 15px; color: #718096;">Sistemden çıkış yapmak için aşağıdaki butona tıklayın</p>
                        <button class="btn-danger" onclick="confirmLogout()">Çıkış Yap</button>
                    </div>
                </section>

                ${isAdmin ? `
                <section id="settingsSection-educations" class="settings-page">
                    <div class="settings-group">
                        <h3>📚 Eğitim Yönetimi</h3>
                        <div class="settings-item">
                            <label>Yeni Eğitim Ekle</label>
                            <div class="admin-education-form">
                                <input type="text" id="newEducationInput" placeholder="Örn: Açık Uçlu Mülakat Eğitimi">
                                <button class="btn btn-view" onclick="addEducationFromAdmin()">Ekle</button>
                            </div>
                        </div>
                        <div class="settings-item">
                            <label>Tanımlı Eğitimler</label>
                            <div id="adminEducationList" class="admin-education-list"></div>
                        </div>
                    </div>
                </section>

                <section id="settingsSection-users" class="settings-page">
                    <div class="settings-group">
                        <h3>🔐 Giriş Yetkileri (Google + Email)</h3>
                        <div class="settings-item">
                            <label>Tüm Kullanıcılar</label>
                            <div id="adminAccessUserList" class="admin-user-list"></div>
                        </div>
                    </div>

                    <div class="settings-group">
                        <h3>👥 Kullanıcı Yönetimi</h3>
                        <div class="settings-item">
                            <label>Yeni Kullanıcı Ekle</label>
                            <div class="admin-user-form">
                                <input type="text" id="newUserNameInput" placeholder="Ad Soyad">
                                <input type="email" id="newUserEmailInput" placeholder="Email">
                                <input type="password" id="newUserPasswordInput" placeholder="Şifre (min 6 karakter)">
                                <select id="newUserRoleSelect">
                                    <option value="user">Kullanıcı</option>
                                    <option value="admin">Yönetici</option>
                                </select>
                                <button class="btn btn-view" onclick="addSystemUserFromAdmin()">Kullanıcı Ekle</button>
                            </div>
                        </div>
                        <div class="settings-item">
                            <label>Sistemdeki Kullanıcılar</label>
                            <div id="adminSystemUserList" class="admin-user-list"></div>
                        </div>
                    </div>
                </section>
                ` : ''}
            </div>
    `;
    
    document.querySelector('.settings-content').innerHTML = settingsHTML;

    if (!isAdmin && activeSettingsSection !== 'account') {
        activeSettingsSection = 'account';
    }

    openSettingsSection(null, activeSettingsSection);
}

function openSettingsSection(event, sectionName) {
    if (event) {
        event.preventDefault();
    }

    activeSettingsSection = sectionName;

    document.querySelectorAll('.settings-page').forEach(page => {
        page.classList.remove('active');
    });

    const activePage = document.getElementById(`settingsSection-${sectionName}`);
    if (activePage) {
        activePage.classList.add('active');
    }

    if (sectionName === 'educations' && currentUser && currentUser.role === 'admin') {
        loadAdminEducations();
    }

    if (sectionName === 'users' && currentUser && currentUser.role === 'admin') {
        loadAdminAccessUsers();
        loadAdminSystemUsers();
    }
}

// Çıkış onayı
function confirmLogout() {
    if (confirm('Sistemden çıkış yapmak istediğinize emin misiniz?')) {
        logout();
    }
}

// Dashboard istatistiklerini hesapla
function calculateStats() {
    // Toplam eğitim sayısı
    const totalEgitimCount = allEgitimler.length;
    
    // Toplam fotoğraf sayısı
    const totalPhotoCount = allPhotos.length;
    
    // Toplam depolama alanı
    let totalStorageSize = 0;
    allPhotos.forEach(photo => {
        totalStorageSize += (photo.size || 0);
    });
    
    // Kullanıcının fotoğraf sayısı (sadece bu kullanıcıya ait)
    const userPhotoCount = allPhotos.filter(photo => {
        const uploadedBy = photo.uploadedBy || photo.filename.split('-')[0];
        return uploadedBy === currentUser.id;
    }).length;
    
    // HTML'de göster
    document.getElementById('totalEgitimCount').textContent = totalEgitimCount;
    document.getElementById('totalPhotoCount').textContent = totalPhotoCount;
    document.getElementById('totalStorageSize').textContent = formatFileSize(totalStorageSize);
    document.getElementById('userPhotoCount').textContent = userPhotoCount;
}

// Dashboard için eğitim tablosunu doldur
function loadEgitimlerForTable() {
    if (!allEgitimler || allEgitimler.length === 0) {
        document.getElementById('egitimTableBody').innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; color: #718096;">Henüz eğitim yok</td>
            </tr>
        `;
        return;
    }
    
    const tableHTML = allEgitimler.map(egitim => `
        <tr>
            <td><strong>${egitim.displayName}</strong></td>
            <td style="text-align: center;">${egitim.photoCount} fotoğraf</td>
            <td style="text-align: center;">
                <button class="btn btn-view" onclick="viewEgitim('${egitim.name}')">Görüntüle</button>
            </td>
        </tr>
    `).join('');
    
    document.getElementById('egitimTableBody').innerHTML = tableHTML;
}

// Eğitim görüntüle (galeriye geç)
function viewEgitim(egitimName) {
    // Galeri görünümünü aktive et
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    const navLinks = document.querySelectorAll('.nav-link');
    if (navLinks[1]) navLinks[1].classList.add('active');
    
    document.querySelector('.page-title').textContent = '🖼️ Galeri';
    
    document.querySelectorAll('.content-view').forEach(view => {
        view.classList.remove('active');
    });
    
    document.getElementById('galleryView').classList.add('active');
    
    // Eğitimi seç ve fotoğrafları göster
    document.getElementById('egitimFilter').value = egitimName;
    changeEgitim();
}

// Çıkış yap
async function logout() {
    try {
        const response = await fetch(`${API_URL}/api/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            currentUser = null;
            showLoginScreen();
        } else {
            showError('Çıkış yapılamadı');
        }
    } catch (error) {
        console.error('Logout hatası:', error);
        showError('Çıkış yaparken bir hata oluştu');
    }
}

// Eğitim listesini yükle
async function loadEgitimler() {
    try {
        const response = await fetch(`${API_URL}/api/egitimler`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            allEgitimler = await response.json();
            updateEgitimSelector();
        } else {
            showError('Eğitim listesi yüklenemedi');
        }
    } catch (error) {
        console.error('Eğitimler yüklenemedi:', error);
        showError('Eğitim listesi yüklenirken bir hata oluştu');
    }
}

// Eğitim seçim listesini güncelle
function updateEgitimSelector() {
    const gallerySelect = document.getElementById('egitimFilter');
    gallerySelect.innerHTML = '<option value="">Tüm Eğitimler</option>';
    
    allEgitimler.forEach(egitim => {
        const option = document.createElement('option');
        option.value = egitim.name;
        option.textContent = `${egitim.displayName} (${egitim.photoCount})`;
        gallerySelect.appendChild(option);
    });

    const uploadSelect = document.getElementById('egitimAdiSelect');
    if (uploadSelect) {
        const currentValue = uploadSelect.value;
        uploadSelect.innerHTML = '<option value="">Eğitim seçin</option>';

        allEgitimler.forEach(egitim => {
            const option = document.createElement('option');
            option.value = egitim.name;
            option.textContent = egitim.displayName;
            uploadSelect.appendChild(option);
        });

        const hasCurrentValue = allEgitimler.some(egitim => egitim.name === currentValue);
        if (hasCurrentValue) {
            uploadSelect.value = currentValue;
        }
    }
}

// Eğitim değiştiğinde
async function changeEgitim() {
    const select = document.getElementById('egitimFilter');
    selectedEgitim = select.value;
    
    if (selectedEgitim) {
        // Belirli bir eğitimin fotoğraflarını yükle
        await loadPhotosByEgitim(selectedEgitim);
    } else {
        // Tüm fotoğrafları yükle
        await loadPhotos();
    }
}

// Belirli bir eğitime ait fotoğrafları yükle
async function loadPhotosByEgitim(egitimAdi) {
    try {
        const response = await fetch(`${API_URL}/api/photos/${egitimAdi}`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            allPhotos = await response.json();
            displayPhotos(allPhotos);
            updatePhotoCount();
        }
    } catch (error) {
        console.error('Fotoğraflar yüklenemedi:', error);
        showError('Fotoğraflar yüklenirken bir hata oluştu');
    }
}

// Fotoğraf sayısını güncelle
function updatePhotoCount() {
    const countElement = document.getElementById('photoCount');
    countElement.textContent = `${allPhotos.length} fotoğraf`;
}

// Fotoğrafları yükle
async function loadPhotos() {
    try {
        const response = await fetch(`${API_URL}/api/photos`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                showLoginScreen();
                return;
            }
            throw new Error('Fotoğraflar yüklenemedi');
        }
        
        allPhotos = await response.json();
        displayPhotos(allPhotos);
        updatePhotoCount();
        await loadEgitimler(); // Eğitim listesini güncelle
    } catch (error) {
        console.error('Hata:', error);
        showError('Fotoğraflar yüklenirken bir hata oluştu');
    }
}

// Fotoğrafları göster
function displayPhotos(photos) {
    const gallery = document.getElementById('gallery');
    
    if (photos.length === 0) {
        gallery.innerHTML = `
            <div class="empty-state">
                <h2>Henüz fotoğraf yok</h2>
                <p>Yukarıdaki butonu kullanarak fotoğraf yükleyebilirsiniz</p>
            </div>
        `;
        return;
    }
    
    gallery.innerHTML = photos.map(photo => `
        <div class="photo-card" data-filename="${photo.filename}">
            <img src="${photo.url}" alt="${photo.filename}" onclick="openModal('${photo.url}')">
            <div class="photo-info">
                ${photo.egitimDisplay ? `<div class="egitim-badge">📚 ${photo.egitimDisplay}</div>` : ''}
                <div class="photo-meta">
                    <span>📅 ${formatDate(photo.uploadDate)}</span>
                    <span>💾 ${formatFileSize(photo.size)}</span>
                </div>
                <div class="photo-actions">
                    <button class="btn btn-view" onclick="openModal('${photo.url}')">
                        👁️ Görüntüle
                    </button>
                    ${currentUser.role === 'admin' ? `
                        <button class="btn btn-delete" onclick="deletePhoto('${photo.egitim}', '${photo.filename}')">
                            🗑️ Sil
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

// Dosya input ayarları
function setupFileInput() {
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', handleFileSelect);
    fileInput.addEventListener('change', updateFileCount);
}

// Seçilen dosya sayısını göster
function updateFileCount() {
    const fileInput = document.getElementById('fileInput');
    const fileCount = fileInput.files.length;
    const fileCountElement = document.getElementById('fileCount');
    
    if (fileCount === 0) {
        fileCountElement.textContent = '';
    } else if (fileCount === 1) {
        fileCountElement.textContent = '1 dosya seçildi';
    } else {
        fileCountElement.textContent = `${fileCount} dosya seçildi`;
    }
}

// Dosya seçildiğinde
async function handleFileSelect(event) {
    const files = event.target.files;
    if (files.length === 0) return;
    
    // Seçilen dosyaları kontrol et
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const maxFileSize = 5 * 1024 * 1024; // 5MB limit
    
    let invalidFiles = [];
    let oversizedFiles = [];
    
    for (let file of files) {
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        const isMimeTypeValid = allowedMimeTypes.includes(file.type);
        const isExtensionValid = allowedExtensions.includes(fileExtension);
        const isFileSizeValid = file.size <= maxFileSize;
        
        if (!isMimeTypeValid || !isExtensionValid) {
            invalidFiles.push(file.name);
        }
        
        if (!isFileSizeValid) {
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            oversizedFiles.push(`${file.name} (${fileSizeMB}MB)`);
        }
    }
    
    if (invalidFiles.length > 0) {
        showError(`❌ Sadece resim dosyaları (JPG, PNG, GIF, WebP) yüklenebilir.\nGeçersiz dosyalar: ${invalidFiles.join(', ')}`);
        // Input'u temizle
        document.getElementById('fileInput').value = '';
        document.getElementById('fileCount').textContent = '';
        return;
    }
    
    if (oversizedFiles.length > 0) {
        showError(`❌ Dosya boyutu 5MB'ı geçemez!\nBüyük dosyalar: ${oversizedFiles.join(', ')}`);
        // Input'u temizle
        document.getElementById('fileInput').value = '';
        document.getElementById('fileCount').textContent = '';
        return;
    }
    
    // Bu fonksiyon artık sadece file count güncelleme için kullanılıyor
    updateFileCount();
}

// Upload butonu tıklandığında
async function submitUpload() {
    const fileInput = document.getElementById('fileInput');
    const egitimAdiSelect = document.getElementById('egitimAdiSelect');
    
    const files = fileInput.files;
    const egitimAdi = egitimAdiSelect.value;
    
    if (!egitimAdi) {
        showError('Lütfen listeden eğitim seçin!');
        return;
    }
    
    if (files.length === 0) {
        showError('Lütfen en az bir fotoğraf seçin!');
        return;
    }
    
    showInfo(`${files.length} fotoğraf yüklenmeye başlandı...`);
    
    let uploadedCount = 0;
    let failedCount = 0;
    const errors = [];
    
    for (let file of files) {
        const result = await uploadPhoto(file, egitimAdi);
        if (result.success) {
            uploadedCount++;
        } else {
            failedCount++;
            errors.push(`${file.name}: ${result.error}`);
        }
    }
    
    // Input'u temizle
    fileInput.value = '';
    document.getElementById('fileCount').textContent = '';
    
    // Sonuç mesajı göster
    if (uploadedCount > 0 && failedCount === 0) {
        showSuccess(`✅ ${uploadedCount} fotoğraf başarıyla yüklendi!`);
    } else if (uploadedCount > 0 && failedCount > 0) {
        showWarning(`⚠ ${uploadedCount} fotoğraf yüklendi, ${failedCount} fotoğraf başarısız oldu.`);
        errors.forEach(err => showError(err));
    } else {
        showError(`❌ Tüm fotoğraflar yüklenemedi!`);
        errors.forEach(err => showError(err));
    }
    
    // Galeriye tekrar yükle
    if (uploadedCount > 0) {
        setTimeout(() => {
            loadPhotos();
        }, 1500);
    }
}

async function loadAdminEducations() {
    if (!currentUser || currentUser.role !== 'admin') return;

    const listElement = document.getElementById('adminEducationList');
    if (!listElement) return;

    try {
        const response = await fetch(`${API_URL}/api/admin/educations`, {
            credentials: 'include'
        });

        if (response.status === 401) {
            showError('Oturum süresi dolmuş. Lütfen tekrar giriş yapın.');
            showLoginScreen();
            return;
        }

        if (!response.ok) {
            throw new Error('Eğitimler yüklenemedi');
        }

        const educations = await readJsonResponse(response);
        renderAdminEducationList(educations);
    } catch (error) {
        console.error('Admin eğitimleri yükleme hatası:', error);
        listElement.innerHTML = '<p class="admin-empty">Eğitim listesi alınamadı</p>';
    }
}

function renderAdminEducationList(educations) {
    const listElement = document.getElementById('adminEducationList');
    if (!listElement) return;

    if (!educations || educations.length === 0) {
        listElement.innerHTML = '<p class="admin-empty">Henüz eğitim tanımlanmadı</p>';
        return;
    }

    listElement.innerHTML = educations
        .map(education => `
            <div class="admin-education-item">
                <span>${education.displayName}</span>
                <small>${education.photoCount} fotoğraf</small>
            </div>
        `)
        .join('');
}

async function addEducationFromAdmin() {
    if (!currentUser || currentUser.role !== 'admin') return;

    const input = document.getElementById('newEducationInput');
    if (!input) return;

    const name = input.value.trim();
    if (!name) {
        showError('Lütfen eğitim adı girin');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/admin/educations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name })
        });

        if (response.status === 401) {
            showError('Oturum süresi dolmuş. Lütfen tekrar giriş yapın.');
            showLoginScreen();
            return;
        }

        const result = await readJsonResponse(response);
        if (!response.ok) {
            throw new Error(result.error || 'Eğitim eklenemedi');
        }

        input.value = '';
        showSuccess('Eğitim başarıyla eklendi');
        await loadEgitimler();
        await loadAdminEducations();
    } catch (error) {
        console.error('Eğitim ekleme hatası:', error);
        showError(error.message || 'Eğitim eklenemedi');
    }
}

async function loadAdminSystemUsers() {
    if (!currentUser || currentUser.role !== 'admin') return;

    const listElement = document.getElementById('adminSystemUserList');
    if (!listElement) return;

    try {
        const response = await fetch(`${API_URL}/api/admin/system-users`, {
            credentials: 'include'
        });

        if (!response.ok) {
            const result = await readJsonResponse(response);
            throw new Error(result.error || 'Kullanıcı listesi alınamadı');
        }

        adminSystemUsers = await readJsonResponse(response);
        renderAdminSystemUserList(adminSystemUsers);
    } catch (error) {
        console.error('Kullanıcı listesi hatası:', error);
        listElement.innerHTML = '<p class="admin-empty">Kullanıcı listesi alınamadı</p>';
    }
}

async function loadAdminAccessUsers() {
    if (!currentUser || currentUser.role !== 'admin') return;

    const listElement = document.getElementById('adminAccessUserList');
    if (!listElement) return;

    try {
        const response = await fetch(`${API_URL}/api/admin/access-users`, {
            credentials: 'include'
        });

        const result = await readJsonResponse(response);
        if (!response.ok) {
            throw new Error(result.error || 'Giriş yetkileri alınamadı');
        }

        adminAccessUsers = result;
        renderAdminAccessUserList(adminAccessUsers);
    } catch (error) {
        console.error('Giriş yetkisi listesi hatası:', error);
        listElement.innerHTML = '<p class="admin-empty">Giriş yetkisi listesi alınamadı</p>';
    }
}

function renderAdminAccessUserList(users) {
    const listElement = document.getElementById('adminAccessUserList');
    if (!listElement) return;

    if (!users || users.length === 0) {
        listElement.innerHTML = '<p class="admin-empty">Kullanıcı bulunamadı</p>';
        return;
    }

    listElement.innerHTML = users.map(user => {
        const providerLabel = `${user.googleEnabled ? 'Google' : ''}${user.googleEnabled && user.localEnabled ? ' + ' : ''}${user.localEnabled ? 'Email/Şifre' : ''}` || 'Bilinmiyor';
        const encodedEmail = encodeURIComponent(user.email);

        return `
            <div class="admin-user-item" data-email="${user.email}">
                <div class="admin-user-main">
                    <strong>${user.name}</strong>
                    <small>${user.email} • ${providerLabel}</small>
                </div>
                <div class="admin-user-controls">
                    <select class="user-role-select" id="access-role-${encodedEmail}">
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>Kullanıcı</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Yönetici</option>
                    </select>
                    <select class="user-role-select" id="access-allowed-${encodedEmail}">
                        <option value="allow" ${user.allowed ? 'selected' : ''}>Giriş Açık</option>
                        <option value="deny" ${!user.allowed ? 'selected' : ''}>Giriş Kapalı</option>
                    </select>
                    <button class="btn btn-view" onclick="updateAccessUser('${user.email}')">Kaydet</button>
                    <button class="btn btn-danger admin-user-delete-btn" onclick="deleteAccessUser('${user.email}')">Sil</button>
                </div>
            </div>
        `;
    }).join('');
}

async function updateAccessUser(email) {
    if (!currentUser || currentUser.role !== 'admin') return;

    const encodedEmail = encodeURIComponent(email);
    const roleSelect = document.getElementById(`access-role-${encodedEmail}`);
    const allowedSelect = document.getElementById(`access-allowed-${encodedEmail}`);

    const role = roleSelect ? roleSelect.value : 'user';
    const allowed = allowedSelect ? allowedSelect.value === 'allow' : true;

    try {
        const response = await fetch(`${API_URL}/api/admin/access-users/${encodeURIComponent(email)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ role, allowed })
        });

        const result = await readJsonResponse(response);
        if (!response.ok) {
            throw new Error(result.error || 'Giriş yetkisi güncellenemedi');
        }

        showSuccess('Giriş yetkisi güncellendi');
        await loadAdminAccessUsers();
        await loadAdminSystemUsers();
    } catch (error) {
        console.error('Giriş yetkisi güncelleme hatası:', error);
        showError(error.message || 'Giriş yetkisi güncellenemedi');
    }
}

async function deleteAccessUser(email) {
    if (!currentUser || currentUser.role !== 'admin') return;

    const confirmed = confirm(`${email} kullanıcısını sistem erişiminden kaldırmak istiyor musunuz?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_URL}/api/admin/access-users/${encodeURIComponent(email)}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const result = await readJsonResponse(response);
        if (!response.ok) {
            throw new Error(result.error || 'Kullanıcı silinemedi');
        }

        showSuccess('Kullanıcı sistem erişiminden kaldırıldı');
        await loadAdminAccessUsers();
        await loadAdminSystemUsers();
    } catch (error) {
        console.error('Erişim kullanıcısı silme hatası:', error);
        showError(error.message || 'Kullanıcı silinemedi');
    }
}

function renderAdminSystemUserList(users) {
    const listElement = document.getElementById('adminSystemUserList');
    if (!listElement) return;

    if (!users || users.length === 0) {
        listElement.innerHTML = '<p class="admin-empty">Henüz kullanıcı tanımlı değil</p>';
        return;
    }

    listElement.innerHTML = users.map(user => `
        <div class="admin-user-item" data-email="${user.email}">
            <div class="admin-user-main">
                <strong>${user.name}</strong>
                <small>${user.email}</small>
            </div>
            <div class="admin-user-controls">
                <select class="user-role-select" id="role-${encodeURIComponent(user.email)}">
                    <option value="user" ${user.role === 'user' ? 'selected' : ''}>Kullanıcı</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Yönetici</option>
                </select>
                <input type="password" class="user-password-reset" id="password-${encodeURIComponent(user.email)}" placeholder="Yeni şifre (opsiyonel)">
                <button class="btn btn-view" onclick="updateSystemUser('${user.email}')">Güncelle</button>
                <button class="btn btn-danger admin-user-delete-btn" onclick="deleteSystemUser('${user.email}')">Sil</button>
            </div>
        </div>
    `).join('');
}

async function addSystemUserFromAdmin() {
    if (!currentUser || currentUser.role !== 'admin') return;

    const nameInput = document.getElementById('newUserNameInput');
    const emailInput = document.getElementById('newUserEmailInput');
    const passwordInput = document.getElementById('newUserPasswordInput');
    const roleSelect = document.getElementById('newUserRoleSelect');

    const name = nameInput ? nameInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const role = roleSelect ? roleSelect.value : 'user';

    if (!name || !email || !password) {
        showError('Ad, email ve şifre zorunludur');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/admin/system-users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, email, password, role })
        });

        const result = await readJsonResponse(response);
        if (!response.ok) {
            throw new Error(result.error || 'Kullanıcı eklenemedi');
        }

        if (nameInput) nameInput.value = '';
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (roleSelect) roleSelect.value = 'user';

        showSuccess('Kullanıcı başarıyla eklendi');
        await loadAdminSystemUsers();
    } catch (error) {
        console.error('Kullanıcı ekleme hatası:', error);
        showError(error.message || 'Kullanıcı eklenemedi');
    }
}

async function updateSystemUser(email) {
    if (!currentUser || currentUser.role !== 'admin') return;

    const encodedEmail = encodeURIComponent(email);
    const roleSelect = document.getElementById(`role-${encodedEmail}`);
    const passwordInput = document.getElementById(`password-${encodedEmail}`);

    const role = roleSelect ? roleSelect.value : 'user';
    const password = passwordInput ? passwordInput.value : '';

    const payload = { role };
    if (password.trim()) {
        payload.password = password;
    }

    try {
        const response = await fetch(`${API_URL}/api/admin/system-users/${encodeURIComponent(email)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        const result = await readJsonResponse(response);
        if (!response.ok) {
            throw new Error(result.error || 'Kullanıcı güncellenemedi');
        }

        if (passwordInput) passwordInput.value = '';
        showSuccess('Kullanıcı güncellendi');
        await loadAdminSystemUsers();
    } catch (error) {
        console.error('Kullanıcı güncelleme hatası:', error);
        showError(error.message || 'Kullanıcı güncellenemedi');
    }
}

async function deleteSystemUser(email) {
    if (!currentUser || currentUser.role !== 'admin') return;

    const confirmed = confirm(`${email} kullanıcısını silmek istediğinize emin misiniz?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_URL}/api/admin/system-users/${encodeURIComponent(email)}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const result = await readJsonResponse(response);
        if (!response.ok) {
            throw new Error(result.error || 'Kullanıcı silinemedi');
        }

        showSuccess('Kullanıcı silindi');
        await loadAdminSystemUsers();
    } catch (error) {
        console.error('Kullanıcı silme hatası:', error);
        showError(error.message || 'Kullanıcı silinemedi');
    }
}

// Fotoğraf yükle
async function uploadPhoto(file, egitimAdi) {
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('egitimAdi', egitimAdi);
    
    try {
        const response = await fetch(`${API_URL}/api/upload`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        if (!response.ok) {
            const error = await response.json();
            return { success: false, error: error.error || 'Yükleme başarısız' };
        }
        
        const result = await response.json();
        return { success: true };
    } catch (error) {
        console.error('Yükleme hatası:', error);
        return { success: false, error: error.message };
    }
}

// Fotoğraf sil
async function deletePhoto(egitimAdi, filename) {
    if (!confirm('Bu fotoğrafı silmek istediğinize emin misiniz?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/photos/${egitimAdi}/${filename}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Silme işlemi başarısız');
        }
        
        showSuccess('Fotoğraf başarıyla silindi');
        
        // Seçili eğitim varsa o eğitimi, yoksa tüm fotoğrafları yeniden yükle
        if (selectedEgitim) {
            await loadPhotosByEgitim(selectedEgitim);
        } else {
            await loadPhotos();
        }
    } catch (error) {
        console.error('Silme hatası:', error);
        showError(error.message || 'Fotoğraf silinirken bir hata oluştu');
    }
}

// Modal göster
function openModal(imageUrl) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <span class="close-modal">&times;</span>
        <img class="modal-content" src="${imageUrl}">
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    const closeBtn = modal.querySelector('.close-modal');
    closeBtn.onclick = () => {
        modal.remove();
    };
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    };
}

// Yardımcı fonksiyonlar
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function readJsonResponse(response) {
    const text = await response.text();
    if (!text) return {};

    try {
        return JSON.parse(text);
    } catch (parseError) {
        const contentType = response.headers.get('content-type') || 'unknown';
        throw new Error(`Sunucudan JSON yerine farklı cevap geldi (status: ${response.status}, content-type: ${contentType}).`);
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">${message}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 300);
    }, 4000);
}

function showSuccess(message) {
    showToast(message, 'success');
}

function showError(message) {
    showToast(message, 'error');
}

function showWarning(message) {
    showToast(message, 'warning');
}

function showInfo(message) {
    showToast(message, 'info');
}
