# Security Policy — MOARLI Bank (Morali Pay)

## Authentication

### User Authentication
- Firebase Authentication (email/password) is the sole identity provider
- Passwords are stored and validated by Firebase — never handled in plaintext
- Password reset requires OTP verification via email before setting a new password
- Registration requires email verification (OTP sent via Resend)

### Admin Authentication
- Admin accounts use a separate login flow via `/api/admin/login`
- Admin passwords are hashed with bcryptjs (cost factor 12)
- Admin credentials are validated server-side only — no `NEXT_PUBLIC_` env vars for secrets
- Admin sessions are tied to Firebase Auth tokens

### Card PIN Security
- PINs are encrypted client-side with AES-256-GCM before transmission
- Server stores only the encrypted payload (ciphertext + IV + salt)
- PIN verification happens server-side by decrypting and comparing
- PIN reveal requires account password re-authentication
- Rate limiting applies: 3 failed reveal attempts → 5-minute lockout
- A `MORALI_PIN_MASTER_KEY` is used for server-side PIN operations

## API Security

### Rate Limiting
- All sensitive endpoints (auth, PIN, transfers) are rate-limited via `src/lib/rate-limit.ts`
- Next.js middleware applies global rate limits on API routes
- Rate limit identifiers are based on IP address + endpoint path

### Input Validation
- All API routes use Zod schemas for request body validation (`src/lib/validation.ts`)
- Input sanitization is applied via `sanitizeInput()` and `sanitizeAmount()` helpers
- SQL/NoSQL injection is mitigated by Firebase Firestore's parameterized queries

### CORS & Headers
- API responses include appropriate security headers
- Server-only secrets are never exposed to the client

### Webhook Verification
- Payment webhooks are verified via HMAC signature using `PAYMENT_WEBHOOK_SECRET`
- Unverified webhooks are rejected with 401

## Data Protection

### Encryption in Transit
- All traffic uses HTTPS (enforced by Firebase hosting / CDN)
- Firebase SDK connections are TLS-encrypted by default

### Encryption at Rest
- Firestore data is encrypted at rest by Google Cloud Platform
- Card PINs have an additional layer of AES-256-GCM encryption

### Firestore Rules
- Users can only read/write their own document in `moraliUsers/{uid}`
- Transaction documents follow ownership-based access control
- Admin operations require Firebase Admin SDK (bypasses security rules)

### Environment Variables
- Secrets use `process.env` server-side only (no `NEXT_PUBLIC_` prefix)
- Client-exposed variables (`NEXT_PUBLIC_*`) contain only non-sensitive config
- `.env.local` and `.env.production` are in `.gitignore`

## Key Rotation Checklist

Rotate these credentials periodically (recommended: every 90 days):

- [ ] **Firebase API Key** — Regenerate in Firebase Console > Project Settings > General
- [ ] **Admin Password** — Change via admin dashboard or direct DB update + re-hash
- [ ] **MORALI_PIN_MASTER_KEY** — Requires re-encrypting all stored PINs with the new key
- [ ] **PAYMENT_WEBHOOK_SECRET** — Update in `.env` and notify payment provider
- [ ] **RESEND_API_KEY** — Regenerate in Resend dashboard
- [ ] **TWILIO_AUTH_TOKEN** — Regenerate in Twilio console
- [ ] **SMS_API_KEY** — Update with your SMS provider
- [ ] **Sentry DSN** — Rotate project key in Sentry settings
- [ ] **Google Service Account** — Generate new key in GCP IAM, update `GOOGLE_APPLICATION_CREDENTIALS`

### Post-Rotation Steps
1. Update the environment variable in `.env.production`
2. Redeploy the application
3. Verify the new credentials work (health check, test transaction)
4. Revoke the old credential in the provider's dashboard
5. Monitor Sentry for any authentication errors for 24 hours
