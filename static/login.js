/* ==========================================================================
   LOGIN.JS — page-specific script for login.html. Depends on auth.js being
   loaded first (window.Auth).
   ========================================================================== */

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    errorEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
        const user = await Auth.login(username, password);

        // Cashiers land on the till; admins and super_admins land on stock
        // management. Adjust these paths once the real routes exist.
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
