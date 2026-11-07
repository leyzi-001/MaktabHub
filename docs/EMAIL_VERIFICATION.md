# MaktabHub email verification setup

The complete updated source is already placed in this repository. No pages or user rows are deleted. This feature is not ready for live email until the SQL and dashboard settings below are applied.

## 1. Database: run before deploying

Back up your Supabase database, then paste the entire `backend/migrations/001_email_verification.sql` into Supabase SQL Editor and run it. It adds a nullable Auth identity link to existing profiles, a unique index, and a shared atomic rate-limit table and functions. It also blocks direct browser access to password hashes and protected post writes; the Express service role still has access.

Existing IDs, password hashes, posts and ownership stay intact. Existing users enter their original password, then verify their email if their linked Supabase identity is unconfirmed. Existing application JWTs require a fresh login because they lack the new audience and verification claims. No passwords or OTPs are migrated to frontend storage.

The database functions are executable only by `service_role`. Do not grant them to browser roles. Rate-limit storage failure blocks authentication rather than bypassing limits. Optionally schedule the cleanup SQL at the bottom of the migration daily using Supabase Cron.

## 2. Supabase dashboard

1. Authentication > Sign In / Providers > Email: enable Email and **Confirm email**. Set **Email OTP length to 6**, **Email OTP expiration to 600 seconds**, and the email sending minimum interval to **60 seconds**. Check the actual configured length; changing template text does not change OTP length. Dashboard labels may vary. If length is not exposed, use the official Management API's Auth configuration field `mailer_otp_length: 6` with an account access token from a trusted admin environment. Never put that token in this app.
2. Authentication > Email Templates > **Confirm signup**: subject `MaktabHub — Emailni tasdiqlash kodi`. Replace the body with the complete contents of `backend/templates/confirm-signup.html`. The `{{ .Token }}` variable is essential. Remove confirmation-link buttons. Do not edit the Magic Link template; this implementation uses signup confirmation, not passwordless login.
3. Authentication > SMTP Settings: configure a production SMTP provider and verified sender domain. Set the sender name to `MaktabHub`. Supabase's built-in email provider restricts recipients and sending volume, so it is unsuitable for general production signup. Check SMTP provider logs and Supabase Auth logs if delivery fails. A successful send API response cannot guarantee inbox delivery; check Spam too.
4. Authentication > Rate Limits: keep Supabase's verification limits enabled, choose email volume appropriate for your SMTP account, and preserve the 60-second resend interval. Application limits additionally allow five verification attempts per account per 15 minutes, ten login attempts per account per 15 minutes, five registrations per email per 15 minutes, and IP limits. Resending or obtaining another challenge does not reset the verification attempt bucket.
5. Authentication > URL Configuration: Site URL = your final HTTPS frontend URL. Add `http://localhost:5173` and your exact production URL to allowed redirects if you use other Supabase email flows. This code-entry flow needs no redirect or callback route.

