/* ==========================================================================
   STOCK.JS — admin/super_admin only.

   Every place a real backend call belongs is marked with a REAL VERSION
   comment. Until then, MOCK_PRODUCTS is mutated directly in memory so the
   whole CRUD flow is fully testable without a server running.

   No `image` column exists on `products` — every product's icon is derived
   automatically from its category via CategoryIcons (category-icons.js,
   loaded before this file). There's no per-product image field to manage
   at all, which is why the Add/Edit form has no upload/URL controls — the
   icon preview just follows whichever category is selected.

   The "Barcode" field maps to the schema's `barcode` column on
   master_products (a holdover from when this was designed around a
   single-tenant `qr_code` column — renamed as part of the master/business
   product split; see Backend_Requirements.md §2.3).

   ID HANDLING — IMPORTANT
   ------------------------------------------------------------------------
   /api/products_with_stocks returns TWO different ids per row:
     - `id`                  → the shared master_products.id (same across
                                every business that sells this item)
     - `business_product_id` → THIS business's row — price, stock, and any
                                per-tenant overrides live here

   Every mutating call (PUT/DELETE on /api/products/:id) must target
   `business_product_id`, never the master id — editing/removing a product
   should only ever affect this business's own row. To avoid threading two
   ids through the whole file, fetchProductsFromServer() remaps the field
   at the fetch boundary: the object's `.id` becomes `business_product_id`,
   and the original master id is kept on `.master_id` in case it's needed
   later (e.g. for master-catalog debugging). Everything downstream
   (rendering, editingId, save, delete) can then just use `p.id` /
   `editingId` as-is and it will always be the correct per-business id.

   BARCODE LOOKUP (see lookupBarcode() below) — every barcode, whether
   typed manually or captured by either scanner entry point, is checked in
   two stages:
     1. Does THIS business already sell something with this barcode? If so,
        open it in edit mode rather than risking a duplicate. The id used
        to open that edit is the MATCHED PRODUCT'S business_product_id —
        never a master id.
     2. If not, does the barcode exist on the shared master catalog (i.e.
        some OTHER business already has a product with this barcode)? If
        so, prefill name + category from that master record — editable,
        not locked, since a business should always be free to relabel what
        they see. This is the master_products / business_products split
        described in Backend_Requirements.md; MOCK_MASTER_CATALOG below
        stands in for a GET/POST to /api/products/check-barcode.
     3. No match anywhere — treated as a brand-new product; saving it
        creates both a master row and a business row together per that
        same doc.
   ========================================================================== */

