# P2P Marketplace Application

## Overview

This is a full-stack peer-to-peer (P2P) cryptocurrency marketplace application that enables users to buy and sell USDT with various fiat currencies. The platform features an escrow system for secure transactions, real-time chat for trade communication, vendor rating system, KYC verification, and multi-language support. Built with React, TypeScript, Express, and PostgreSQL, the application provides a complete trading experience with vendor subscription tiers, payment method flexibility, and comprehensive security features.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server
- TailwindCSS with custom theme system for styling
- Wouter for lightweight client-side routing

**UI Component Library**
- Radix UI primitives for accessible, unstyled components
- Custom component library in `client/src/components/ui/` following shadcn/ui patterns
- Marketplace-specific components in `client/src/components/marketplace/`

**State Management & Data Fetching**
- TanStack React Query for server state management and caching
- Local storage for authentication tokens and user data
- Custom hooks for mobile responsiveness and toast notifications

**Internationalization**
- react-i18next for multi-language support
- Translation files for English, Chinese, Russian, Swahili, and French
- Language selector component with persistent storage

**Key Pages**
- HomePage: Marketplace listing with buy/sell offers
- TradePage: Create new trade orders
- OrdersPage: View buyer and vendor orders
- OrderDetailPage: Track order status with real-time chat
- WalletPage: Manage balances and transactions
- SettingsPage: User settings, 2FA, and KYC management

### Backend Architecture

**Server Framework**
- Express.js with TypeScript
- HTTP server creation via Node.js `http` module
- Custom middleware for authentication, rate limiting, and file uploads

**Authentication & Authorization**
- JWT-based authentication with 7-day token expiration
- Role-based access control (admin, vendor, customer, support)
- Two-factor authentication using TOTP (Speakeasy library)
- Recovery codes for 2FA backup
- Password hashing with bcrypt (10 salt rounds)

**API Design**
- RESTful API endpoints under `/api` prefix
- Rate limiting on login (5/15min), register (3/hour), and general API (100/15min)
- Request logging with timing and response capture
- Trust proxy configuration for deployment environments

**File Upload Handling**
- Multer middleware for KYC document and chat image uploads
- File size limit of 5MB
- Allowed formats: JPEG, PNG, PDF
- Disk storage with unique filename generation

**Business Logic Services**
- Escrow service: Hold, release, and refund operations
- Notification service: Type-specific notifications for orders, payments, disputes
- OTP service: In-memory OTP generation and verification

### Database Architecture

**ORM & Database**
- Drizzle ORM with PostgreSQL dialect
- Type-safe schema definitions in `shared/schema.ts`
- Migrations stored in `./migrations` directory
- Connection pooling via `node-postgres`

**Schema Design**

Tables include:
- `users`: Core user accounts with roles, 2FA settings, email verification, freeze status
- `kyc`: KYC verification with tier system (tier0, tier1, tier2) and document storage
- `vendorProfiles`: Vendor statistics, ratings, trade counts, subscription plans
- `offers`: Buy/sell listings with price, limits, payment methods
- `orders`: Trade orders with status tracking (created, paid, confirmed, completed, cancelled, disputed)
- `chatMessages`: Order-specific messaging between buyers and vendors
- `disputes`: Dispute management with resolution tracking
- `disputeChatMessages`: Admin communication during dispute resolution
- `wallets`: User balances split into available and escrow amounts
- `transactions`: Financial transaction history with type categorization
- `ratings`: Vendor rating system
- `notifications`: User notification system with read tracking
- `auditLogs`: System activity logging for compliance
- `maintenanceSettings`: Platform maintenance mode configuration
- `themeSettings`: Customizable platform theming

**Enums**
- User roles, KYC status/tier, order status, dispute status, transaction types, subscription plans, notification types, maintenance modes

**Data Access Pattern**
- Storage abstraction layer in `server/storage.ts`
- Interface-based design for potential ORM swapping
- Centralized database operations with type safety

### Security Features

**Authentication Security**
- Password hashing with bcrypt
- JWT with secret key validation
- Two-factor authentication support
- Device fingerprinting for login tracking
- Login attempt counting and account freezing
- Recovery code system for 2FA

**Rate Limiting**
- Endpoint-specific rate limits to prevent abuse
- Distributed across login, registration, and general API access

**Input Validation**
- Zod schemas for request validation
- Drizzle-zod integration for database schema validation
- File upload restrictions (type and size)

**Authorization**
- Middleware-based role checking
- Admin-only endpoints protection
- User-specific resource access control

### Blockchain Wallet System (Added December 2025)

**Architecture**
- Real USDT (BEP20) on BNB Smart Chain mainnet
- DIY wallets using HD derivation (no third-party custody)
- Master hot wallet for withdrawals
- Unique deposit addresses per user via BIP32/BIP44 HD derivation

**Key Components**
- `server/utils/crypto.ts`: AES-256-GCM encryption, HD wallet derivation, address validation
- `server/services/blockchain.ts`: BSC RPC interaction via ethers.js, deposit monitoring, withdrawal processing
- `server/services/withdrawal.ts`: Multi-stage approval workflow, security validations
- `server/init-db.ts`: Blockchain tables auto-creation

**Database Tables**
- `user_deposit_addresses`: Per-user deposit addresses with encrypted private keys
- `blockchain_deposits`: Deposit tracking with confirmation status
- `deposit_sweeps`: Auto-sweep records from deposit addresses to master wallet
- `platform_wallet_controls`: Kill switches, limits, fees, emergency mode
- `blockchain_admin_actions`: Audit log for all admin wallet operations
- `user_withdrawal_limits`: Per-user daily withdrawal tracking
- `user_first_withdrawals`: First withdrawal delay tracking

