# MOARLI Bank (Morali Pay)

A full-stack, mobile-first digital banking application built for the Central African market. Morali Pay provides account management, peer-to-peer transfers, mobile money integration (MTN & Airtel), multi-currency wallets (XAF, EUR, USD), loan applications, card management, and an admin dashboard — all in a single progressive web app.

## Features

### User-Facing
- **Authentication** — Email/password login & registration with OTP email verification, password reset flow
- **Dashboard** — Real-time balance, spending chart, quick actions
- **Transfers** — Deposit, withdrawal, and P2P transfers via MTN/Airtel mobile money or Morali-to-Morali
- **Card Management** — Virtual cards, Black Card (steel/carbon), PIN setup/reveal/change/reset with server-side encryption
- **Multi-Currency Wallets** — XAF (FCFA), EUR, and USD wallets with live exchange
- **Currency Exchange** — Buy/sell EUR and USD against XAF with configurable rates
- **Loans** — Microcrédit (15/30/45 days) and Prêt Personnel (3–12 months) applications
- **Bill Payment** — Airtime, internet, Canal+ TV, electricity, water
- **Savings** — Dedicated savings account with deposit/withdrawal
- **Tontine (ROSCA)** — Create and manage rotating savings groups
- **QR Scanner** — Scan payment QR codes via device camera
- **KYC** — Identity verification with banking identity (RIB)
- **Notifications** — Real-time push notifications panel
- **Profile & Security** — Profile editing, connected devices, password change, privacy settings, biometric auth support
- **Legal** — Terms of service acceptance and privacy policy

### Admin Dashboard
- **User Management** — Search, view, edit, suspend/delete users; balance adjustments
- **Transaction Monitoring** — Filter by type, date, amount; view details
- **Audit Logging** — Full activity log with filtering
- **System Configuration** — Maintenance mode, default balance, transfer fees, bank name
- **Recharge & Withdraw** — Admin-controlled account operations
- **Reports** — Daily/weekly/monthly transaction summaries with PDF export
- **Backup & Reset** — Data backup and full reset capabilities

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript 5.9 |
| **Database** | Firebase Firestore |
| **Auth** | Firebase Authentication (email/password) |
| **Styling** | Inline CSS with CSS custom properties |
| **Charts** | Recharts |
| **PDF Export** | jsPDF + jspdf-autotable |
| **QR Codes** | qrcode.react |
| **QR Scanning** | jsqr |
| **Validation** | Zod |
| **Error Tracking** | Sentry |
| **Email** | Resend |
| **SMS** | Twilio |
| **Password Hashing** | bcryptjs |
| **Package Manager** | Bun |

## Getting Started

### Prerequisites
- Node.js 18+ and Bun
- Firebase project with Auth and Firestore enabled
- (Optional) Twilio account for SMS OTP
- (Optional) Resend account for email OTP

### Installation

```bash
# Clone the repository
git clone <repo-url> moarli-bank
cd moarli-bank

# Install dependencies
bun install

# Copy environment template
cp .env.production.example .env.local

# Fill in your Firebase and service credentials
# Edit .env.local with your values

# Run the development server
bun run dev
```

The app will be available at `http://localhost:3000`.

### Environment Variables

See [`.env.production.example`](./.env.production.example) for the full list of required environment variables.

## API Endpoints

### Authentication
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/send-reset-code` | Send password reset code via email |
| POST | `/api/auth/verify-reset-code` | Verify the OTP code |
| POST | `/api/auth/reset-password` | Reset password with new password |
| POST | `/api/auth/logout` | Log out current session |

### Admin
| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/login` | Admin login |
| POST | `/api/admin/register` | Register admin account |
| POST | `/api/admin/check-exists` | Check if admin account exists |
| GET | `/api/admin/fetch-data` | Fetch all users and transactions |
| POST | `/api/admin/recharge` | Recharge a user's balance |
| POST | `/api/admin/withdraw` | Withdraw from a user's balance |
| POST | `/api/admin/delete-user` | Delete a user |
| POST | `/api/admin/reset-all` | Reset all data |
| GET | `/api/admin/audit-log` | Get audit logs |
| POST | `/api/admin/init-role` | Initialize admin role |
| GET | `/api/admin/config` | Get system configuration |
| POST | `/api/admin/log` | Log admin action |

### Cards & PIN
| Method | Path | Description |
|---|---|---|
| POST | `/api/pin/store` | Store encrypted card PIN |
| POST | `/api/pin/verify` | Verify card PIN |
| POST | `/api/pin/reveal` | Reveal card PIN (requires auth) |
| GET | `/api/pin/get-encrypted` | Get encrypted PIN data |
| GET | `/api/pin/exists` | Check if PIN exists |
| POST | `/api/pin/reset` | Reset card PIN via OTP |

