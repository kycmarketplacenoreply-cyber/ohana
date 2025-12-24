# Render Deployment Setup Guide

## Quick Start

### Step 1: Push to Render
1. Connect your GitHub repository to Render
2. Render will automatically detect the `render.yaml` file

### Step 2: Set Environment Variables
In Render Dashboard, set these environment variables in the service settings:

**Required Security Variables (Keep these secure!):**
```
JWT_SECRET=<your-secret-key>
ADMIN_KAI_PASSWORD=<secure-password>
ADMIN_TURBO_PASSWORD=<secure-password>
CS_PASSWORD=<support-password>
FINANCE_MANAGER_PASSWORD=<finance-password>
BREVO_SMTP_PASSWORD=<brevo-smtp-password>
MASTER_WALLET_PRIVATE_KEY=<wallet-key>
MASTER_WALLET_ADDRESS=<wallet-address>
ENCRYPTED_MASTER_WALLET_KEY=<encrypted-key>
HD_WALLET_SEED=<seed-phrase>
SWEEP_WALLET_ADDRESS=<sweep-address>
ENCRYPTION_KEY=<encryption-key>
BSCSCAN_API_KEY=<api-key>
```

### Step 3: Database Setup
The `render.yaml` file includes a PostgreSQL database configuration:
- Database name: `kyc`
- Region: Frankfurt (you can change this)
- Render will automatically provide DATABASE_URL

### Step 4: First Deployment
Once you push this repository to GitHub and connect it to Render:
1. The build process will run: `npm install && npm run build`
2. Database migrations will run automatically on first deployment
3. The app will start with: `npm start`

## Environment Variables Explained

### Critical for Security
- **JWT_SECRET**: Used for signing authentication tokens. Generate a strong random string.
- **ENCRYPTION_KEY**: Used for encrypting sensitive data. Must be at least 32 characters.
- **Master Wallet Keys**: These control your blockchain wallet. Treat as extremely sensitive.

### Database
- **DATABASE_URL**: Automatically set by Render PostgreSQL database

### Blockchain
- **BSC_RPC_URL**: Default provided (Binance Smart Chain)
- **BSCSCAN_API_KEY**: Get from https://bscscan.com/apis

### Admin Credentials
- Set secure passwords for all admin roles
- These are checked during authentication

## Deployment Flow

1. Code pushed to GitHub
2. Render detects changes
3. Dependencies installed via `npm install`
4. Build runs: `npm run build`
5. Database migrations apply automatically
6. Server starts on designated port
7. App is live!

## Troubleshooting

### Database Connection Failed
- Verify DATABASE_URL is set correctly
- Check if database is created in Render PostgreSQL
- Wait 1-2 minutes after database creation before deploying

### Build Failed
- Check build logs in Render Dashboard
- Ensure all dependencies are in package.json
- Node version should be 18+ (Render uses Node 18+ by default)

### Environment Variable Not Found
- Refresh the Render service after adding environment variables
- Wait a few seconds for variables to be applied
- Check variable names match exactly (case-sensitive)

## Monitoring

In Render Dashboard, you can:
- View logs in real-time
- Restart the service
- View deployment history
- Monitor resource usage
- Check database status

## Custom Domain

To add a custom domain:
1. Go to service settings in Render
2. Add custom domain
3. Update your DNS records as instructed

## Rolling Back

If you need to rollback:
1. Go to Deployments tab
2. Select previous deployment
3. Click "Restart"

## Need Help?

- Render Docs: https://render.com/docs
- GitHub Integration: https://render.com/docs/github
- Database: https://render.com/docs/databases
