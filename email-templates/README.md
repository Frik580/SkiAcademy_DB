# Carve Academy — bilingual verification email

## Scope and status

The HTML template in `verify-email.bilingual.html` is **prepared but not sent** by Firebase Authentication. Do not paste HTML into the Firebase Authentication verification template editor and expect the same rendering. The built-in Firebase sender has limited controls for verification messages (sender name/domain and subject); it is not a general-purpose branded HTML email sender.

The current client `sendEmailVerification` flow remains active. The client now includes a return URL to the requesting app; this does not change how the Firebase-hosted verification action is processed.

## Desired message

**From display name:** Carve Academy

**Subject:** `Подтвердите email / Verify your email — Carve Academy`

**HTML:** `verify-email.bilingual.html`

One bilingual message for every recipient. The `{{VERIFY_URL}}` token must be replaced **on the server**, after generating a single-use email verification link via Firebase Admin SDK. HTML-escape the replacement for an HTML attribute. Never expose service credentials or generation keys to the browser; never store or log action links or codes. Optionally include a plain-text alternative with the same verified URL.

**Return destination:** `https://ski-school-staging.web.app/` in staging, production app origin only after a separate production rollout.

## Staging operational prerequisites (NOT performed by this PR)

1. Choose and configure a transactional email provider and verified sender domain (e.g. verified `mail.yourdomain`), with SPF/DKIM/DMARC as required by that provider.
2. Implement a protected server callable that checks the authenticated UID's Firebase Auth record and matching email, rejects disabled/verified users, enforces strict per-user and network throttling, and calls `generateEmailVerificationLink` through Admin SDK. Prevent arbitrary recipient and arbitrary continue URLs.
3. Render this template with the generated action URL and send using the email provider from the **server**. Install the provider API key via Secret Manager / Firebase secret, not source control or Vite env.
4. Make a separately reviewed opt-in rollout switch for staging; keep Firebase's default sending path as a fallback until integration and tests pass.
5. Test sign-up, resend, an already verified account, links clicked in a separate browser, expiration and replay, and the return to the app; inspect actual RU/EN rendering on phone and desktop.
6. Only after staging passes, plan a separate production release. Do not change production Auth Templates while staging is being tested.

## Immediate no-provider console improvements

In [Firebase Console staging Authentication → Templates](https://console.firebase.google.com/project/ski-school-staging/authentication/emails) you may configure:

- Project public-facing name: `Carve Academy`.
- Verification-email sender name: `Carve Academy`.
- Subject: `Подтвердите email / Verify your email — Carve Academy`.
- Sender domain: only after completing Firebase's domain/DNS verification.
- Existing action URL: leave unchanged until a custom action handler implements `verifyEmail` with `applyActionCode`. Do **not** point it directly at the React SPA root without a handler.

Settings made in the Firebase Console are environment-specific and are **not** applied by this PR.
