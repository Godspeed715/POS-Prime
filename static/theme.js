/* ==========================================================================
   THEME.JS — loaded once, directly in base.html, so every page (pos, stock,
   reconcile) shares one toggle and one persisted preference. Previously
   this logic lived duplicated inside script.js (POS only), which is why
   the toggle only existed on one page and reset back to light every time
   you navigated away — data-theme was being set on a plain in-memory JS
   variable with nothing writing it anywhere durable.

   The actual "avoid a flash of the wrong theme on load" work happens in a
   small inline <script> in base.html's <head>, BEFORE this file loads —
   this file only needs to sync the toggle icon and handle clicks.
   ========================================================================== */

(function () {
    "use strict";

    const STORAGE_KEY = 'kc_theme';
    const root = document.documentElement;
    const toggle = document.getElementById('theme-toggle');
    const icon = document.getElementById('theme-icon');

    function applyIcon(theme) {
        if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    }

    // Sync icon to whatever the inline head script already applied
    applyIcon(root.getAttribute('data-theme') || 'light');

    if (toggle) {
        toggle.addEventListener('click', () => {
            const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            localStorage.setItem(STORAGE_KEY, next);
            applyIcon(next);
        });
    }
})();
