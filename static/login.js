/* ==========================================================================
   LOGIN.JS — page-specific script for login.html. Depends on auth.js being
   loaded first (window.Auth).

   BUSINESS CODE — remembered per-device, not per-user. This login page
   lives on a fixed till, so the business code is almost always the same
   across shifts/cashiers; prefilling it (but never the password) saves
   retyping it every login without storing anything sensitive.
   ========================================================================== */

const BUSINESS_CODE_STORAGE_KEY = 'kc_last_business_code';

const businessCodeInput = document.getElementById('business-code');

(function prefillBusinessCode() {
    const saved = localStorage.getItem(BUSINESS_CODE_STORAGE_KEY);
    if (saved) businessCodeInput.value = saved;
})();

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const businessCode = businessCodeInput.value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    errorEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
        const user = await Auth.login(businessCode, username, password);

        // Remember the business code on this device — not the password —
        // so the next login on this till has it prefilled.
        localStorage.setItem(BUSINESS_CODE_STORAGE_KEY, businessCode);

        // Cashiers land on the till; admins land on stock management.
        // Adjust these paths once the real routes exist.
        if (user.role === 'cashier') {
            window.location.href = '/';
        } else {
            window.location.href = '/stock';
        }
    } catch (err) {
        errorEl.textContent = err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign in';
    }
});
