const express = require('express');
const router = express.Router();
const { chatController, chatActionLimiter } = require('../controllers/chat.controller');
const { authMiddleware } = require('../middleware/auth');
const { registerRoute } = require('./register.routes');
const { body, param, validationResult } = require('express-validator');
const responseUtils = require('../utils/response');

// Apply authentication middleware to all chat routes
router.use(authMiddleware.verifyToken);

// Apply rate limiting to all chat actions
router.use(chatActionLimiter);

// Validation middleware
const validateSendMessage = [
  param('conversationId').isMongoId().withMessage('Invalid conversation ID'),
  body('content')
    .optional()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message content must be 1-2000 characters'),
  body('type').optional().isIn(['TEXT', 'IMAGE', 'SYSTEM']).withMessage('Invalid message type'),
  body('media.url')
    .if(body('type').equals('IMAGE'))
    .notEmpty()
    .withMessage('Image messages must have media URL'),
  body('replyTo').optional().isMongoId().withMessage('Invalid reply message ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return responseUtils.validationError(res, errors.array());
    }
    next();
  }
];

const validateCreateConversation = [
  body('targetUserId').isMongoId().withMessage('Invalid target user ID'),
  body('listingId').optional().isMongoId().withMessage('Invalid listing ID'),
  body('bookingId').optional().isMongoId().withMessage('Invalid booking ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return responseUtils.validationError(res, errors.array());
    }
    next();
  }
];

const validateConversationId = [
  param('conversationId').isMongoId().withMessage('Invalid conversation ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return responseUtils.validationError(res, errors.array());
    }
    next();
  }
];

const validateMessageId = [
  param('messageId').isMongoId().withMessage('Invalid message ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return responseUtils.validationError(res, errors.array());
    }
    next();
  }
];

const validateBlockUser = [
  param('conversationId').isMongoId().withMessage('Invalid conversation ID'),
  body('targetUserId').isMongoId().withMessage('Invalid target user ID'),
  body('block').isBoolean().withMessage('Block must be a boolean value'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return responseUtils.validationError(res, errors.array());
    }
    next();
  }
];

// Routes
// GET /api/chat/conversations - Get all conversations
router.get('/conversations', chatController.getConversations);

// GET /api/chat/users - Get users for sidebar
router.get('/users', chatController.getUsersForSidebar);

// POST /api/chat/conversations - Create or get conversation
router.post('/conversations', validateCreateConversation, chatController.createOrGetConversation);

// GET /api/chat/:conversationId/messages - Get messages for conversation
router.get('/:conversationId/messages', validateConversationId, chatController.getMessages);

// POST /api/chat/:conversationId/messages - Send message
router.post('/:conversationId/messages', validateSendMessage, chatController.sendMessage);

// PUT /api/chat/:conversationId/read - Mark messages as read
router.put('/:conversationId/read', validateConversationId, chatController.markAsRead);

// PUT /api/chat/:conversationId/block - Block/unblock user
router.put('/:conversationId/block', validateBlockUser, chatController.toggleBlockUser);

// DELETE /api/chat/messages/:messageId - Delete message
router.delete('/messages/:messageId', validateMessageId, chatController.deleteMessage);

registerRoute('/chat', router);
module.exports = router;

