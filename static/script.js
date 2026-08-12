/* ==========================================================================
   KITCHEN & COUNTER — POS CLIENT LOGIC

   ARCHITECTURE SUMMARY
   ---------------------------------------------------------------------------
   1. CATALOG (id/qr_code/name/price/category) — fetched from /api/products,
      cached in sessionStorage for 3 minutes, silently refreshed in the
      background after that. Cheap to cache because it rarely changes.
      Products have no `image` column — every product's visual is derived
      from its category via CategoryIcons (category-icons.js), not stored
      per-product. Load category-icons.js before this file.

   2. STOCK — fetched from /api/stock on every page load, AND polled every
      15 seconds after that. Never cached, because stock is the field that
      actually needs to be accurate.

   3. CART / SEARCH / CATEGORY FILTERING — 100% frontend. Once the catalog
      and stock are in memory (the `catalog` array below), none of this
      touches the network again until checkout.

   4. CHECKOUT — does one final hard stock re-check immediately before
      submitting, so a cashier can't complete a sale on stock that sold out
      seconds earlier elsewhere.

   5. AUTH — gated behind Auth.requireAuth() (any logged-in role — cashier,
      admin, and super_admin can all use the till). All backend calls go
      through Auth.authFetch() so the access token is attached and silently
      refreshed on expiry. Requires auth.js loaded before this file.

   BACKEND RESPONSE SHAPES EXPECTED
   ---------------------------------------------------------------------------
       GET /api/products -> [{ id, qr_code, name, price, category }, ...]
       GET /api/stock     -> { "1": 12, "2": 8, ... }  (product id -> qty)
       POST /api/checkout { cart, promo } -> 200 on success

   Everything else (rendering, cart, checkout) already expects exactly that
   shape and needs no further changes.
   ========================================================================== */

