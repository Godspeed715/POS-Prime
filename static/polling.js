/* ==========================================================================
   POLLING.JS — shared across every page that needs to poll a backend
   endpoint on an interval (currently: POS and Stock Management poll
   /api/stock; Transactions will poll /api/transactions once that page
   exists). Load this before any page script that calls Polling.start().

   WHY 5 MINUTES, NOT SOMETHING SHORTER
   Purely a database-load tradeoff, not a correctness guarantee — checkout
   still does its own hard stock re-check server-side immediately before
   completing a sale (see script.js's processCheckout()), independent of
   whatever this poll last saw. This interval only affects how fresh the
   on-screen numbers look between actual transactions; it does not, and
   must not, become the thing correctness depends on.

   THIS IS A UX CONVENIENCE, NOT A RATE LIMIT
   Everything in this file runs in the client's browser — anyone can
   override the interval, skip it entirely, or hit these endpoints directly
   outside the app at any frequency they like. Nothing here constrains
   request volume against the database; that has to be enforced
   server-side (see Backend_Requirements.md's rate limiting section). This
   module exists purely so five different pages don't each reinvent their
   own setInterval + visibility-handling logic slightly differently.

   USAGE
       const handle = Polling.start({
           url: '/api/stock',
           intervalMs: 5 * 60 * 1000,
           fetcher: Auth.authFetch,     // anything with a fetch-like signature
           onData: (data) => { ... },   // called with the parsed JSON body
           onError: (err) => { ... },   // optional
       });
       // later, if the page ever needs to stop polling entirely:
       handle.stop();
   ========================================================================== */

const Polling = (function () {
    function start({ url, intervalMs, fetcher, onData, onError }) {
        if (!url || !intervalMs || !fetcher || !onData) {
            throw new Error('Polling.start() requires url, intervalMs, fetcher, and onData.');
        }

        let timerId = null;
        let stopped = false;

        async function tick() {
            try {
                const res = await fetcher(url);
                if (!res.ok) throw new Error(`Poll failed: ${url} returned ${res.status}`);
                const data = await res.json();
                onData(data);
            } catch (err) {
                if (onError) onError(err);
                else console.error('Polling error', url, err);
            }
        }

        function startTimer() {
            if (timerId !== null) return; // already running
            timerId = setInterval(tick, intervalMs);
        }

        function stopTimer() {
            if (timerId === null) return;
            clearInterval(timerId);
            timerId = null;
        }

        // Pause entirely while the tab is hidden — no point hitting the
        // server for a page nobody's looking at. On refocus: fetch
        // immediately (so the cashier doesn't wait up to a full interval
        // for fresh data after switching back) and resume the timer.
        function handleVisibilityChange() {
            if (stopped) return;
            if (document.hidden) {
                stopTimer();
            } else {
                tick();
                startTimer();
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Kick off immediately on start, then begin the interval — no
        // reason to wait a full intervalMs before the first fetch.
        tick();
        if (!document.hidden) startTimer();

        return {
            stop() {
                stopped = true;
                stopTimer();
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            },
        };
    }

    return { start };
})();
