// ============================================================
// ⚙️  KONFIGURASI TOKO — Edit bagian ini sesuai toko kamu
// ============================================================

const CONFIG = {
  // Supabase
  supabaseUrl: 'https://psvfouysqjsxfxjnjgrb.supabase.co',
  supabaseAnonKey: 'sb_publishable_NNu2SDVB1crv5QtGVvIdTw_qPzgDGQO',

  // Identitas Toko
  storeName: 'STUFF FOR TUFF',
  storeDot: '.',
  storeTagline: 'STUFF FOR TUFF · CURATED THRIFT ARCHIVE · REAL-TIME TRACKING',
  storeLocation: 'Berbasis di Kemang, Jakarta Selatan',
  storeDesc: 'STUFF FOR TUFF × ARCHIVED THRIFT. Kurasi arsip vintage 1980 hingga era 2000-an. Berbasis di Sumatera Utara.',

  // Drop aktif
  activeDrop: 'Archive Drop #42',

  // WhatsApp untuk order (format: kode negara + nomor tanpa 0 di depan)
  whatsapp: '6281234567890',

  // Logo (path relatif dari root folder project)
  logoUrl: 'public/assets/aistudio/STUFF_for_tuff-removebg-preview_3d9127f7.png',
  badgeLogoUrl: 'public/assets/aistudio/logo_mitra_4d647928.jpg',

  // Admin emails (hanya email ini yang bisa akses admin panel)
  adminEmails: ['williamg0810@gmail.com'],
};

// Init Supabase
const { createClient } = supabase;
const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);

