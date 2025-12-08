require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const { successHandler } = require('../core/success');
const { handleError } = require('../core/error');
const timezoneMiddleware = require('../middleware/timezoneMiddleware');
const router = require('../routes');
const cookieParser = require('cookie-parser');

const app = express();

// Security middleware with Google OAuth support
app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginEmbedderPolicy: false
  })
);

// CORS configuration - Always enabled for both development and production
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        process.env.CLIENT_URL || 'http://localhost:5173',
        'http://localhost:3001',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'https://pira.asia',
        'https://www.pira.asia',
        'http://pira.asia'
      ];

      // Allow any origin from local network (10.x.x.x, 192.168.x.x, 172.x.x.x)
      const localNetworkPattern =
        /^http:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.\d+\.\d+\.\d+):(3000|5173)$/;

      if (allowedOrigins.includes(origin) || localNetworkPattern.test(origin)) {
        callback(null, true);
      } else {
        console.log('CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'token',
      'x-verification-token',
      'Cache-Control',
      'Pragma'
    ]
  })
);

// Additional security headers for Google OAuth (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    next();
  });
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Debug middleware - log all requests
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

// Custom middleware for API responses
app.use(successHandler);

// Add timezone information to API responses
app.use(timezoneMiddleware);

// API Routes
app.use('/api', router);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Handle 404 for API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `API endpoint ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Serve debug tool (always available)
app.get('/debug', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend-chat-debug.html'));
});

// Global error handler
app.use(handleError);

module.exports = app;
