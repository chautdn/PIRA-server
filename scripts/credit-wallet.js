/*
  One-off script to credit a user's wallet.
  Usage (PowerShell):
    cd C:\Users\trung\OneDrive\Desktop\pira\PIRA-server
    node scripts\credit-wallet.js --walletId=691b295c8da6889e010ad8c1 --amount=1000000

  The script reads MONGODB_URI or DATABASE_URL from your environment (.env used by the app).
*/

const mongoose = require('mongoose');
const minimist = require('minimist');
require('dotenv').config();

const args = minimist(process.argv.slice(2));
const walletId = args.walletId || args.w;
const userId = args.userId || args.u;
const amount = Number(args.amount || args.a || 1000000);

if (!walletId && !userId) {
  console.error('Provide either --walletId or --userId');
  process.exit(1);
}

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.MONGO_URL;
if (!uri) {
  console.error('No MongoDB URI found in environment. Set MONGODB_URI or DATABASE_URL.');
  process.exit(1);
}

async function main() {
  await mongoose.connect(uri, { 
    retryWrites: true,
    w: 'majority'
  });
  mongoose.set('strictPopulate', false);
  console.log('Connected to DB');

  // Lazy-load Wallet model so this script doesn't depend on app boot sequence
  const Wallet = require('../src/models/Wallet');

  let wallet;
  if (walletId) {
    wallet = await Wallet.findById(walletId);
  } else if (userId) {
    wallet = await Wallet.findOne({ user: userId });
  }

  if (!wallet) {
    console.error('Wallet not found for given id/userId');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('Current wallet balance:', wallet.balance);

  // Credit amount to available balance
  wallet.balance.available = (Number(wallet.balance.available) || 0) + amount;

  // Optionally record a transactions array if the model supports it
  if (Array.isArray(wallet.transactions)) {
    wallet.transactions.push({
      type: 'DEPOSIT',
      amount: amount,
      description: 'Manual credit via scripts/credit-wallet.js',
      timestamp: new Date(),
      status: 'COMPLETED'
    });
  }

  await wallet.save();

  console.log(`Successfully credited ${amount.toLocaleString('vi-VN')} to wallet ${wallet._id}`);
  console.log('New wallet balance:', wallet.balance);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