// Sync _currentUser saat auth state berubah (login/logout)
sb.auth.getSession().then(async ({ data: { session } }) => {
  _currentUser = session?.user ?? null;
  if (_currentUser) await loadCartFromDB(_currentUser.id);
});
sb.auth.onAuthStateChange(async (_event, session) => {
  const wasLoggedIn = !!_currentUser;
  _currentUser = session?.user ?? null;

  if (_event === 'SIGNED_OUT') {
    // Logout — kosongkan cart lokal
    localStorage.removeItem('arsip_cart');
    updateCartBadge();
  } else if ((_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED') && _currentUser && !wasLoggedIn) {
    // Baru login — pulihkan cart dari DB
    await loadCartFromDB(_currentUser.id);
  }
});

// ============================================================
// SHARED UTILITIES
// ============================================================

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  return new Date(isoStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-');
}

// Dark mode
let _darkMode = localStorage.getItem('arsip_dark') === 'true'
  || (localStorage.getItem('arsip_dark') === null && window.matchMedia('(prefers-color-scheme: dark)').matches);

function applyDarkMode() {
  document.body.classList.toggle('dark', _darkMode);
  const moon = document.getElementById('icon-moon');
  const sun = document.getElementById('icon-sun');
  if (moon) moon.classList.toggle('hidden', _darkMode);
  if (sun) sun.classList.toggle('hidden', !_darkMode);
}

function toggleDark() {
  _darkMode = !_darkMode;
  localStorage.setItem('arsip_dark', _darkMode);
  applyDarkMode();
}

// Toast
let _toastTimer;
function showToast(msg, type = 'default') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = 'toast toast-' + type;
  toast.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// Cart (shared across pages)
function getCart() {
  try { return JSON.parse(localStorage.getItem('arsip_cart') || '[]'); }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem('arsip_cart', JSON.stringify(cart));
  updateCartBadge();
}

// Simpan cart ke DB — dipanggil eksplisit setelah modifikasi cart
async function syncCartToDB() {
  if (!_currentUser) return;
  const cart = getCart();
  const { error } = await sb.from('carts').upsert(
    { user_id: _currentUser.id, items: cart, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) console.warn('syncCartToDB error:', error.message);
}

async function saveCartToDB(userId, cart) {
  await sb.from('carts').upsert(
    { user_id: userId, items: cart, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

async function loadCartFromDB(userId) {
  const { data, error } = await sb.from('carts').select('items').eq('user_id', userId).single();
  if (error && error.code !== 'PGRST116') console.warn('loadCartFromDB error:', error.message);
  if (data?.items?.length) {
    localStorage.setItem('arsip_cart', JSON.stringify(data.items));
    updateCartBadge();
    if (typeof renderCart === 'function') renderCart();
  }
}

function updateCartBadge() {
  const cart = getCart();
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = cart.length;
  });
}

// Auth helpers
let _currentUser = null; // cached, diupdate saat halaman load

async function getCurrentUser() {
  const { data: { user } } = await sb.auth.getUser();
  _currentUser = user;
  return user;
}

function isAdmin(user) {
  if (!user) return false;
  return CONFIG.adminEmails.includes(user.email);
}

// Map DB row -> Product object
function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    categoryLabel: row.category_label || row.category,
    price: Number(row.price),
    originalEstimatedPrice: row.original_estimated_price ? Number(row.original_estimated_price) : null,
    size: row.size,
    measurements: row.measurements || {},
    conditionScore: Number(row.condition_score),
    conditionLabel: row.condition_label,
    era: row.era,
    tagOrigin: row.tag_origin,
    image: row.image,
    images: row.images?.length ? row.images : (row.image ? [row.image] : []),
    description: row.description,
    features: row.features || [],
    isSoldOut: row.is_sold_out || false,
    dropDate: row.drop_date,
    createdAt: row.created_at,
  };
}

// Order status labels
const ORDER_STEPS = [
  { key: 'payment_confirmed',   label: 'Pembayaran Dikonfirmasi', desc: 'Pembayaran telah diterima dan diverifikasi.' },
  { key: 'sanitizing_curation', label: 'Sanitasi & Kurasi',       desc: 'Item sedang melalui proses sanitasi uap ozone.' },
  { key: 'eco_packing',         label: 'Eco Packing',             desc: 'Item dikemas dengan material ramah lingkungan.' },
  { key: 'handed_to_courier',   label: 'Diserahkan ke Kurir',     desc: 'Paket sudah diambil oleh kurir.' },
  { key: 'in_transit_hub',      label: 'Dalam Perjalanan',        desc: 'Paket sedang dalam perjalanan menuju kota tujuan.' },
  { key: 'out_for_delivery',    label: 'Dalam Pengiriman',        desc: 'Paket sedang diantar ke alamat kamu.' },
  { key: 'delivered',           label: 'Terkirim',                desc: 'Paket telah diterima. Selamat menikmati!' },
];

// Navbar builder (shared)
function buildNavbar({ activePage = 'shop' } = {}) {
  return `
  <div id="top-banner">${CONFIG.storeTagline}</div>
  <header id="navbar">
    <div class="container navbar-inner">
      <a href="index.html" class="nav-logo">
        ${CONFIG.logoUrl
          ? `<img src="${CONFIG.logoUrl}" alt="${CONFIG.storeName}" class="nav-logo-img">`
          : `<span class="nav-logo-text">${CONFIG.storeName}<span class="nav-logo-dot">${CONFIG.storeDot}</span></span>`
        }
        ${CONFIG.badgeLogoUrl ? `
        <div class="nav-logo-badge">
          <img src="${CONFIG.badgeLogoUrl}" alt="badge">
          <span>Archived Thrift</span>
        </div>` : ''}
      </a>

      <nav class="nav-links">
        <a href="index.html" class="${activePage==='shop'?'active':''}">Koleksi Terbaru</a>
        <a href="index.html#catalog" class="${activePage==='catalog'?'active':''}">Katalog</a>
        <a href="index.html#curation">Standar Kurasi</a>
        <a href="tracker.html" class="${activePage==='tracker'?'active':''}">Lacak Pesanan</a>
      </nav>

      <div class="nav-actions">
        <button class="btn-icon" onclick="toggleDark()" aria-label="Toggle dark mode">
          <i data-lucide="moon" id="icon-moon" class="icon ${_darkMode?'hidden':''}"></i>
          <i data-lucide="sun" id="icon-sun" class="icon ${!_darkMode?'hidden':''}"></i>
        </button>

        <div id="nav-auth-area">
          <!-- filled by renderNavAuth() -->
        </div>

        <button class="btn-primary" onclick="toggleCart()">
          <i data-lucide="shopping-bag" class="icon"></i>
          <span class="hide-xs">Kantong</span>
          <span class="cart-count badge">0</span>
        </button>
      </div>
    </div>
  </header>`;
}

async function renderNavAuth() {
  const area = document.getElementById('nav-auth-area');
  if (!area) return;
  const user = await getCurrentUser();
  if (user) {
    const admin = isAdmin(user);
    const name = (user.user_metadata?.full_name || user.email || '').split(' ')[0];
    area.innerHTML = `
      <div class="nav-user-group">
        <a href="account.html" class="btn-outline nav-account-btn" title="Akun saya">
          <i data-lucide="user" class="icon"></i>
          <span class="hide-xs">${name}</span>
        </a>
        ${admin ? `<a href="admin.html" class="btn-outline" title="Admin Panel"><i data-lucide="lock" class="icon"></i><span class="hide-xs">Admin</span></a>` : ''}
        <button class="btn-icon nav-logout" onclick="handleLogout()" title="Keluar">
          <i data-lucide="log-out" class="icon"></i>
        </button>
      </div>`;
  } else {
    area.innerHTML = `
      <button class="btn-outline" onclick="openAuthModal()">
        <i data-lucide="log-in" class="icon"></i>
        <span class="hide-xs">Sign In</span>
      </button>`;
  }
  if (window.lucide) lucide.createIcons();
}

async function handleLogout() {
  await sb.auth.signOut();
  // onAuthStateChange akan handle SIGNED_OUT dan kosongkan cart lokal
  showToast('Berhasil keluar.');
  setTimeout(() => window.location.reload(), 800);
}

// Auth modal (inline, used on all pages)
function buildAuthModal() {
  return `
  <div id="auth-modal" class="modal-overlay hidden">
    <div class="modal modal-sm" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="closeAuthModal()">
        <i data-lucide="x" class="icon"></i>
      </button>
      <div class="modal-padded">
        <div class="auth-icon-wrap">
          <i data-lucide="log-in" class="icon icon-lg"></i>
        </div>
        <h2 class="auth-title" id="auth-title">Secure Access</h2>
        <p class="auth-subtitle" id="auth-subtitle">Masuk untuk melacak pesanan & akses arsip kamu.</p>

        <div id="auth-success" class="auth-success hidden"></div>
        <div id="auth-error" class="auth-error hidden"></div>

        <!-- Google -->
        <button class="btn-google" onclick="loginGoogle()">
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          <span>Lanjutkan dengan Google</span>
        </button>

        <div class="auth-divider"><span>atau</span></div>

        <form id="auth-form" onsubmit="submitAuth(event)">
          <div class="form-group">
            <i data-lucide="mail" class="form-icon icon"></i>
            <input type="email" id="auth-email" placeholder="ALAMAT EMAIL" required class="form-input form-input-icon" style="text-transform:none;letter-spacing:.05em;">
          </div>
          <div class="form-group">
            <i data-lucide="lock" class="form-icon icon"></i>
            <input type="password" id="auth-password" placeholder="PASSWORD" required class="form-input form-input-icon" id="auth-password" style="text-transform:none;letter-spacing:.05em;">
            <button type="button" class="form-eye" onclick="togglePasswordVis()">
              <i data-lucide="eye" id="eye-icon" class="icon"></i>
            </button>
          </div>
          <button type="submit" class="btn-primary btn-full" id="auth-submit">
            <i data-lucide="log-in" class="icon"></i>
            <span id="auth-btn-label">Masuk</span>
          </button>
        </form>

        <button class="auth-toggle" onclick="toggleAuthMode()">
          <span id="auth-toggle-text">Belum punya akun? Daftar sekarang</span>
        </button>

        <p class="auth-footer-note">
          <i data-lucide="sparkles" class="icon icon-xs"></i>
          Encrypted Authentication · Supabase
        </p>
      </div>
    </div>
  </div>`;
}

let _authMode = 'login';

function openAuthModal() {
  document.getElementById('auth-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (window.lucide) lucide.createIcons();
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function toggleAuthMode() {
  _authMode = _authMode === 'login' ? 'register' : 'login';
  document.getElementById('auth-title').textContent = _authMode === 'login' ? 'Secure Access' : 'Buat Akun';
  document.getElementById('auth-subtitle').textContent = _authMode === 'login'
    ? 'Masuk untuk melacak pesanan & akses arsip kamu.'
    : 'Bergabung dengan komunitas arsip vintage.';
  document.getElementById('auth-btn-label').textContent = _authMode === 'login' ? 'Masuk' : 'Daftar';
  document.getElementById('auth-toggle-text').textContent = _authMode === 'login'
    ? 'Belum punya akun? Daftar sekarang'
    : 'Sudah punya akun? Masuk';
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-success').classList.add('hidden');
}

function togglePasswordVis() {
  const input = document.getElementById('auth-password');
  const icon = document.getElementById('eye-icon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.setAttribute('data-lucide', 'eye-off');
  } else {
    input.type = 'password';
    icon.setAttribute('data-lucide', 'eye');
  }
  if (window.lucide) lucide.createIcons();
}

async function loginGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/index.html' }
  });
  if (error) showAuthError(error.message);
}