(function () {
    "use strict";

    /* ---------------------------------------------------------------------
       THEME (light default, toggled from the header switch)
    --------------------------------------------------------------------- */
    const root = document.documentElement;
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');

    function setTheme(theme) {
        root.setAttribute('data-theme', theme);
        themeIcon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    }
    themeToggle.addEventListener('click', () => {
        setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    /* ---------------------------------------------------------------------
       TOAST
    --------------------------------------------------------------------- */
    const toastEl = document.getElementById('toast');
    let toastTimer = null;
    function showToast(msg, ms = 3200) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
    }

    /* ---------------------------------------------------------------------
       CASHIER IDENTITY — filled in once Auth.requireAuth() resolves, no
       hardcoded name/avatar anymore
    --------------------------------------------------------------------- */
    function avatarSvg(initials, hex) {
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='32' fill='${hex}'/><text x='50%' y='54%' font-family='Inter,sans-serif' font-size='24' fill='#fff' text-anchor='middle' dominant-baseline='middle'>${initials}</text></svg>`;
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    function applyUserInfo(user) {
        const initials = user.username.slice(0, 2).toUpperCase();
        document.getElementById('cashier-avatar').src = avatarSvg(initials, '#2F6F4E');
        document.getElementById('cashier-name').textContent = user.username;
    }

    /* ---------------------------------------------------------------------
       CATALOG FETCHING
    --------------------------------------------------------------------- */
    function fakeDelay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    async function fetchCatalogFromServer() {
        const res = await Auth.authFetch('/api/products');
        if (!res.ok) throw new Error('Failed to load products');
        const data = await res.json();

        // No `image` column on products — every item's visual comes from
        // its category via the shared CategoryIcons lookup.
        data.forEach(p => { p.image = CategoryIcons.get(p.category); });
        return data;
    }

    async function fetchStockFromServer() {
        const res = await Auth.authFetch('/api/stock');
        if (!res.ok) throw new Error('Failed to load stock');
        return await res.json();
    }

    /* ---------------------------------------------------------------------
       CATALOG CACHE — 3 minute TTL, sessionStorage-backed so it survives a
       reload within the same tab/shift
    --------------------------------------------------------------------- */
    const CATALOG_TTL_MS = 3 * 60 * 1000; // 3 minutes
    const STOCK_POLL_MS = 15 * 1000;      // 15 seconds

    function readCatalogCache() {
        const raw = sessionStorage.getItem('pos_catalog_cache_v1');
        return raw ? JSON.parse(raw) : null;
    }
    function writeCatalogCache(data) {
        const entry = { data, timestamp: Date.now() };
        sessionStorage.setItem('pos_catalog_cache_v1', JSON.stringify(entry));
    }

    /* ---------------------------------------------------------------------
       STATE
    --------------------------------------------------------------------- */
    let catalog = [];          // merged { id, qr_code, name, price, category, image, stock }
    let CATEGORIES = ['All'];
    let activeCategory = 'All';
    let searchTerm = '';
    let lastCatalogJSON = '';  // used to detect real changes on background refresh

    function formatNaira(amount) {
        return '₦' + amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Merges freshly-fetched catalog fields into `catalog`, preserving
    // whatever stock value each item already had (stock is updated
    // separately by refreshStock()).
    function applyCatalogData(data) {
        catalog = data.map(p => {
            const existing = catalog.find(c => String(c.id) === String(p.id));
            return { ...p, stock: existing ? existing.stock : null };
        });
        CATEGORIES = ['All', ...new Set(catalog.map(p => p.category))];
        if (!CATEGORIES.includes(activeCategory)) activeCategory = 'All';
    }

    /* ---------------------------------------------------------------------
       LOADERS
    --------------------------------------------------------------------- */
    const productGrid = document.getElementById('product-grid');
    const liveIndicatorText = document.getElementById('live-indicator-text');

    async function initCatalog() {
        const cached = readCatalogCache();
        const isFresh = cached && (Date.now() - cached.timestamp < CATALOG_TTL_MS);

        if (isFresh) {
            applyCatalogData(cached.data);
            lastCatalogJSON = JSON.stringify(cached.data);
        } else {
            productGrid.innerHTML = `<div class="loading-note"><i class="fa-solid fa-spinner fa-spin"></i>Loading menu…</div>`;
            const fresh = await fetchCatalogFromServer();
            writeCatalogCache(fresh);
            applyCatalogData(fresh);
            lastCatalogJSON = JSON.stringify(fresh);
        }

        renderCategories();
        renderProducts();

        // Stock is never cached — always fetched live, on every single load.
        await refreshStock();

        // Background loops
        setInterval(refreshCatalogInBackground, CATALOG_TTL_MS); // re-check menu every 3 min
        setInterval(refreshStock, STOCK_POLL_MS);                 // live stock every 15s
    }

    async function refreshCatalogInBackground() {
        const fresh = await fetchCatalogFromServer();
        const freshJSON = JSON.stringify(fresh);
        const changed = freshJSON !== lastCatalogJSON;
        writeCatalogCache(fresh);
        applyCatalogData(fresh);
        lastCatalogJSON = freshJSON;
        renderCategories();
        renderProducts();
        if (changed) showToast('Menu updated.');
    }

    async function refreshStock() {
        liveIndicatorText.textContent = 'Syncing stock…';
        const stockMap = await fetchStockFromServer();
        catalog.forEach(p => { p.stock = stockMap[p.id] ?? p.stock ?? 0; });
        renderProducts();
        reconcileCartWithStock();
        const now = new Date();
        liveIndicatorText.textContent = 'Stock synced ' + now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
    }

    /* ---------------------------------------------------------------------
       CATEGORY PILLS
    --------------------------------------------------------------------- */
    const categoriesContainer = document.getElementById('categories-container');
    const categoryTitle = document.getElementById('category-title');

    function renderCategories() {
        categoriesContainer.innerHTML = '';
        CATEGORIES.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'category-pill' + (cat === activeCategory ? ' active' : '');
            btn.textContent = cat;
            btn.addEventListener('click', () => {
                activeCategory = cat;
                categoryTitle.textContent = cat === 'All' ? 'All Products' : cat;
                renderCategories();
                renderProducts();
            });
            categoriesContainer.appendChild(btn);
        });

        const scrollBtn = document.createElement('button');
        scrollBtn.className = 'category-pill scroll-btn';
        scrollBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        scrollBtn.setAttribute('aria-label', 'Scroll categories right');
        scrollBtn.addEventListener('click', () => categoriesContainer.scrollBy({ left: 160, behavior: 'smooth' }));
        categoriesContainer.appendChild(scrollBtn);
    }

    /* ---------------------------------------------------------------------
       PRODUCT GRID
       Filtering (search + category) reads only the local `catalog` array —
       no network call happens here, ever.
    --------------------------------------------------------------------- */
    function renderProducts() {
        const term = searchTerm.trim().toLowerCase();
        const filtered = catalog.filter(p => {
            const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
            const matchesSearch = !term || p.name.toLowerCase().includes(term);
            return matchesCategory && matchesSearch;
        });

        productGrid.innerHTML = '';

        if (catalog.length === 0) return; // still loading — leave the spinner up
        if (filtered.length === 0) {
            productGrid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-box-open"></i>No items match your search.</div>`;
            return;
        }

        filtered.forEach(product => {
            const stockKnown = product.stock !== null;
            const soldOut = stockKnown && product.stock <= 0;
            const low = stockKnown && product.stock > 0 && product.stock <= 5;

            const card = document.createElement('div');
            card.className = 'product-card' + (soldOut ? ' sold-out' : '');
            card.innerHTML = `
                <div class="product-image"><img src="${product.image}" alt="${product.name}"></div>
                <div class="product-info">
                    <h3>${product.name}</h3>
                    <div class="stock-note${low ? ' low' : ''}">${!stockKnown ? '' : soldOut ? 'Sold out' : low ? product.stock + ' left' : ''}</div>
                    <div class="product-bottom">
                        <span class="price">${formatNaira(product.price)}</span>
                        <button class="add-btn" ${soldOut ? 'disabled' : ''} aria-label="Add ${product.name} to order"><i class="fa-solid fa-plus"></i></button>
                    </div>
                </div>`;
            card.querySelector('.add-btn').addEventListener('click', () => addToCart(product.id, product.name, product.price, product.image));
            productGrid.appendChild(card);
        });
    }

    document.getElementById('search-input').addEventListener('input', (e) => {
        searchTerm = e.target.value;
        renderProducts();
    });

    /* ---------------------------------------------------------------------
       CART
    --------------------------------------------------------------------- */
    let cart = [];
    let activePromo = null;
    const taxRate = 0.05;
    const PROMO_CODES = {
        'SWEET10':    { type: 'percent', value: 10,  label: '10% off' },
        'WELCOME500': { type: 'flat',    value: 500, label: '₦500 off' }
    };

    function findCatalogItem(id) {
        return catalog.find(p => String(p.id) === String(id));
    }

    function addToCart(id, name, price, image) {
        const prod = findCatalogItem(id);
        const existing = cart.find(item => String(item.id) === String(id));
        const nextQty = (existing ? existing.quantity : 0) + 1;

        // prod is undefined for custom/nameless items — those aren't stock-tracked.
        if (prod && prod.stock !== null && nextQty > prod.stock) {
            showToast(prod.stock === 0 ? `${name} just sold out.` : `Only ${prod.stock} ${name} left.`);
            renderProducts();
            return;
        }

        if (existing) existing.quantity += 1;
        else cart.push({ id, name, price, image, quantity: 1 });

        renderCart();
        showToast(`Added ${name} to order`);
    }

    function updateQuantity(id, change) {
        const idx = cart.findIndex(item => String(item.id) === String(id));
        if (idx === -1) return;

        if (change > 0) {
            const prod = findCatalogItem(id);
            if (prod && prod.stock !== null && cart[idx].quantity + change > prod.stock) {
                showToast(`Only ${prod.stock} left in stock.`);
                return;
            }
        }

        cart[idx].quantity += change;
        if (cart[idx].quantity <= 0) cart.splice(idx, 1);
        renderCart();
    }

    // Runs after every stock refresh. If something already in the cart has
    // since sold out (or dropped below the cart's quantity) elsewhere,
    // clamp it down and tell the cashier rather than letting it overshoot.
    function reconcileCartWithStock() {
        let adjusted = false;
        cart.forEach(item => {
            const prod = findCatalogItem(item.id);
            if (!prod || prod.stock === null) return; // custom items aren't stock-tracked
            if (item.quantity > prod.stock) {
                item.quantity = Math.max(prod.stock, 0);
                adjusted = true;
            }
        });
        const before = cart.length;
        cart = cart.filter(item => item.quantity > 0);
        if (adjusted || cart.length !== before) {
            showToast('Stock changed — one or more quantities were adjusted.');
            renderCart();
        }
    }

    /* ---------------------------------------------------------------------
       RENDER CART + TOTALS
    --------------------------------------------------------------------- */
    const cartContainer = document.getElementById('cart-items-container');
    const checkoutBtn = document.getElementById('checkout-btn');

    function computeDiscount(subtotal) {
        if (!activePromo || !PROMO_CODES[activePromo]) return 0;
        const promo = PROMO_CODES[activePromo];
        const raw = promo.type === 'percent' ? subtotal * (promo.value / 100) : promo.value;
        return Math.min(raw, subtotal);
    }

    function renderCart() {
        cartContainer.innerHTML = '';
        if (cart.length === 0) {
            cartContainer.innerHTML = `<div class="cart-empty">No items yet — add something from the menu.</div>`;
        }

        let subtotal = 0;
        cart.forEach(item => {
            subtotal += item.price * item.quantity;
            const row = document.createElement('div');
            row.className = 'cart-item';
            row.innerHTML = `
                <img src="${item.image}" alt="${item.name}" class="cart-item-img">
                <div class="cart-item-details">
                    <h4>${item.name}</h4>
                    <span class="cart-item-price">${formatNaira(item.price)}</span>
                </div>
                <div class="qty-controls">
                    <button class="qty-btn minus" aria-label="Decrease ${item.name} quantity"><i class="fa-solid fa-minus"></i></button>
                    <span class="qty">${item.quantity}</span>
                    <button class="qty-btn add" aria-label="Increase ${item.name} quantity"><i class="fa-solid fa-plus"></i></button>
                </div>`;
            row.querySelector('.minus').addEventListener('click', () => updateQuantity(item.id, -1));
            row.querySelector('.add').addEventListener('click', () => updateQuantity(item.id, 1));
            cartContainer.appendChild(row);
        });

        const discount = computeDiscount(subtotal);
        const taxable = Math.max(subtotal - discount, 0);
        const tax = taxable * taxRate;
        const total = taxable + tax;

        document.getElementById('summary-subtotal').textContent = formatNaira(subtotal);
        document.getElementById('summary-discount').textContent = (discount > 0 ? '−' : '') + formatNaira(discount);
        document.getElementById('summary-tax').textContent = formatNaira(tax);
        document.getElementById('summary-total').textContent = formatNaira(total);
        checkoutBtn.disabled = cart.length === 0;
    }

    /* ---------------------------------------------------------------------
       PROMO CODE
    --------------------------------------------------------------------- */
    const promoInput = document.getElementById('promo-input');
    const promoFeedback = document.getElementById('promo-feedback');
    document.getElementById('promo-apply-btn').addEventListener('click', () => {
        const code = promoInput.value.trim().toUpperCase();
        if (!code) return;
        if (PROMO_CODES[code]) {
            activePromo = code;
            promoFeedback.textContent = `Applied: ${PROMO_CODES[code].label}`;
            promoFeedback.className = 'promo-feedback ok';
        } else {
            activePromo = null;
            promoFeedback.textContent = 'That code isn\u2019t valid.';
            promoFeedback.className = 'promo-feedback err';
        }
        renderCart();
    });

    /* ---------------------------------------------------------------------
       CUSTOM / NAMELESS PRODUCT
       Backend note: this maps to a transaction_items row with a real
       product_id (your generic "custom item" placeholder product) plus
       custom_name set to whatever the cashier typed — that's what the
       reconciliation page later resolves. Never stock-tracked here.
    --------------------------------------------------------------------- */
    document.getElementById('add-custom-btn').addEventListener('click', () => {
        const name = prompt('Enter custom product name:');
        if (!name) return;
        const priceStr = prompt('Enter price (₦):');
        const price = parseFloat(priceStr);
        if (isNaN(price) || price < 0) { showToast('Invalid price entered.'); return; }
        addToCart('custom_' + Date.now(), name, price, CategoryIcons.getCustom());
    });

    /* ---------------------------------------------------------------------
       CHECKOUT
    --------------------------------------------------------------------- */
    checkoutBtn.addEventListener('click', processCheckout);

    async function processCheckout() {
        if (cart.length === 0) return;

        checkoutBtn.textContent = 'Verifying stock...';
        checkoutBtn.disabled = true;
        const beforeJSON = JSON.stringify(cart);

        await refreshStock(); // this also runs reconcileCartWithStock() internally

        if (JSON.stringify(cart) !== beforeJSON) {
            checkoutBtn.textContent = 'Continue';
            checkoutBtn.disabled = cart.length === 0;
            showToast('Stock changed just now — please review the order before continuing.');
            return;
        }

        checkoutBtn.textContent = 'Processing...';
        try {
            const response = await Auth.authFetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cart, promo: activePromo })
            });

            if (response.ok) {
                showToast('Transaction complete!');
                cart = []; activePromo = null; promoInput.value = ''; promoFeedback.textContent = '';
                renderCart();
            } else {
                const err = await response.json().catch(() => ({ detail: 'Checkout failed.' }));
                showToast('Error: ' + (err.detail || 'Checkout failed.'));
            }
        } catch (error) {
            // No backend reachable — likely running this file standalone.
            console.warn('Backend not reachable — running checkout in demo mode.', error);
            await fakeDelay(700);
            showToast('Demo mode: order recorded locally (connect the backend for real checkout).');
            cart = []; activePromo = null; promoInput.value = ''; promoFeedback.textContent = '';
            renderCart();
        } finally {
            checkoutBtn.textContent = 'Continue';
            checkoutBtn.disabled = cart.length === 0;
        }
    }

    /* ---------------------------------------------------------------------
       QR SCANNER — matches against products.qr_code (nullable, so not
       every product will have one; unmatched scans just show "no match")
    --------------------------------------------------------------------- */
    const qrContainer = document.getElementById('qr-reader-container');
    const qrStatus = document.getElementById('qr-status');
    const startBtn = document.getElementById('start-scanner-btn');
    const closeBtn = document.getElementById('close-scanner-btn');
    let scanner = null;

    function stopScanner() {
        if (scanner) { scanner.clear().catch(() => {}); scanner = null; }
        qrContainer.style.display = 'none';
    }

    function onScanSuccess(decodedText) {
        stopScanner();
        const product = catalog.find(p => p.qr_code === decodedText || String(p.id) === decodedText);
        if (product) addToCart(product.id, product.name, product.price, product.image);
        else showToast('No product matches that code.');
    }

    startBtn.addEventListener('click', () => {
        if (typeof Html5QrcodeScanner === 'undefined') { showToast('QR scanner library failed to load — check your connection.'); return; }
        qrContainer.style.display = 'block';
        qrStatus.textContent = 'Point the camera at a product QR code.';
        try {
            scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: { width: 240, height: 240 } }, false);
            scanner.render(onScanSuccess, () => { /* ignore background scan noise */ });
        } catch (err) {
            qrStatus.textContent = 'Camera unavailable — check permissions or try a different device.';
            console.error(err);
        }
    });
    closeBtn.addEventListener('click', stopScanner);

    /* ---------------------------------------------------------------------
       INIT — gated behind auth; any logged-in role can use the till
    --------------------------------------------------------------------- */
    async function init() {
        const user = await Auth.requireAuth(); // no role restriction — cashier/admin/super_admin all allowed
        if (!user) return; // already redirected to /login
        Auth.applyRoleVisibility();
        applyUserInfo(user);

        renderCart();
        await initCatalog();
    }

    init();
})();