(function () {
    "use strict";

    /* ---------------------------------------------------------------------
       AUTH GATE
    --------------------------------------------------------------------- */
    let currentUser = null;

    async function init() {
        currentUser = await Auth.requireAuth(['admin', 'super_admin']);
        if (!currentUser) return; // already redirected by requireAuth
        Auth.applyRoleVisibility();

        populateCategorySelects();
        await renderTable();

        // Live stock updates — same /api/stock endpoint and shared module
        // POS uses, pauses on hidden tabs, fetches immediately on refocus.
        Polling.start({
            url: '/api/stock',
            intervalMs: STOCK_POLL_MS,
            fetcher: Auth.authFetch,
            onData: applyStockPoll,
        });
    }

    /* ---------------------------------------------------------------------
       TOAST
    --------------------------------------------------------------------- */
    const toastEl = document.getElementById('toast');
    let toastTimer = null;
    function showToast(msg, ms = 3000) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
    }

    function formatNaira(amount) {
        return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    /* =======================================================================
       MOCK DATA — delete once /api/products supports GET/POST/PUT/DELETE.
       Field names match the real schema: id, qr_code, name, price,
       category, stock_quantity (stock_quantity shown here as `stock` for
       consistency with script.js/reconcile.js — rename at the fetch
       boundary if your API returns the raw column name).

       NOTE: in mock mode there is no separate master/business split, so
       `id` here already behaves like a business_product_id would.
    ======================================================================= */
    let MOCK_PRODUCTS = [
        { id: 1, name: 'Rice (50kg bag)',        price: 65000, category: 'Food and Dry Staples',          stock: 12, qr_code: '' },
        { id: 2, name: 'Groundnut Oil (5L)',      price: 8500,  category: 'Oils, Spices, and Condiments',  stock: 20, qr_code: '' },
        { id: 3, name: 'Maggi Cubes (pack)',      price: 500,   category: 'Oils, Spices, and Condiments',  stock: 60, qr_code: '' },
        { id: 4, name: 'Coca-Cola (35cl)',        price: 400,   category: 'Beverages and Snacks',          stock: 48, qr_code: '' },
        { id: 5, name: 'Indomie (carton)',        price: 5200,  category: 'Food and Dry Staples',          stock: 15, qr_code: '' },
        { id: 6, name: 'Dettol Soap',             price: 700,   category: 'Toiletries and Household Care', stock: 30, qr_code: '' },
        { id: 7, name: 'Closeup Toothpaste',      price: 900,   category: 'Toiletries and Household Care', stock: 22, qr_code: '' },
        { id: 8, name: 'Vaseline Lotion',         price: 2200,  category: 'Cosmetics and Grooming',        stock: 3,  qr_code: '' },
        { id: 9, name: 'Phone Charger (Type-C)',  price: 3500,  category: 'Electronics',                   stock: 10, qr_code: '' }
    ];
    let nextId = 100;

    async function fetchProductsFromServer() {
        // REAL VERSION:
        const res = await Auth.authFetch('/api/products_with_stocks');
        const rows = await res.json();

        // Remap: `.id` becomes the per-business row id (business_product_id),
        // since that's the id every mutating call must use. The original
        // shared master id is preserved on `.master_id`.
        return rows.map(r => ({
            ...r,
            master_id: r.id,
            id: r.business_product_id,
        }));

        // return MOCK_PRODUCTS;
    }

    /* =======================================================================
       MOCK MASTER CATALOG — stands in for the shared master_products table
       described in Backend_Requirements.md. Represents barcodes that exist
       because SOME business (not necessarily this one) already has a
       product with that code. Delete once /api/products/check-barcode
       exists for real.
    ======================================================================= */
    const MOCK_MASTER_CATALOG = [
        { master_product_id: 501, barcode: '6009710000015', name: 'Milo (500g tin)', category: 'Beverages and Snacks' },
        { master_product_id: 502, barcode: '6001087340018', name: 'Omo Detergent (900g)', category: 'Toiletries and Household Care' },
        { master_product_id: 503, barcode: '6009184001234', name: 'Peak Milk (Evaporated, 170g)', category: 'Food and Dry Staples' },
    ];

    /**
     * Two-stage barcode lookup, run on every barcode this page sees —
     * whether typed by hand or captured by either scanner entry point.
     * See file header for the full behavior this drives.
     *
     * Returns one of:
     *   { type: 'own',    product }        — this business already has it.
     *                                         `product.id` here is ALWAYS
     *                                         the business_product_id, so
     *                                         it's safe to hand straight
     *                                         to openProductModal().
     *   { type: 'master', name, category }  — another business already has it
     *   { type: 'none' }                    — brand new, nobody has it
     */
    async function lookupBarcode(barcode) {
        // Check this business's own products first — already have them
        // from the last renderTable() fetch, so this is a free local
        // lookup, not a network round trip.
        const ownMatch = lastProductsList.find(p => p.barcode === barcode);
        if (ownMatch) return { type: 'own', product: ownMatch };

        // Not ours — check the shared master catalog for a cross-business
        // match. Matches Backend_Requirements.md §4's documented
        // check-barcode contract: { found: true, name, category } or
        // { found: false }. This endpoint only ever needs to know about
        // the master catalog, not this business's own products.
        const res = await Auth.authFetch('/api/products/check-barcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode }),
        });
        const data = await res.json();
        if (data.found) return { type: 'master', name: data.name, category: data.category };
        return { type: 'none' };
    }

    /* ---------------------------------------------------------------------
       STATE
    --------------------------------------------------------------------- */
    let searchTerm = '';
    let categoryFilter = 'All';

    /* ---------------------------------------------------------------------
       TABLE RENDER
    --------------------------------------------------------------------- */
    const tableBody = document.getElementById('stock-table-body');
    const emptyState = document.getElementById('stock-empty-state');

    const STOCK_POLL_MS = 5 * 60 * 1000; // 5 minutes — see polling.js header for why this isn't shorter

    let lastProductsList = []; // populated by renderTable(), read by applyStockPoll()

    async function renderTable() {
        const term = searchTerm.trim().toLowerCase();
        const products = await fetchProductsFromServer();
        lastProductsList = products;
        const filtered = products.filter(p => {
            const matchesTerm = !term || p.name.toLowerCase().includes(term) || (p.barcode || '').toLowerCase().includes(term);
            const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
            return matchesTerm && matchesCategory;
        });

        tableBody.innerHTML = '';
        emptyState.style.display = filtered.length === 0 ? 'block' : 'none';

        filtered.forEach(p => {
            const low = p.stock > 0 && p.stock <= 5;
            const zero = p.stock === 0;
            const tr = document.createElement('tr');
            tr.dataset.productId = p.id; // business_product_id, per the remap in fetchProductsFromServer()
            tr.innerHTML = `
                <td><img class="stock-thumb" src="${CategoryIcons.get(p.category)}" alt="${p.category}"></td>
                <td><div class="stock-name">${p.name}</div></td>
                <td>${p.category}</td>
                <td>${formatNaira(p.price)}</td>
                <td><span class="stock-qty ${zero ? 'zero' : low ? 'low' : ''}">${p.stock}</span></td>
                <td class="stock-barcode">${p.barcode || '—'}</td>
                <td>
                    <div class="row-actions">
                        <button class="edit-btn" aria-label="Edit ${p.name}"><i class="fa-solid fa-pen"></i></button>
                        <button class="danger-icon remove-btn" aria-label="Remove ${p.name}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>`;
            tr.querySelector('.edit-btn').addEventListener('click', () => openProductModal(p));
            tr.querySelector('.remove-btn').addEventListener('click', () => openRemoveModal(p));
            tableBody.appendChild(tr);
        });
    }

    // Called on every Polling tick (see init() below). Deliberately does
    // NOT re-run renderTable()/re-fetch the whole product list — that
    // would mean this "lightweight" 5-minute poll hitting the same heavy
    // endpoint as a full CRUD refresh. Instead it patches just the
    // quantity cell of whatever's currently rendered, using the same
    // /api/stock id->qty map POS polls.
    //
    // NOTE: /api/stock must key its map by business_product_id too, since
    // that's what `lastProductsList[].id` and the row datasets now hold.
    function applyStockPoll(stockMap) {
        lastProductsList.forEach(p => { p.stock = stockMap[p.id] ?? p.stock; });
        MOCK_PRODUCTS.forEach(p => { p.stock = stockMap[p.id] ?? p.stock; });

        tableBody.querySelectorAll('tr[data-product-id]').forEach(tr => {
            const product = lastProductsList.find(p => String(p.id) === tr.dataset.productId);
            const qtyEl = tr.querySelector('.stock-qty');
            if (!product || !qtyEl) return;

            const low = product.stock > 0 && product.stock <= 5;
            const zero = product.stock === 0;
            qtyEl.textContent = product.stock;
            qtyEl.className = 'stock-qty' + (zero ? ' zero' : low ? ' low' : '');
        });
    }

    function populateCategorySelects() {
        const categories = CategoryIcons.list();

        const filterSelect = document.getElementById('category-filter');
        filterSelect.innerHTML = '<option value="All">All categories</option>' +
            categories.map(c => `<option value="${c}">${c}</option>`).join('');

        const formSelect = document.getElementById('product-category');
        formSelect.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    document.getElementById('stock-search').addEventListener('input', (e) => { searchTerm = e.target.value; renderTable(); });
    document.getElementById('category-filter').addEventListener('change', (e) => { categoryFilter = e.target.value; renderTable(); });

    /* ---------------------------------------------------------------------
       ADD / EDIT MODAL
    --------------------------------------------------------------------- */
    const productModalOverlay = document.getElementById('product-modal-overlay');
    const productForm = document.getElementById('product-form');
    const productFormError = document.getElementById('product-form-error');
    const imagePreview = document.getElementById('image-preview');
    const categorySelect = document.getElementById('product-category');
    let editingId = null; // business_product_id of the row being edited, or null when adding

    function updateIconPreview() {
        imagePreview.src = CategoryIcons.get(categorySelect.value);
    }
    categorySelect.addEventListener('change', updateIconPreview);

    function openProductModal(product = null, prefillBarcode = null, prefillFromMaster = null) {
        editingId = product ? product.id : null; // product.id is business_product_id here
        document.getElementById('product-modal-title').textContent = product ? 'Edit Product' : 'Add Product';
        document.getElementById('product-id').value = product ? product.id : '';
        document.getElementById('product-name').value = product ? product.name : (prefillFromMaster ? prefillFromMaster.name : '');
        document.getElementById('product-category').value = product ? product.category : (prefillFromMaster ? prefillFromMaster.category : CategoryIcons.list()[0]);
        document.getElementById('product-barcode').value = product ? (product.barcode || '') : (prefillBarcode || '');
        document.getElementById('product-price').value = product ? product.price : '';
        document.getElementById('product-stock').value = product ? product.stock : '';
        productFormError.textContent = '';

        updateIconPreview();

        productModalOverlay.classList.add('show');
        document.getElementById('product-name').focus();
    }

    function closeProductModal() {
        productModalOverlay.classList.remove('show');
    }

    document.getElementById('add-product-btn').addEventListener('click', () => openProductModal());
    document.getElementById('product-modal-close').addEventListener('click', closeProductModal);
    document.getElementById('product-cancel-btn').addEventListener('click', closeProductModal);
    productModalOverlay.addEventListener('click', (e) => { if (e.target === productModalOverlay) closeProductModal(); });

    /* ---------------------------------------------------------------------
       ADD WITH BARCODE
       Scans a retail barcode and pre-fills the "Barcode" field of the
       Add/Edit modal so the admin only has to type in the rest — name,
       category, price, stock. If the scanned code already belongs to an
       existing product, opens that product in edit mode instead of risking
       a duplicate qr_code (the schema column this maps to — should stay
       unique).
    --------------------------------------------------------------------- */
    const barcodeContainer = document.getElementById('barcode-reader-container');
    const barcodeStatus = document.getElementById('barcode-status');
    const addBarcodeBtn = document.getElementById('add-barcode-btn');
    const closeScannerBtn = document.getElementById('close-scanner-btn');
    let scanner = null;

    // Retail barcode formats — deliberately excludes QR_CODE.
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

    async function onBarcodeScanSuccess(decodedText) {
        stopScanner();
        await handleBarcodeResolved(decodedText);
    }

    // Shared by both scan entry points AND manual typing (see the blur
    // listener on the barcode field below) — one place that decides what
    // happens once we know a barcode value, per the two-stage lookup
    // described in the file header.
    async function handleBarcodeResolved(barcode) {
        const result = await lookupBarcode(barcode);

        if (result.type === 'own') {
            showToast(`This barcode is already linked to "${result.product.name}" — editing it.`);
            openProductModal(result.product); // result.product.id is business_product_id
        } else if (result.type === 'master') {
            showToast('Barcode recognized from another business\u2019s catalog — name and category prefilled, edit as needed.');
            openProductModal(null, barcode, { name: result.name, category: result.category });
        } else {
            showToast('New barcode — fill in the rest.');
            openProductModal(null, barcode);
        }
    }

    // Same device heuristic as script.js (POS) — back camera on mobile,
    // front-facing webcam on desktop. No manual scan-region box; the
    // whole video frame is scanned.
    function isMobileDevice() {
        return /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
    }

    async function startScanner() {
        if (typeof Html5Qrcode === 'undefined') { showToast('Barcode scanner library failed to load — check your connection.'); return; }
        barcodeContainer.style.display = 'block';
        barcodeStatus.textContent = 'Point the camera at the product\u2019s barcode.';

        scanner = new Html5Qrcode('barcode-reader', {
            ...(BARCODE_FORMATS ? { formatsToSupport: BARCODE_FORMATS } : {}),
            verbose: false,
        });

        const facingMode = isMobileDevice() ? 'environment' : 'user';

        try {
            await scanner.start({ facingMode }, { fps: 10 }, onBarcodeScanSuccess, () => { /* ignore background scan noise */ });
        } catch (err) {
            barcodeStatus.textContent = 'Camera unavailable — check permissions or try a different device.';
            console.error(err);
        }
    }

    addBarcodeBtn.addEventListener('click', startScanner);
    closeScannerBtn.addEventListener('click', stopScanner);

    /* ---------------------------------------------------------------------
       INLINE SCAN BUTTON — next to the Barcode field inside the Add/Edit
       modal itself, for when you're already filling the form out and want
       to scan instead of typing. Reuses the same scanner + lookup flow;
       only difference is where the result lands (straight into the open
       form's barcode field, not a fresh modal).
    --------------------------------------------------------------------- */
    const inlineScanBtn = document.getElementById('scan-barcode-inline-btn');
    if (inlineScanBtn) {
        inlineScanBtn.addEventListener('click', async () => {
            if (typeof Html5Qrcode === 'undefined') { showToast('Barcode scanner library failed to load — check your connection.'); return; }

            barcodeContainer.style.display = 'block';
            barcodeStatus.textContent = 'Point the camera at the product\u2019s barcode.';
            scanner = new Html5Qrcode('barcode-reader', {
                ...(BARCODE_FORMATS ? { formatsToSupport: BARCODE_FORMATS } : {}),
                verbose: false,
            });
            const facingMode = isMobileDevice() ? 'environment' : 'user';

            try {
                await scanner.start({ facingMode }, { fps: 10 }, async (decodedText) => {
                    stopScanner();
                    document.getElementById('product-barcode').value = decodedText;

                    const result = await lookupBarcode(decodedText);
                    if (result.type === 'master') {
                        document.getElementById('product-name').value = result.name;
                        document.getElementById('product-category').value = result.category;
                        updateIconPreview();
                        showToast('Barcode recognized — name and category prefilled, edit as needed.');
                    } else if (result.type === 'own' && (!editingId || result.product.id !== editingId)) {
                        showToast(`Heads up — "${result.product.name}" already uses this barcode.`);
                    } else {
                        showToast('Barcode captured.');
                    }
                }, () => { /* ignore background scan noise */ });
            } catch (err) {
                barcodeStatus.textContent = 'Camera unavailable — check permissions or try a different device.';
                console.error(err);
            }
        });
    }

    // Manual typing check — if an admin pastes/types a barcode directly
    // into the field instead of scanning, run the same lookup on blur so
    // they get the same prefill-or-warn behavior either way.
    document.getElementById('product-barcode').addEventListener('blur', async (e) => {
        const barcode = e.target.value.trim();
        if (!barcode) return;

        const result = await lookupBarcode(barcode);
        if (result.type === 'master' && !document.getElementById('product-name').value.trim()) {
            document.getElementById('product-name').value = result.name;
            document.getElementById('product-category').value = result.category;
            updateIconPreview();
            showToast('Barcode recognized — name and category prefilled, edit as needed.');
        } else if (result.type === 'own' && (!editingId || result.product.id !== editingId)) {
            showToast(`Heads up — "${result.product.name}" already uses this barcode.`);
        }
    });

    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        productFormError.textContent = '';

        const name = document.getElementById('product-name').value.trim();
        const category = document.getElementById('product-category').value;
        const barcodeValue = document.getElementById('product-barcode').value.trim();
        const price = parseFloat(document.getElementById('product-price').value);
        const stock = parseInt(document.getElementById('product-stock').value, 10);

        if (!name) { productFormError.textContent = 'Name is required.'; return; }
        if (isNaN(price) || price < 0) { productFormError.textContent = 'Enter a valid price.'; return; }
        if (isNaN(stock) || stock < 0) { productFormError.textContent = 'Enter a valid stock quantity.'; return; }

        const saveBtn = document.getElementById('product-save-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            // editingId is the business_product_id (or null when adding).
            await saveProduct({ id: editingId, name, category, barcode: barcodeValue || null, price, stock });
            closeProductModal();
            renderTable();
            showToast(editingId ? `${name} updated.` : `${name} added.`);
        } catch (err) {
            productFormError.textContent = err.message || 'Something went wrong.';
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Product';
        }
    });

    async function saveProduct({ id, name, category, barcode, price, stock }) {
        // `id` here is a business_product_id (or null/undefined for a new
        // product) — never a master_products id. Use an explicit
        // null/undefined check rather than truthiness, so an id of 0
        // (or any other falsy-but-valid id your backend might use)
        // doesn't get misrouted to POST.
        const isEdit = id !== null && id !== undefined && id !== '';

        // REAL VERSION:
        const res = await Auth.authFetch(isEdit ? `/api/products/${id}` : '/api/products', {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, category, barcode, price, stock_quantity: stock }),
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Save failed.'); }
        return res.json();

        // await new Promise(r => setTimeout(r, 400)); // simulate latency
        // if (isEdit) {
        //     const idx = MOCK_PRODUCTS.findIndex(p => p.id === id);
        //     if (idx > -1) MOCK_PRODUCTS[idx] = { ...MOCK_PRODUCTS[idx], name, category, barcode, price, stock };
        // } else {
        //     MOCK_PRODUCTS.push({ id: nextId++, name, category, barcode, price, stock });
        // }
    }

    /* ---------------------------------------------------------------------
       REMOVE CONFIRMATION MODAL
    --------------------------------------------------------------------- */
    const removeModalOverlay = document.getElementById('remove-modal-overlay');
    let pendingRemoveId = null; // business_product_id

    function openRemoveModal(product) {
        pendingRemoveId = product.id; // business_product_id
        document.getElementById('remove-modal-text').innerHTML = `Remove <strong>${product.name}</strong> from the menu? This won't delete past sales history — it just stops it from being sold going forward.`;
        removeModalOverlay.classList.add('show');
    }
    function closeRemoveModal() { removeModalOverlay.classList.remove('show'); pendingRemoveId = null; }

    document.getElementById('remove-modal-close').addEventListener('click', closeRemoveModal);
    document.getElementById('remove-cancel-btn').addEventListener('click', closeRemoveModal);
    removeModalOverlay.addEventListener('click', (e) => { if (e.target === removeModalOverlay) closeRemoveModal(); });

    document.getElementById('remove-confirm-btn').addEventListener('click', async () => {
        if (pendingRemoveId === null) return;
        const btn = document.getElementById('remove-confirm-btn');
        btn.disabled = true;
        btn.textContent = 'Removing...';

        // REAL VERSION: consider a soft delete (e.g. an `is_active` column)
        // rather than a hard DELETE — transaction_items.product_id has a
        // foreign key to this row, and a hard delete would break that
        // history unless it cascades, which you almost certainly don't want.
        const res = await Auth.authFetch(`/api/products/${pendingRemoveId}`, { method: 'DELETE' });
        if (!res.ok) { showToast('Failed to remove product.'); btn.disabled = false; btn.textContent = 'Remove'; return; }

        // await new Promise(r => setTimeout(r, 300));
        // MOCK_PRODUCTS = MOCK_PRODUCTS.filter(p => p.id !== pendingRemoveId);

        btn.disabled = false;
        btn.textContent = 'Remove';
        closeRemoveModal();
        renderTable();
        showToast('Product removed.');
    });

    init();
})();