async function submitAuth(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const btn = document.getElementById('auth-submit');
  btn.disabled = true;
  document.getElementById('auth-error').classList.add('hidden');

  if (_authMode === 'login') {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { showAuthError(error.message); btn.disabled = false; return; }
    closeAuthModal();
    showToast('Berhasil masuk!');
    setTimeout(() => location.reload(), 600);
  } else {
    const { error } = await sb.auth.signUp({ email, password });
    if (error) { showAuthError(error.message); btn.disabled = false; return; }
    document.getElementById('auth-success').textContent = 'Cek email kamu untuk konfirmasi akun.';
    document.getElementById('auth-success').classList.remove('hidden');
    btn.disabled = false;
  }
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// Cart Drawer (shared)
function buildCartDrawer() {
  return `
  <div id="cart-overlay" class="drawer-overlay hidden" onclick="toggleCart()"></div>
  <div id="cart-drawer" class="drawer hidden">
    <div class="drawer-header">
      <span class="drawer-title">Kantong Belanja</span>
      <button class="btn-icon" onclick="toggleCart()"><i data-lucide="x" class="icon"></i></button>
    </div>
    <div class="drawer-body" id="cart-items"></div>
    <div class="drawer-footer" id="cart-footer"></div>
  </div>`;
}

function toggleCart() {
  const drawer = document.getElementById('cart-drawer');
  const overlay = document.getElementById('cart-overlay');
  const isOpen = !drawer.classList.contains('hidden');
  drawer.classList.toggle('hidden', isOpen);
  overlay.classList.toggle('hidden', isOpen);
  document.body.style.overflow = isOpen ? '' : 'hidden';
  if (!isOpen) renderCart();
  if (window.lucide) lucide.createIcons();
}

function renderCart() {
  const cart = getCart();
  const body = document.getElementById('cart-items');
  const footer = document.getElementById('cart-footer');
  if (!body) return;

  if (cart.length === 0) {
    body.innerHTML = `<div class="cart-empty">
      <i data-lucide="shopping-bag" class="icon icon-xl muted"></i>
      <p>Kantong masih kosong.</p>
    </div>`;
    footer.innerHTML = '';
    if (window.lucide) lucide.createIcons();
    return;
  }

  body.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img class="cart-item-img" src="${item.image}" alt="${item.name}" referrerpolicy="no-referrer">
      <div class="cart-item-info">
        <p class="cart-item-name">${item.name}</p>
        <p class="cart-item-meta">${item.size} · ${item.era}</p>
        <p class="cart-item-price">${formatRupiah(item.price)}</p>
      </div>
      <button class="btn-icon cart-remove" onclick="removeFromCart('${item.id}')" title="Hapus">
        <i data-lucide="trash-2" class="icon icon-sm"></i>
      </button>
    </div>`).join('');

  const subtotal = cart.reduce((s, i) => s + i.price, 0);
  footer.innerHTML = `
    <div class="cart-summary">
      <div class="cart-summary-row"><span>Subtotal (${cart.length} item)</span><span>${formatRupiah(subtotal)}</span></div>
      <div class="cart-summary-row total"><span>Total</span><span>${formatRupiah(subtotal)}</span></div>
    </div>
    <button class="btn-primary btn-full mt-sm" onclick="openCheckout()">
      <i data-lucide="credit-card" class="icon"></i>
      Lanjut ke Checkout
    </button>
    <button class="btn-outline btn-full mt-xs" onclick="clearCart()">Kosongkan Kantong</button>`;

  if (window.lucide) lucide.createIcons();
}

function addToCart(product) {
  // Wajib login untuk tambah ke kantong
  if (!_currentUser) {
    openAuthModal();
    showToast('Login dulu untuk tambah ke kantong.');
    return;
  }
  let cart = getCart();
  if (cart.some(c => c.id === product.id)) {
    showToast('Item sudah ada di kantong.');
    return;
  }
  cart.push({
    id: product.id, name: product.name, price: product.price,
    image: product.image, size: product.size, era: product.era,
    categoryLabel: product.categoryLabel,
  });
  saveCart(cart);
  syncCartToDB(); // simpan ke DB
  renderCart();
  showToast(`${product.name} ditambahkan ke kantong ✓`);
}

function removeFromCart(id) {
  let cart = getCart();
  cart = cart.filter(c => c.id !== id);
  saveCart(cart);
  syncCartToDB(); // simpan ke DB
  renderCart();
  // re-render product grid if on shop page
  if (typeof renderProducts === 'function') renderProducts();
}

function clearCart() {
  if (!confirm('Kosongkan semua item di kantong?')) return;
  saveCart([]);
  syncCartToDB(); // simpan ke DB
  renderCart();
  if (typeof renderProducts === 'function') renderProducts();
}

function openCheckout() {
  // Wajib login untuk checkout
  if (!_currentUser) {
    // Tutup cart drawer dulu kalau terbuka
    document.getElementById('cart-drawer')?.classList.add('hidden');
    document.getElementById('cart-overlay')?.classList.add('hidden');
    document.body.style.overflow = '';
    openAuthModal();
    showToast('Login dulu untuk melanjutkan pesanan.');
    return;
  }
  document.getElementById('cart-drawer').classList.add('hidden');
  document.getElementById('cart-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  const modal = document.getElementById('checkout-modal');
  if (modal) {
    renderCheckout();
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (window.lucide) lucide.createIcons();
  } else {
    checkoutWhatsApp();
  }
}

function checkoutWhatsApp() {
  const cart = getCart();
  if (!cart.length) return;
  const lines = cart.map(i => `- ${i.name} (${i.size}) ${formatRupiah(i.price)}`).join('\n');
  const total = cart.reduce((s, i) => s + i.price, 0);
  const msg = encodeURIComponent(`Halo! Saya ingin order:\n\n${lines}\n\n*Total: ${formatRupiah(total)}*\n\nMohon konfirmasi & info pembayaran. Terima kasih!`);
  window.open(`https://wa.me/${CONFIG.whatsapp}?text=${msg}`, '_blank');
}
