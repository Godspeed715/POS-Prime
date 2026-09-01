/* ==========================================================================
   SIGNUP.JS — super_admin only (for now; see file header note in
   signup.html about this opening up to public self-signup later).

   Two paths, one form:
     - Owner: business name -> server generates the login slug (see
       generateSlug() below, mirrors Backend_Requirements.md §2.4 — first
       word of the name + a randomized 2-digit suffix, retried on
       collision). Creates the business_listings row and its first admin
       user together.
     - Employee: business code (typed, looked up against an existing
       business) -> creates a cashier user under it.

   No localStorage memory of the last-used business code on this page —
   unlike the login page, whoever's using this console is onboarding
   different businesses over time, so persisting the last one typed would
   just be wrong prefill noise for the next unrelated signup.

   REAL VERSION: POST /api/auth/signup — see Backend_Requirements.md §3 for
   the full body/response contract for both signup_type branches. Until
   that route exists, submitting here just simulates the round trip and
   shows what the response would contain.
   ========================================================================== */

(function () {
    "use strict";

    let currentUser = null;
    let signupType = 'owner';

    // async function init() {
    //     currentUser = await Auth.requireAuth(['super_admin']);
    //     if (!currentUser) return; // already redirected
    //     Auth.applyRoleVisibility();
    // }

    /* ---------------------------------------------------------------------
       OWNER / EMPLOYEE TOGGLE
    --------------------------------------------------------------------- */
    const ownerFields = document.getElementById('owner-fields');
    const employeeFields = document.getElementById('employee-fields');
    const emailOptionalTag = document.getElementById('email-optional-tag');
    const emailInput = document.getElementById('signup-email');
    const formError = document.getElementById('signup-form-error');
    const resultBox = document.getElementById('signup-result');

    function setSignupType(type) {
        signupType = type;
        document.querySelectorAll('[data-signup-type]').forEach(btn =>
            btn.classList.toggle('active', btn.dataset.signupType === type)
        );
        ownerFields.style.display = type === 'owner' ? 'block' : 'none';
        employeeFields.style.display = type === 'employee' ? 'block' : 'none';
        emailOptionalTag.style.display = type === 'owner' ? 'none' : 'inline';
        formError.textContent = '';
        resultBox.style.display = 'none';
    }
    document.querySelectorAll('[data-signup-type]').forEach(btn =>
        btn.addEventListener('click', () => setSignupType(btn.dataset.signupType))
    );

    /* =======================================================================
       MOCK — stands in for the real /api/auth/signup round trip and the
       slug-uniqueness check that route would run server-side. Delete once
       that endpoint exists.
    ======================================================================= */
    const MOCK_EXISTING_SLUGS = new Set(['mama47', 'chidis12']);

    // Mirrors Backend_Requirements.md §2.4: first word of the business
    // name (lowercased, non-alphanumeric stripped) + a randomized 2-digit
    // suffix, retried on collision. A single-word name is used as-is, no
    // second-word fallback needed.
    function generateSlug(businessName) {
        const firstWord = businessName.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        let slug;
        do {
            const suffix = String(Math.floor(Math.random() * 100)).padStart(2, '0');
            slug = firstWord + suffix;
        } while (MOCK_EXISTING_SLUGS.has(slug));
        return slug;
    }

    async function submitOwnerSignup({ businessName, username, email, password }) {
        // REAL VERSION:
          const res = await Auth.authFetch('/api/auth/signup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ signup_type: 'owner', business_name: businessName, username, email, password }),
          });
          if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Signup failed.'); }
          return res.json();

        // await new Promise(r => setTimeout(r, 500));
        // const slug = generateSlug(businessName);
        // MOCK_EXISTING_SLUGS.add(slug);
        // return { id: Math.floor(Math.random() * 1000), username, role: 'admin', business_id: Math.floor(Math.random() * 1000), business_slug: slug };
    }

    async function submitEmployeeSignup({ businessCode, username, email, password }) {
        // REAL VERSION:
          const res = await Auth.authFetch('/api/auth/signup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ signup_type: 'employee', business_code: businessCode, username, email, password }),
          });
          if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Signup failed.'); }
          return res.json();

        // await new Promise(r => setTimeout(r, 500));
        // if (!MOCK_EXISTING_SLUGS.has(businessCode.trim().toLowerCase())) {
        //     throw new Error('No business found with that code.');
        // }
        // return { id: Math.floor(Math.random() * 1000), username, role: 'cashier', business_id: Math.floor(Math.random() * 1000), business_slug: businessCode };
    }

    /* ---------------------------------------------------------------------
       SUBMIT
    --------------------------------------------------------------------- */
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        formError.textContent = '';
        resultBox.style.display = 'none';

        const username = document.getElementById('signup-username').value.trim();
        const email = emailInput.value.trim();
        const password = document.getElementById('signup-password').value;

        if (!username) { formError.textContent = 'Username is required.'; return; }
        if (password.length < 8) { formError.textContent = 'Password must be at least 8 characters.'; return; }
        if (signupType === 'owner' && !email) { formError.textContent = 'Email is required for a business owner.'; return; }

        const btn = document.getElementById('signup-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Creating...';

        try {
            let created;
            if (signupType === 'owner') {
                const businessName = document.getElementById('business-name').value.trim();
                if (!businessName) throw new Error('Business name is required.');
                created = await submitOwnerSignup({ businessName, username, email, password });
            } else {
                const businessCode = document.getElementById('employee-business-code').value.trim();
                if (!businessCode) throw new Error('Business code is required.');
                created = await submitEmployeeSignup({ businessCode, username, email, password });
            }

            resultBox.style.display = 'block';
            resultBox.innerHTML = signupType === 'owner'
                ? `<strong>Business created.</strong>Login business code: <code>${created.business_slug}</code><br>Give this code to ${created.username} along with their username and password — all three are needed to sign in.`
                : `<strong>Employee added.</strong><code>${created.username}</code> can now sign in under business code <code>${created.business_slug}</code>.`;

            document.getElementById('signup-form').reset();
            setSignupType(signupType); // re-sync field visibility after reset
        } catch (err) {
            formError.textContent = err.message || 'Something went wrong.';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Create account';
        }
    });

    // init();
})();