**Security Features**
- Master wallet starts LOCKED on server startup - admin must manually unlock via API
- HD_WALLET_SEED required for deposit address generation (hard fail if missing)
- Withdrawals require admin approval before on-chain processing
- Emergency mode freezes all operations
- Daily limits: per-user and platform-wide
- First withdrawal delay (configurable, default 60 min)
- Large withdrawal delay (configurable, default 120 min for ≥1000 USDT)
- 24-hour withdrawal lock after password change
- BNB gas balance check before withdrawal broadcast

**Environment Variables Required**
- `BSC_RPC_URL`: BNB Smart Chain RPC endpoint
- `MASTER_WALLET_ADDRESS`: Hot wallet address for withdrawals
- `MASTER_WALLET_PRIVATE_KEY`: Hot wallet private key (or ENCRYPTED_MASTER_WALLET_KEY)
- `ENCRYPTION_KEY`: 32-character key for AES-256-GCM encryption
- `HD_WALLET_SEED`: BIP39 mnemonic (12+ words) for deterministic deposit addresses

**Withdrawal Flow**
1. User submits withdrawal request → balance immediately deducted
2. Admin reviews and approves/rejects via admin panel
3. Admin processes approved withdrawal → on-chain transaction sent
4. Transaction hash recorded, status updated to "sent"
5. If rejected, funds automatically refunded to user balance

**Admin Endpoints**
- `GET /api/admin/wallet-controls`: View all platform controls and master wallet balances
- `PATCH /api/admin/wallet-controls`: Update limits, fees, enable/disable operations
- `POST /api/admin/wallet-controls/unlock`: Unlock master wallet for withdrawals
- `POST /api/admin/wallet-controls/lock`: Lock master wallet
- `POST /api/admin/wallet-controls/emergency`: Enable/disable emergency mode
- `GET /api/admin/withdrawals`: List all withdrawal requests
- `POST /api/admin/withdrawals/:id/approve`: Approve withdrawal
- `POST /api/admin/withdrawals/:id/reject`: Reject withdrawal (auto-refund)
- `POST /api/admin/withdrawals/:id/process`: Send approved withdrawal on-chain

### Escrow System

**Workflow**
1. Vendor funds are held in escrow when order is created
2. Buyer marks payment as sent
3. Vendor confirms receipt and releases escrow
4. Auto-release mechanism with configurable timeout
5. Dispute resolution with admin override capabilities

**Balance Tracking**
- Separate available and escrow balances per wallet
- Transaction history for audit trail
- Multi-currency wallet support

### Loaders Zone Feature (Added December 2025)

**Overview**
High-trust loading feature with escrow protection for P2P asset transfers.

**Key Components**
- `loaderAds`: Loading advertisements with 10% commitment deposits
- `loaderOrders`: Order lifecycle with liability terms and messaging
- `loaderOrderMessages`: In-order chat system with system messages

**Business Logic**
1. Loader posts ad with 10% commitment deposit frozen from their balance
2. Receiver accepts deal and optionally provides upfront percentage
3. Receiver selects liability terms (Full Payment, 50%, 25%, 10%, or Time-Bound)
4. Loader confirms liability terms, funds are sent off-platform
5. Receiver marks order complete, fees deducted, escrow released

**Liability Options**
- `full_payment`: Receiver pays full amount regardless of asset freeze
- `partial_50/25/10`: Partial payment if assets frozen/unusable
- `time_bound_24h/48h/72h/1week/1month`: Pay if usable before deadline, else close

**Fee Structure**
- 3% loader fee on deal amount
- 2% receiver fee if upfront provided
- 5% combined from loader if no receiver upfront

**Order States**
- `awaiting_liability_confirmation`: Initial state after acceptance
- `funds_sent_by_loader`: After both parties confirm liability
- `asset_frozen_waiting`: If assets are frozen (optional state)
- `completed`: Deal finalized, fees deducted
- `cancelled`: Order cancelled by either party

**Frontend Pages**
- LoadersZone component with tabs: Active Ads, Post Ad, My Orders
- LoaderOrderPage for order detail with chat and liability selection

## External Dependencies

**Frontend Libraries**
- @tanstack/react-query: Server state management
- wouter: Client-side routing
- react-i18next: Internationalization
- Radix UI: Component primitives (@radix-ui/react-*)
- lucide-react: Icon library
- TailwindCSS: Utility-first styling
- react-hook-form + @hookform/resolvers: Form management
- class-variance-authority: Component variant handling

**Backend Libraries**
- express: Web server framework
- drizzle-orm: Database ORM
- pg: PostgreSQL client
- jsonwebtoken: JWT authentication
- bcrypt: Password hashing
- speakeasy: TOTP 2FA
- qrcode: QR code generation for 2FA setup
- multer: File upload handling
- express-rate-limit: API rate limiting
- nodemailer: Email notifications (configured but implementation varies)

**Build & Development Tools**
- Vite: Frontend build tool and dev server
- tsx: TypeScript execution for server
- esbuild: Server bundling for production
- @replit/vite-plugin-*: Replit-specific development enhancements

**Database**
- PostgreSQL: Primary data store
- drizzle-kit: Migration management

**Type Safety**
- TypeScript: End-to-end type safety
- Zod: Runtime type validation
- Shared schema definitions between frontend and backend