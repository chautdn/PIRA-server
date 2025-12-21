require('dotenv').config();

// Set timezone for the entire application
process.env.TZ = process.env.TIMEZONE || 'Asia/Ho_Chi_Minh';

const connectToDatabase = require('./config/database');
const app = require('./config/express');
const http = require('http');
const { Server } = require('socket.io');
const ChatGateway = require('./socket/chat.gateway');
const orderSocket = require('./socket/orderSocket');
const disputeSocket = require('./socket/disputeSocket');

const PORT = process.env.PORT || 5000;

connectToDatabase();

// CRITICAL: Create HTTP server and Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      process.env.CLIENT_URL || 'https://pira.asia',
      'https://pira.asia',
      'http://localhost:5173',
      'http://103.200.23.208', // VPS IP
      'https://103.200.23.208', // VPS IP HTTPS
      'http://pira.asia', // Domain HTTP
      'https://pira.asia', // Domain HTTPS
      /^http:\/\/10\.12\.64\.\d+:3000$/, // Allow any device on your network
      /^http:\/\/192\.168\.\d+\.\d+:3000$/, // Allow common local networks
      /^http:\/\/172\.\d+\.\d+\.\d+:3000$/ // Allow Docker/virtual networks
    ],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Prefer websocket
  pingTimeout: 60000,
  pingInterval: 25000
});

// Initialize chat gateway
const chatGateway = new ChatGateway(io);
global.chatGateway = chatGateway; // Make available globally
global.io = io; // Make Socket.IO instance available globally for order/contract events

// Initialize order socket for real-time order/contract updates
orderSocket(io);

// Initialize dispute socket for real-time dispute updates
const disputeSocketHandlers = disputeSocket(io);
global.disputeSocket = disputeSocketHandlers; // Make dispute socket available globally

// Initialize promotion cron job
const { startPromotionCronJob, runImmediately } = require('./scripts/promotionCron');
startPromotionCronJob();
runImmediately(); // Run cleanup on startup

// Initialize early return cron job
const {
  startEarlyReturnCronJob,
  runImmediately: runEarlyReturnImmediately
} = require('./scripts/earlyReturnCron');
startEarlyReturnCronJob();
runEarlyReturnImmediately(); // Run cleanup on startup

// Initialize partial confirmation cron job
const { startPartialConfirmationCron } = require('./scripts/partialConfirmationCron');
startPartialConfirmationCron();

// Initialize shipment cron job
const {
  startShipmentCronJob,
  startShipperNotificationEmailCronJob
} = require('./scripts/shipmentCron');
startShipmentCronJob();
startShipperNotificationEmailCronJob();

// Initialize frozen balance unlock cron job
const {
  startFrozenBalanceUnlockCron,
  runFrozenBalanceUnlockImmediately
} = require('./scripts/frozenBalanceUnlockCron');
startFrozenBalanceUnlockCron();
runFrozenBalanceUnlockImmediately(); // Run on startup

// Initialize dispute escalation cron job (daily at 2:00 AM)
const { startDisputeEscalationCron } = require('./scripts/disputeEscalationCron');
startDisputeEscalationCron();

// Initialize extension auto-refund cron job (every 10 minutes)
const { startExtensionAutoRefundCron } = require('./scripts/extensionAutoRefundCron');
startExtensionAutoRefundCron();

// Initialize auto-confirm delivery cron job (every hour)
const { startAutoConfirmDeliveryCron } = require('./scripts/autoConfirmDeliveryCron');
startAutoConfirmDeliveryCron();

// Log Socket.IO events for monitoring
io.engine.on('connection_error', (err) => {
  // Socket.IO connection error occurred
});

// Use server instead of app for listening
server.listen(PORT, '0.0.0.0', () => {
  // Server started successfully
});

// Handle server errors
server.on('error', (error) => {
  // Server error occurred
  if (error.code === 'EADDRINUSE') {
    // Port is already in use
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  // Uncaught exception occurred
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  // Unhandled rejection occurred
  process.exit(1);
});

module.exports = { app, server, io };
