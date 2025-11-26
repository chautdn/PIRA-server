# Utility Scripts

This folder contains utility and maintenance scripts for the PIRA server.

## Available Scripts

### Development & Maintenance

- **reset-password.js** - Reset user password

  ```bash
  node scripts/reset-password.js
  ```

  - Resets password for a specific user
  - Useful for account recovery

- **seed-categories.js** - Seed product categories
  ```bash
  node scripts/seed-categories.js
  ```

  - Populates database with product categories
  - Run once during initial setup

### Production Scripts (in src/scripts/)

- **promotionCron.js** - Automated promotion cleanup
  - Runs automatically via cron job
  - Deactivates expired promotions

- **createWallets.js** - Create missing wallets
  - One-time migration script
  - Ensures all users have wallets

## Usage Guidelines

1. **One-time scripts**: Run manually when needed (migrations, fixes)
2. **Recurring scripts**: Move to `src/scripts/` if needed in production
3. **Database scripts**: Always backup database before running
4. **Test scripts**: Test on development database first

## Notes

- **GITIGNORED**: Scripts are not deployed to production
- Use `require('dotenv').config()` to load environment variables
- Always handle errors gracefully
- Log important actions for debugging
