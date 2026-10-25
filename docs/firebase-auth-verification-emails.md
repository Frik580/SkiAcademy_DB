# Firebase Auth verification emails — Carve Academy

Built-in Firebase Authentication sends verification emails; no Resend, SMTP, or Cloud Function is needed.

## App behavior

- Verification and password-reset email locale uses the current UI language: `ru` or `en`.
- Confirmation uses `sendEmailVerification` with an authorized `/email-verified?lang=<ru|en>` continue URL at the current Hosting origin, with `handleCodeInApp: false`.
- Firebase's **default hosted email-action handler** applies the code. The user can then select Continue and reach our localized return page. Our return page is not a custom email-action handler and never treats its URL as proof of verification.
- New profile provisioning / guest claiming continue to require `emailVerified` and a fresh ID token.

## Manual Firebase Console setup for staging and production

1. Start in `ski-school-staging` and repeat for `ski-school-8f3ca` only after staging passes.
2. Authentication → Settings → Authorized domains: ensure your deployed Hosting host (e.g. `ski-school-staging.web.app` or `ski-school-8f3ca.web.app`) is present. Add any custom host you actively use. If localhost testing is needed, authorize localhost in the correct test project.
3. Authentication → Templates → Email address verification: retain the **default hosted action handler**. Set the sender name to **Carve Academy** if supported by the console. Keep Firebase-managed localizations; don't replace the email template with one fixed-language body. Test RU and EN separately.
4. Optional email sender/link domain `carveacademy.ru`: in Authentication → Templates, customize domain, copy the exact TXT/CNAME DNS records presented by Firebase, complete verification, then Apply Custom Domain. A Hosting deploy does not configure sender DNS.
5. For each language, register a test email, open the link, complete verification on Firebase's hosted handler, click Continue, sign in and verify the profile exists only after verification. Test resend/expired link and password reset.

Release scope: **Hosting only**. No change to Rules, indexes, or Cloud Functions. Do not deploy production before staging tests and existing security/release gates.

References: https://firebase.google.com/docs/auth/web/manage-users and https://firebase.google.com/docs/auth/web/passing-state-in-email-actions and https://firebase.google.com/docs/auth/email-custom-domain
