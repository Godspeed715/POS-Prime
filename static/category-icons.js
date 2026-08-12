/* ==========================================================================
   CATEGORY-ICONS.JS

   Your `products` table has no `image` column, and category is now a fixed
   set of six values rather than free text — so instead of per-product
   photos, every product's visual is derived purely from its category via
   this shared lookup. One source of truth used by script.js (POS),
   stock.js (add/edit form + table), and reconcile.js (match results +
   "create new product" preview) — change a color/emoji here and it updates
   everywhere at once.

   Load this BEFORE any page script that references `CategoryIcons`.
   ========================================================================== */

const CategoryIcons = (function () {
    function svgImage(emoji, hex) {
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'><rect width='300' height='200' fill='${hex}'/><text x='50%' y='54%' font-size='78' text-anchor='middle' dominant-baseline='middle'>${emoji}</text></svg>`;
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    // The six fixed categories. Keep this order — it's also what populates
    // the <select> dropdowns on the stock and reconcile pages.
    const MAP = {
        'Food and Dry Staples':          { emoji: '🌾', color: '#B8860B' },
        'Oils, Spices, and Condiments':  { emoji: '🫙', color: '#A0522D' },
        'Beverages and Snacks':          { emoji: '🥤', color: '#6E1F3A' },
        'Toiletries and Household Care': { emoji: '🧴', color: '#2F6F4E' },
        'Cosmetics and Grooming':        { emoji: '💄', color: '#B3382C' },
        'Electronics':                   { emoji: '🔌', color: '#4A342A' },
    };

    const FALLBACK = { emoji: '📦', color: '#9AA39C' }; // unrecognised/missing category
    const CUSTOM   = { emoji: '✨', color: '#7A7160' }; // nameless items typed in at checkout

    function get(category) {
        const entry = MAP[category] || FALLBACK;
        return svgImage(entry.emoji, entry.color);
    }

    function getCustom() {
        return svgImage(CUSTOM.emoji, CUSTOM.color);
    }

    function list() {
        return Object.keys(MAP);
    }

    return { get, getCustom, list, svgImage };
})();
