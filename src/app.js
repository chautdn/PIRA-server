require('dotenv').config();
const connectToDatabase = require('./config/database');
const app = require('./config/express');
const http = require('http');
const { Server } = require('socket.io');
const ChatGateway = require('./socket/chat.gateway');

const PORT = process.env.PORT || 5000;

connectToDatabase();

// CRITICAL: Create HTTP server and Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  },
  transports: ['websocket', 'polling'], // Prefer websocket
  pingTimeout: 60000,
  pingInterval: 25000
});

// Initialize chat gateway
const chatGateway = new ChatGateway(io);
global.chatGateway = chatGateway; // Make available globally

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
console.log('✅ Partial confirmation cron job initialized');

// Initialize shipment cron job
const { startShipmentCronJob } = require('./scripts/shipmentCron');
startShipmentCronJob();
console.log('✅ Shipment cron job initialized');

// Initialize return shipment cron job
const { startReturnShipmentCronJob } = require('./scripts/returnShipmentCron');
startReturnShipmentCronJob();
console.log('✅ Return shipment cron job initialized');

// Log Socket.IO events for monitoring
io.engine.on('connection_error', (err) => {
  console.error('Socket.IO connection error:', err);
});

// Use server instead of app for listening
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Socket.IO enabled for real-time chat');
});

// Handle server errors
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = { app, server, io };
