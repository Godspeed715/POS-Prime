/*
    settings.js
    Handles the sidebar Settings modal: opening/closing, showing the
    business code, copy-to-clipboard, and the change-password form.

    Logout itself is NOT handled here — the "Log out" button inside the
    modal keeps the same `data-action="logout"` attribute the old sidebar
    icon used, so whatever listener auth.js already attaches for that
    attribute keeps working unchanged. If auth.js binds directly to the
    old element instead of delegating from the document, that binding
    will need to move to this button.

    ASSUMPTIONS TO VERIFY AGAINST YOUR BACKEND:
    - The business code is fetched from GET /api/settings/me, expected to
      return JSON shaped like { "business_code": "..." }. Adjust the URL
      and/or field name below if your actual endpoint differs.
    - Password change POSTs JSON to POST /api/settings/change-password
      with { current_password, new_password }, expecting a 2xx on success
      and a JSON body like { detail: "..." } on failure (matches a typical
      FastAPI HTTPException shape). Adjust the URL/payload to match your
      actual route.
*/
(function () {
    const modal = document.getElementById('settings-modal');
    const openBtn = document.getElementById('settings-btn');
    if (!modal || !openBtn) return;

    const closeBtns = modal.querySelectorAll('[data-action="close-settings"]');
    const businessCodeEl = document.getElementById('settings-business-code');
    const copyBtn = document.getElementById('copy-business-code');
    const form = document.getElementById('change-password-form');
    const feedbackEl = document.getElementById('password-feedback');

    let lastFocused = null;

    async function populateBusinessCode() {
        businessCodeEl.textContent = 'Loading…';
        try {
            const res = await Auth.authFetch('/api/settings/me', {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
            });
            if (!res.ok) throw new Error('Request failed');
            const data = await res.json();
            businessCodeEl.textContent = data.business_code || 'Unavailable';
        } catch (err) {
            businessCodeEl.textContent = 'Unavailable';
        }
    }

    function openModal() {
        lastFocused = document.activeElement;
        modal.hidden = false;
        populateBusinessCode();
        const firstFocusable = modal.querySelector('.modal-close-btn');
        if (firstFocusable) firstFocusable.focus();
        document.addEventListener('keydown', onKeydown);
    }

    function closeModal() {
        modal.hidden = true;
        document.removeEventListener('keydown', onKeydown);
        if (form) {
            form.reset();
            setFeedback('', null);
        }
        if (lastFocused) lastFocused.focus();
    }

    function onKeydown(e) {
        if (e.key === 'Escape') closeModal();
    }

    function setFeedback(message, kind) {
        if (!feedbackEl) return;
        feedbackEl.textContent = message;
        feedbackEl.classList.remove('ok', 'err');
        if (kind) feedbackEl.classList.add(kind);
    }

    openBtn.addEventListener('click', openModal);
    closeBtns.forEach((btn) => btn.addEventListener('click', closeModal));

    // Click on the dimmed backdrop (not the panel itself) closes the modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const code = businessCodeEl.textContent.trim();
            if (!code || code === 'Unavailable' || code === 'Loading…') return;
            try {
                await navigator.clipboard.writeText(code);
                const icon = copyBtn.querySelector('i');
                icon.classList.remove('fa-copy');
                icon.classList.add('fa-check');
                setTimeout(() => {
                    icon.classList.remove('fa-check');
                    icon.classList.add('fa-copy');
                }, 1500);
            } catch (err) {
                if (window.showToast) window.showToast('Could not copy — select and copy manually');
            }
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            const submitBtn = form.querySelector('button[type="submit"]');

            if (newPassword.length < 8) {
                setFeedback('New password must be at least 8 characters.', 'err');
                return;
            }
            if (newPassword !== confirmPassword) {
                setFeedback('New passwords do not match.', 'err');
                return;
            }

            submitBtn.disabled = true;
            setFeedback('Updating…', null);

            try {
                const res = await Auth.authFetch('/api/settings/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        current_password: currentPassword,
                        new_password: newPassword,
                    }),
                });

                if (!res.ok) {
                    let message = 'Could not update password.';
                    try {
                        const data = await res.json();
                        if (data && data.detail) message = data.detail;
                    } catch (_) { /* non-JSON error body — keep default message */ }
                    setFeedback(message, 'err');
                    return;
                }

                setFeedback('Password updated.', 'ok');
                form.reset();
                if (window.showToast) window.showToast('Password updated');
            } catch (err) {
                setFeedback('Network error — please try again.', 'err');
            } finally {
                submitBtn.disabled = false;
            }
        });
    }
})();
