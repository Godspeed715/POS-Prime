/* ==========================================================================
   KITCHEN & COUNTER — POS CLIENT LOGIC

   ARCHITECTURE SUMMARY
   ---------------------------------------------------------------------------
   1. CATALOG (name/price/category/barcode) — fetched from /api/products,
      cached in sessionStorage for 3 minutes, silently refreshed in the
      background after that. Cheap to cache because it rarely changes.
      Rendered as a plain text-based list — no product images anywhere in
      this app, category-icons.js is no longer loaded on this page.

   2. STOCK — fetched from /api/stock on load, then polled every 5 minutes
      via the shared Polling module (polling.js — pauses while the tab is
      hidden, fetches immediately on refocus). Never cached, because stock
      is the field that actually needs to be accurate. The 5-minute
      interval is a UX/DB-load tradeoff, not a correctness guarantee —
      checkout (below) does its own hard re-check regardless of what this
      poll last saw. Load polling.js before this file.

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

   BACKEND RESPONSE SHAPES EXPECTED (see Backend_Requirements.md §4 for the
   authoritative contract — this is the internal shape AFTER the mapping
   fetchCatalogFromServer() does, not the raw API response)
   ---------------------------------------------------------------------------
       GET /api/products (raw) -> [{ business_product_id, master_product_id,
                                      name, category, price, barcode }, ...]
       fetchCatalogFromServer() maps this to internal:
                                   [{ id, masterProductId, name, category,
                                      price, barcode }, ...]
       GET /api/stock -> { "1": 12, "2": 8, ... }  (business_product_id -> qty,
                           keys line up with the mapped `id` above)
       POST /api/checkout { cart, promo } -> 200 on success

   Everything else (rendering, cart, checkout) works off the mapped internal
   shape and needs no further changes if the raw API shape changes — only
   fetchCatalogFromServer()'s mapping does.
   ========================================================================== */