### Transactions
| Method | Path | Description |
|---|---|---|
| POST | `/api/transactions/create` | Create a transaction |
| GET | `/api/transactions/list` | List transactions |
| POST | `/api/transfer/execute` | Execute a transfer |

### Directory
| Method | Path | Description |
|---|---|---|
| POST | `/api/directory/register` | Register in Morali directory |
| POST | `/api/directory/search` | Search Morali directory |
| POST | `/api/directory/pending-credit` | Process pending credit |

### Services
| Method | Path | Description |
|---|---|---|
| GET | `/api/exchange-rate` | Get current exchange rates |
| POST | `/api/sms/send-otp` | Send SMS OTP |
| POST | `/api/sms/verify-otp` | Verify SMS OTP |
| POST | `/api/email/send-otp` | Send email OTP |
| POST | `/api/email/verify-otp` | Verify email OTP |
| POST | `/api/legal/accept` | Accept legal terms |
| POST | `/api/kyc` | Submit KYC data |
| POST | `/api/notifications/create` | Create a notification |
| GET | `/api/health` | Health check endpoint |
| POST | `/api/webhooks/payment` | Payment webhook handler |
| POST | `/api/verify-pin` | Verify transaction PIN |

## Project Structure

```
src/
├── app/
│   ├── MoraliApp.tsx          # Main application component (root)
│   ├── page.tsx               # Next.js entry page
│   ├── layout.tsx             # Root layout
│   ├── globals.css            # Global CSS
│   ├── ClientWrapper.tsx      # Client-side wrapper
│   ├── global-error.tsx       # Error boundary
│   └── api/
│       ├── admin/             # Admin management endpoints
│       ├── auth/              # Authentication endpoints
│       ├── cards/             # Card operations endpoints
│       ├── directory/         # User directory endpoints
│       ├── transactions/      # Transaction endpoints
│       ├── email/             # Email OTP endpoints
│       ├── sms/               # SMS OTP endpoints
│       ├── exchange-rate/     # Exchange rate endpoint
│       ├── kyc/               # KYC submission endpoint
│       ├── legal/             # Legal acceptance endpoint
│       ├── notifications/     # Notification creation endpoint
│       ├── health/            # Health check endpoint
│       └── webhooks/          # Payment webhook endpoint
├── components/
│   └── bank/
│       ├── AuthView.tsx        # Login/Register UI
│       ├── DashboardView.tsx   # Dashboard screen
│       ├── CardsView.tsx       # Card display screen
│       ├── TransactionsView.tsx # Transaction history
│       ├── TransferView.tsx    # Transfer flow UI
│       ├── ProfileView.tsx     # Profile/settings screen
│       ├── NotificationsPanel.tsx # Notifications overlay
│       ├── QrScanner.tsx       # QR code scanner
│       ├── LegalTerms.tsx      # Terms of service
│       ├── PrivacyPolicy.tsx   # Privacy policy text
│       └── Icons.tsx           # SVG icon components
├── hooks/
│   ├── useToast.ts            # Toast notification hook
│   ├── useFirestoreSync.ts    # Firestore real-time sync hook
│   ├── useTransactions.ts     # Transaction logic hook
│   └── useProfile.tsx         # Profile management hook
├── contexts/
│   └── AppContext.tsx          # Global app context
├── lib/
│   ├── firebase.ts            # Firebase client initialization
│   ├── admin-logger.ts        # Admin activity logging
│   ├── admin-firestore.ts     # Admin Firestore helpers
│   ├── auth-verify.ts         # Auth verification utilities
│   ├── helpers.ts             # General utility functions
│   ├── validation.ts          # Input validation (Zod schemas)
│   ├── pin-utils.ts           # PIN encryption/decryption
│   ├── pin-server-crypto.ts   # Server-side PIN crypto
│   ├── otp-store.ts           # OTP storage
│   ├── rate-limit.ts          # Rate limiting
│   ├── firestore-helpers.ts   # Firestore query helpers
│   └── sentry.ts              # Sentry initialization
├── types/
│   └── morali.ts              # TypeScript type definitions
└── middleware.ts               # Next.js middleware (rate limiting)
```

## Scripts

```bash
bun run dev       # Start development server
bun run build     # Production build
bun run start     # Start production server
bun run lint      # Run ESLint
bunx vitest run   # Run tests
```

## License

Private — All rights reserved.
