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

// Log Socket.IO events for monitoring
io.engine.on('connection_error', (err) => {
  console.error('Socket.IO connection error:', err);
});

// Use server instead of app for listening
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Socket.IO enabled for real-time chat');
});

module.exports = { app, server, io };