(function () {
    "use strict";

    // Theme toggle lives in theme.js now (shared across every page via
    // base.html) — no per-page theme logic needed here anymore.

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

    // GET /api/products returns the resolved master+business view described
    // in Backend_Requirements.md §4 — business_product_id, master_product_id,
    // name/category (already resolved: custom_* falls back to the master
    // value server-side, this file never needs to know that happened),
    // price, barcode. Mapped here to the internal shape the rest of this
    // file uses, so a field rename on the backend only ever touches this
    // one function.
    async function fetchCatalogFromServer() {
        const res = await Auth.authFetch('/api/products');
        if (!res.ok) throw new Error('Failed to load products');
        const data = await res.json();
        return data.map(p => ({
            id: p.business_product_id,
            masterProductId: p.master_product_id,
            name: p.name,
            category: p.category,
            price: p.price,
            barcode: p.barcode,
        }));
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
    const CATALOG_TTL_MS = 3 * 60 * 1000;  // 3 minutes
    const STOCK_POLL_MS = 5 * 60 * 1000;   // 5 minutes — see polling.js header for why this isn't shorter

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
    let catalog = [];          // merged { id, masterProductId, name, price, category, barcode, stock }
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

        // Background loops. Stock is never cached and always fetched live —
        // Polling.start() fires an immediate fetch on start (see
        // polling.js), so no separate initial refreshStock() call is
        // needed here; this both loads the first stock snapshot and kicks
        // off the recurring 5-minute poll in one step.
        setInterval(refreshCatalogInBackground, CATALOG_TTL_MS); // re-check menu every 3 min
        Polling.start({
            url: '/api/stock',
            intervalMs: STOCK_POLL_MS,
            fetcher: Auth.authFetch,
            onData: applyStockData,
        });
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
        applyStockData(stockMap);
    }

    // Shared by refreshStock() (used for the initial load and the hard
    // re-check immediately before checkout) and Polling's onData callback
    // (the background 5-minute poll) — one place that merges a fresh
    // stock map into the in-memory catalog and re-renders.
    function applyStockData(stockMap) {
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

            const row = document.createElement('div');
            row.className = 'product-row' + (soldOut ? ' sold-out' : '');
            row.innerHTML = `
                <div class="product-row-main">
                    <h3>${product.name}</h3>
                    <span class="product-row-category">${product.category}</span>
                </div>
                <div class="stock-note${low ? ' low' : ''}">${!stockKnown ? '' : soldOut ? 'Sold out' : low ? product.stock + ' left' : ''}</div>
                <span class="price">${formatNaira(product.price)}</span>
                <button class="add-btn" ${soldOut ? 'disabled' : ''} aria-label="Add ${product.name} to order"><i class="fa-solid fa-plus"></i></button>`;
            row.querySelector('.add-btn').addEventListener('click', () => addToCart(product.id, product.name, product.price));
            productGrid.appendChild(row);
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

    function addToCart(id, name, price) {
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
        else cart.push({ id, name, price, quantity: 1 });

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
        addToCart('custom_' + Date.now(), name, price);
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
       BARCODE SCANNER — matches against catalog[].barcode (mapped from the
       API's `barcode` field — see fetchCatalogFromServer(), and the
       master_products.barcode column in Backend_Requirements.md §2.3).
       Nullable, so not every product will have one; unmatched scans just
       show "no match".
    --------------------------------------------------------------------- */
    const barcodeContainer = document.getElementById('barcode-reader-container');
    const barcodeStatus = document.getElementById('barcode-status');
    const startBtn = document.getElementById('start-scanner-btn');
    const closeBtn = document.getElementById('close-scanner-btn');
    let scanner = null;

    // Retail barcode formats — deliberately excludes QR_CODE. If you ever
    // want to accept both QR and barcode in the same scanner, add
    // Html5QrcodeSupportedFormats.QR_CODE back into this list.
    const BARCODE_FORMATS = typeof Html5QrcodeSupportedFormats !== 'undefined' ? [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.ITF,
    ] : undefined;

    function stopScanner() {
        if (scanner) {
            scanner.stop().then(() => scanner.clear()).catch(() => {});
            scanner = null;
        }
        barcodeContainer.style.display = 'none';
    }

    function onScanSuccess(decodedText) {
        stopScanner();
        const product = catalog.find(p => p.barcode === decodedText || String(p.id) === decodedText);
        if (product) addToCart(product.id, product.name, product.price);
        else showToast('No product matches that code.');
    }

    // Heuristic device check — good enough to pick a sensible default
    // camera; browsers don't expose a reliable "is this a phone" API.
    // Mobile gets the back (environment-facing) camera since that's what
    // you point at a barcode; desktop gets the front-facing webcam since
    // that's the only camera most laptops/desktops have.
    function isMobileDevice() {
        return /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
    }

    async function startScanner() {
        if (typeof Html5Qrcode === 'undefined') { showToast('Barcode scanner library failed to load — check your connection.'); return; }
        barcodeContainer.style.display = 'block';
        barcodeStatus.textContent = 'Point the camera at a product barcode.';

        scanner = new Html5Qrcode('barcode-reader', {
            ...(BARCODE_FORMATS ? { formatsToSupport: BARCODE_FORMATS } : {}),
            verbose: false,
        });

        const facingMode = isMobileDevice() ? 'environment' : 'user';

        try {
            // No qrbox passed — the whole video frame is the scan area, so
            // there's no manual selection box for the cashier to line
            // anything up against. fps only; the library still runs its
            // own detection loop across the full frame each tick.
            await scanner.start({ facingMode }, { fps: 10 }, onScanSuccess, () => { /* ignore background scan noise */ });
        } catch (err) {
            barcodeStatus.textContent = 'Camera unavailable — check permissions or try a different device.';
            console.error(err);
        }
    }

    startBtn.addEventListener('click', startScanner);
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