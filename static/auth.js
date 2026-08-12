/* ==========================================================================
   AUTH.JS — shared across every page (login, stock admin, reconciliation,
   pos). Load this before any page-specific script that touches auth.

   ⚠ SCHEMA GAP — READ BEFORE WIRING UP THE BACKEND
   Your current `users` table is (id, username, password_hash) — no `role`
   column. Every role-gated page (stock, reconcile) and requireAuth() below
   depend on the login/refresh response including a `role` field. Without a
   role source on the backend, role gating simply can't function — this
   isn't optional polish, it's a blocking dependency. Add a `role` column
   (e.g. CHECK (role IN ('super_admin','admin','cashier'))) before wiring
   the real /api/auth/* routes, or role-based redirects/visibility will
   silently break (currentUser.role will be undefined for everyone).

   CONTRACT WITH THE BACKEND (not built yet — routes still pending):
     POST /api/auth/login    { username, password } -> { access_token, username, role }
                              + sets an httpOnly refresh_token cookie
     POST /api/auth/refresh  (cookie only, no body) -> same shape as login
     POST /api/auth/logout   (cookie only) -> clears the cookie

   WHY THE ACCESS TOKEN LIVES IN A JS VARIABLE, NOT localStorage:
   localStorage is readable by any JS running on the page, which means an
   XSS vulnerability anywhere in the app could steal it. Keeping it in a
   plain variable means it only exists in memory, and is gone the instant
   the tab is closed or reloaded — which is exactly why every protected
   page must call Auth.requireAuth() on load: it silently exchanges the
   httpOnly refresh cookie for a fresh access token before rendering
   anything, so a reload doesn't dump the user back to the login page.
   ========================================================================== */

const Auth = (function () {
    let accessToken = null;   // memory-only — never written to disk
    let currentUser = null;   // { username, role }

    /**
     * Exchanges the httpOnly refresh cookie for a new access token.
     * Returns true/false rather than throwing, since callers use this both
     * for silent background refreshes and for "is anyone logged in at all"
     * checks on page load.
     */
    async function silentRefresh() {
        try {
            const res = await fetch('/api/auth/refresh', {
                method: 'POST',
                credentials: 'include', // required — this is how the cookie gets sent
            });
            if (!res.ok) return false;

            const data = await res.json();
            accessToken = data.access_token;
            currentUser = { username: data.username, role: data.role };
            return true;
        } catch (err) {
            console.error('Silent refresh failed', err);
            return false;
        }
    }

    async function login(username, password) {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Login failed.');
        }

        const data = await res.json();
        accessToken = data.access_token;
        currentUser = { username: data.username, role: data.role };
        return currentUser;
    }

    async function logout(redirectTo = '/login') {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        accessToken = null;
        currentUser = null;
        window.location.href = redirectTo;
    }

    /**
     * Wrapper around fetch() for any call that needs the access token.
     * If the token has expired (401), it transparently refreshes once and
     * retries — callers never need to think about token expiry themselves.
     */
    async function authFetch(url, options = {}) {
        const attempt = () => fetch(url, {
            ...options,
            headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` },
            credentials: 'include',
        });

        let res = await attempt();

        if (res.status === 401) {
            const refreshed = await silentRefresh();
            if (!refreshed) {
                window.location.href = '/login';
                return res;
            }
            res = await attempt();
        }

        return res;
    }

    /**
     * Call this at the top of every protected page, before rendering
     * anything. Redirects to /login if there's no valid session, or to `/`
     * if the user is logged in but lacks the required role.
     *
     *   const user = await Auth.requireAuth(['admin', 'super_admin']);
     *   if (!user) return; // already redirected
     */
    async function requireAuth(allowedRoles = null) {
        const ok = await silentRefresh();
        if (!ok) {
            window.location.href = '/login';
            return null;
        }
        if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
            window.location.href = '/';
            return null;
        }
        return currentUser;
    }

    /**
     * Shows/hides any element with a data-role-required="admin,super_admin"
     * attribute based on the current user's role. Call this after
     * requireAuth() resolves on every app-shell page (pos/stock/reconcile),
     * so sidebar links a cashier shouldn't see are actually hidden for them,
     * not just protected server-side.
     */
    function applyRoleVisibility() {
        if (!currentUser) return;
        document.querySelectorAll('[data-role-required]').forEach(el => {
            const allowed = el.getAttribute('data-role-required').split(',').map(r => r.trim());
            el.style.display = allowed.includes(currentUser.role) ? '' : 'none';
        });
    }

    // Any element with data-action="logout" (e.g. the sidebar power-off
    // icon) triggers logout — wired once here so no page has to remember to
    // do it manually.
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-action="logout"]');
        if (trigger) {
            e.preventDefault();
            logout();
        }
    });

    return { login, logout, authFetch, requireAuth, applyRoleVisibility, getUser: () => currentUser };
})();
