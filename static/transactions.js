/* ==========================================================================
   TRANSACTIONS.JS — visible to every role for now (see Backend_Requirements.md
   §6 — access scoping and filtering are both open decisions, not built).

   MOCK_TRANSACTIONS stands in for GET /api/transactions until that route
   exists. Real shape, per Backend_Requirements.md:
       [{ id, user_id, cashier_username, total_amount, timestamp }, ...]

   Kept intentionally simple — a flat, unfiltered list plus a client-side
   search box on cashier name. No date-range/business filtering yet; add
   it here once the open questions in the doc are resolved, rather than
   guessing at a shape now.
   ========================================================================== */

(function () {
    "use strict";

    let currentUser = null;
    const POLL_MS = 5 * 60 * 1000; // 5 minutes — matches the stock poll elsewhere

    async function init() {
        currentUser = await Auth.requireAuth(); // no role restriction — everyone can view, for now
        if (!currentUser) return; // already redirected
        Auth.applyRoleVisibility();

        await renderTable();

        Polling.start({
            url: '/api/transactions',
            intervalMs: POLL_MS,
            fetcher: Auth.authFetch,
            onData: (data) => { lastTransactionsList = data; applyFilterAndRender(); },
        });
    }

    function formatNaira(amount) {
        return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function formatDateTime(iso) {
        return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    /* =======================================================================
       MOCK — delete once GET /api/transactions exists for real.
    ======================================================================= */
    const MOCK_TRANSACTIONS = [
        { id: 501, cashier_username: 'kemi', total_amount: 12500, timestamp: '2026-08-26T14:03:00Z' },
        { id: 500, cashier_username: 'ngozi', total_amount: 68200, timestamp: '2026-08-26T11:47:00Z' },
        { id: 499, cashier_username: 'kemi', total_amount: 3400, timestamp: '2026-08-25T18:22:00Z' },
        { id: 498, cashier_username: 'tunde', total_amount: 950, timestamp: '2026-08-25T09:10:00Z' },
    ];

    async function fetchTransactionsFromServer() {
        // REAL VERSION: 
        // const res = await Auth.authFetch('/api/transactions'); return res.json();
        return MOCK_TRANSACTIONS;
    }

    /* ---------------------------------------------------------------------
       STATE + RENDER
    --------------------------------------------------------------------- */
    let lastTransactionsList = [];
    let searchTerm = '';

    const tableBody = document.getElementById('transactions-table-body');
    const emptyState = document.getElementById('transactions-empty-state');
    const liveIndicatorText = document.getElementById('live-indicator-text');

    async function renderTable() {
        liveIndicatorText.textContent = 'Loading…';
        lastTransactionsList = await fetchTransactionsFromServer();
        applyFilterAndRender();
    }

    function applyFilterAndRender() {
        const term = searchTerm.trim().toLowerCase();
        const filtered = lastTransactionsList.filter(t =>
            !term || t.cashier_username.toLowerCase().includes(term)
        );

        tableBody.innerHTML = '';
        emptyState.style.display = filtered.length === 0 ? 'block' : 'none';

        filtered
            .slice()
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .forEach(t => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="transaction-id">#${t.id}</td>
                    <td>${t.cashier_username}</td>
                    <td class="transaction-total">${formatNaira(t.total_amount)}</td>
                    <td>${formatDateTime(t.timestamp)}</td>`;
                tableBody.appendChild(tr);
            });

        const now = new Date();
        liveIndicatorText.textContent = 'Updated ' + now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
    }

    document.getElementById('transactions-search').addEventListener('input', (e) => {
        searchTerm = e.target.value;
        applyFilterAndRender();
    });

    init();
})();
