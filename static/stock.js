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

   The "Barcode" field maps to the schema's `qr_code` column — that column
   name is a holdover from when this was designed as QR scanning; it's
   functionally a barcode field now (see the Html5QrcodeScanner config
   below, restricted to EAN/UPC/CODE-128/etc formats, not QR_CODE).
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
        renderTable();
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
    ======================================================================= */
    let MOCK_PRODUCTS = [
        { id: 1, name: 'Rice (50kg bag)',        price: 65000, category: 'Food and Dry Staples',          stock: 12, barcode: '' },
        { id: 2, name: 'Groundnut Oil (5L)',      price: 8500,  category: 'Oils, Spices, and Condiments',  stock: 20, barcode: '' },
        { id: 3, name: 'Maggi Cubes (pack)',      price: 500,   category: 'Oils, Spices, and Condiments',  stock: 60, barcode: '' },
        { id: 4, name: 'Coca-Cola (35cl)',        price: 400,   category: 'Beverages and Snacks',          stock: 48, barcode: '' },
        { id: 5, name: 'Indomie (carton)',        price: 5200,  category: 'Food and Dry Staples',          stock: 15, barcode: '' },
        { id: 6, name: 'Dettol Soap',             price: 700,   category: 'Toiletries and Household Care', stock: 30, barcode: '' },
        { id: 7, name: 'Closeup Toothpaste',      price: 900,   category: 'Toiletries and Household Care', stock: 22, barcode: '' },
        { id: 8, name: 'Vaseline Lotion',         price: 2200,  category: 'Cosmetics and Grooming',        stock: 3,  barcode: '' },
        { id: 9, name: 'Phone Charger (Type-C)',  price: 3500,  category: 'Electronics',                   stock: 10, barcode: '' }
    ];
    let nextId = 100;

    async function fetchProductsFromServer() {
        // REAL VERSION: 
        const res = await Auth.authFetch('/api/products_with_stocks'); return res.json();
        // return MOCK_PRODUCTS;
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

    async function renderTable() {
        const term = searchTerm.trim().toLowerCase();
        const products = await fetchProductsFromServer();
        const filtered = products.filter(p => {
            const matchesTerm = !term || p.name.toLowerCase().includes(term) || (p.qr_code || '').toLowerCase().includes(term);
            const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
            return matchesTerm && matchesCategory;
        });

        tableBody.innerHTML = '';
        emptyState.style.display = filtered.length === 0 ? 'block' : 'none';

        filtered.forEach(p => {
            const low = p.stock > 0 && p.stock <= 5;
            const zero = p.stock === 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><img class="stock-thumb" src="${CategoryIcons.get(p.category)}" alt="${p.category}"></td>
                <td><div class="stock-name">${p.name}</div></td>
                <td>${p.category}</td>
                <td>${formatNaira(p.price)}</td>
                <td><span class="stock-qty ${zero ? 'zero' : low ? 'low' : ''}">${p.stock}</span></td>
                <td class="stock-barcode">${p.qr_code || '—'}</td>
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
    let editingId = null;

    function updateIconPreview() {
        imagePreview.src = CategoryIcons.get(categorySelect.value);
    }
    categorySelect.addEventListener('change', updateIconPreview);

    function openProductModal(product = null, prefillBarcode = null) {
        editingId = product ? product.id : null;
        document.getElementById('product-modal-title').textContent = product ? 'Edit Product' : 'Add Product';
        document.getElementById('product-id').value = product ? product.id : '';
        document.getElementById('product-name').value = product ? product.name : '';
        document.getElementById('product-category').value = product ? product.category : CategoryIcons.list()[0];
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
        if (scanner) { scanner.clear().catch(() => {}); scanner = null; }
        barcodeContainer.style.display = 'none';
    }

    function onBarcodeScanSuccess(decodedText) {
        stopScanner();

        const existing = MOCK_PRODUCTS.find(p => p.qr_code === decodedText);
        if (existing) {
            showToast(`This barcode is already linked to "${existing.name}" — editing it.`);
            openProductModal(existing);
            return;
        }

        showToast('Barcode captured — fill in the rest.');
        openProductModal(null, decodedText);
    }

    addBarcodeBtn.addEventListener('click', () => {
        if (typeof Html5QrcodeScanner === 'undefined') { showToast('Barcode scanner library failed to load — check your connection.'); return; }
        barcodeContainer.style.display = 'block';
        barcodeStatus.textContent = 'Point the camera at the product\u2019s barcode.';
        try {
            scanner = new Html5QrcodeScanner('barcode-reader', {
                fps: 10,
                qrbox: { width: 280, height: 120 }, // wide rectangle suits 1D barcodes better than a square box
                ...(BARCODE_FORMATS ? { formatsToSupport: BARCODE_FORMATS } : {}),
            }, false);
            scanner.render(onBarcodeScanSuccess, () => { /* ignore background scan noise */ });
        } catch (err) {
            barcodeStatus.textContent = 'Camera unavailable — check permissions or try a different device.';
            console.error(err);
        }
    });
    closeScannerBtn.addEventListener('click', stopScanner);

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

    async function saveProduct({ id, name, category, qr_code, price, stock }) {
        // REAL VERSION:
        //   const res = await Auth.authFetch(id ? `/api/products/${id}` : '/api/products', {
        //       method: id ? 'PUT' : 'POST',
        //       headers: { 'Content-Type': 'application/json' },
        //       body: JSON.stringify({ name, category, qr_code, price, stock_quantity: stock }),
        //   });
        //   if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Save failed.'); }
        //   return res.json();

        await new Promise(r => setTimeout(r, 400)); // simulate latency
        if (id) {
            const idx = MOCK_PRODUCTS.findIndex(p => p.id === id);
            if (idx > -1) MOCK_PRODUCTS[idx] = { ...MOCK_PRODUCTS[idx], name, category, qr_code, price, stock };
        } else {
            MOCK_PRODUCTS.push({ id: nextId++, name, category, qr_code, price, stock });
        }
    }

    /* ---------------------------------------------------------------------
       REMOVE CONFIRMATION MODAL
    --------------------------------------------------------------------- */
    const removeModalOverlay = document.getElementById('remove-modal-overlay');
    let pendingRemoveId = null;

    function openRemoveModal(product) {
        pendingRemoveId = product.id;
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
        //   const res = await Auth.authFetch(`/api/products/${pendingRemoveId}`, { method: 'DELETE' });
        //   if (!res.ok) { showToast('Failed to remove product.'); return; }

        await new Promise(r => setTimeout(r, 300));
        MOCK_PRODUCTS = MOCK_PRODUCTS.filter(p => p.id !== pendingRemoveId);

        btn.disabled = false;
        btn.textContent = 'Remove';
        closeRemoveModal();
        renderTable();
        showToast('Product removed.');
    });

    init();
})();