Documentation: [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Auth settings API](https://supabase.com/docs/reference/api/v1-update-auth-service-config).

## 3. Local environment

Use Node.js 22 or newer. From the repository root:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
npm run install:all
```

Edit `backend/.env`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_BACKEND_ONLY_SERVICE_ROLE_KEY
JWT_SECRET=YOUR_CRYPTOGRAPHICALLY_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
FRONTEND_ORIGIN=http://localhost:5173
PORT=4000
```

Generate a secret locally with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. The service role key and JWT secret belong only on the backend. The frontend needs only `VITE_API_URL=http://localhost:4000/api`; never add a service-role key to any `VITE_` variable.

Run `npm run dev`. Open `http://localhost:5173`. The local Express process reads `backend/.env`. Both local and production environments can use the same hosted Supabase project, although a separate staging project is preferable for testing.

## 4. Vercel deployment (two projects, same repository)

Backend:

- Create a Vercel project with Root Directory `backend`, detected Express framework, and Node 22 or newer. `server.js` exports the app and only listens on a local port outside Vercel. Leave framework build/output settings at their defaults.
- Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, and `FRONTEND_ORIGIN=https://YOUR_FRONTEND.vercel.app` in the backend project's environment variables. Separate multiple exact allowed origins with commas. Do not include paths or trailing slashes. Use the same JWT secret across backend instances.
- Deploy and check `https://YOUR_BACKEND.vercel.app/api/health`.

Frontend:

- Create another project with Root Directory `frontend`, Framework Vite, Build Command `npm run build`, Output Directory `dist`.
- Set `VITE_API_URL=https://YOUR_BACKEND.vercel.app/api` before building. This is required for this two-project setup. Redeploy after any Vite environment change.
- `frontend/vercel.json` rewrites client navigation to `index.html`, so refreshes on existing pages work.
- Update backend `FRONTEND_ORIGIN` to the final frontend domain and redeploy the backend. Add custom frontend domains to that allowlist when applicable. Set Preview environment variables explicitly if testing a preview deployment.

The fallback `/api` URL only applies when your own hosting proxies `/api` to Express. The supplied two-project deployment requires the explicit `VITE_API_URL` above. Shared database rate limits work across serverless instances; Express's existing in-memory IP limiter is an additional per-instance limit. `trust proxy: 1` matches the single trusted ingress used here; reassess that setting if adding other proxies, and never expose a backend behind an untrusted proxy that accepts forged forwarding headers.

Vercel reference: https://vercel.com/docs/frameworks/backend/express

## 5. File placement / complete code

All paths are relative to the existing MaktabHub root. Complete code is in the files, not partial replacement snippets:

| Path | Change |
| --- | --- |
| `backend/server.js` | Installs the verification routes and checks, keeps other API features, exports Express for Vercel. |
| `backend/email-verification.js` | Password login, unconfirmed Auth provisioning, signup resend/verification, scoped challenges, shared limits, protected-route middleware. |
| `backend/email-verification.test.js` | API integration tests with mocked Supabase; no real emails or user data. |
| `backend/migrations/001_email_verification.sql` | Additive identity migration and secure atomic rate-limit functions. |
| `backend/templates/confirm-signup.html` | Paste into Supabase's Confirm signup email template. |
| `backend/.env.example` | Copy to backend `.env` and replace placeholders. |
| `backend/package.json` | Adds the test command and Node version requirement. |
| `frontend/src/App.jsx` | Registration handoff, session checks, verification integration, current MaktabHub name. |
| `frontend/src/EmailVerification.jsx` | Responsive six-input screen, paste/autofill, keyboard navigation, countdown, Uzbek feedback. |
| `frontend/src/style.css` | Existing design plus OTP styles and reduced-motion support. |
| `frontend/.env.example` | Local public API URL example. |
| `frontend/vercel.json` | SPA refresh support. |
| `.gitignore` | Ignores secrets, dependency folders and generated builds. |
| Root, frontend and backend `package-lock.json` | Dependency lockfiles created during installation. |
| `docs/EMAIL_VERIFICATION.md` | This setup guide. |

## 6. Security and recovery behavior

Password checks still use the original bcrypt hashes, keeping existing password login compatible. For missing identities the server uses `auth.admin.createUser` with `email_confirm: false`, then `auth.resend({ type: 'signup' })`. This permits gradual migration without changing profile IDs. Supabase generates and delivers the OTP; the server never generates, persists or logs one. Verification uses `verifyOtp` with `type: 'signup'`, validates the returned identity, and only then issues a MaktabHub session. Dedicated clients prevent OTP verification from mutating the shared database service-role client's session.

Verification challenges expire in 30 minutes, are scoped to verification only, and remain in React memory. OTP input remains only in component memory. Refreshing discards the challenge: enter email/password again to continue. Authenticated session tokens retain the existing localStorage behavior; codes and challenges are never written there. All protected API requests independently check current Supabase email confirmation; frontend flags are not trusted. Anonymous suggestions and public browsing retain their existing behavior.

If Auth provisioning or profile linking fails after the profile is created, enter the same email and password through **Kirish**. The next login retries linking, including recovery of an Auth identity created before an interrupted request. No partial failure grants protected access. SMTP failure retains an unverified account with a retry path. Incorrect, expired and consumed codes receive the same safe Uzbek error; the UI clears the input. Already-confirmed accounts log in with their password rather than resending confirmation.

Resend requests are atomically limited to one per email per 60 seconds even on delivery failure. The frontend timer is convenience only; server checks enforce the limit. Invalid formats also count toward verification limits. Never manually set `email_confirm: true` to resolve delivery errors.

## 7. Validation

```powershell
npm test --prefix backend
npm run build
node --check backend/server.js
node --check backend/email-verification.js
```

The automated tests mock Supabase responses. They validate API behavior but do not prove SMTP delivery, real Supabase token expiry, database function execution or a deployed Vercel configuration. Before production, run this manual checklist using a test email account after applying settings:

1. Register, confirm six boxes appear and no protected access is granted yet.
2. Receive a six-digit email code (including leading zeros), paste it and verify successfully.
3. Try a wrong code, a code older than 600 seconds, and reuse of a consumed code: all must fail without a session.
4. Send parallel resend requests: only one may send in 60 seconds; retry after cooldown.
5. Try five wrong codes, then another attempt: application must return HTTP 429 even with a new verification challenge.
6. Try an old app token and an unverified Supabase user: protected post creation must fail.
7. Test a legacy account: its password and existing posts must still work after verification.
8. Test SMTP failure and retry, refresh during verification, and refresh on each existing frontend route.
9. Repeat on the deployed Vercel frontend and confirm no backend keys appear in frontend source or network responses.
