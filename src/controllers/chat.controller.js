const chatService = require('../services/chat.service');
const responseUtils = require('../utils/response');
const rateLimit = require('express-rate-limit');

// Rate limiting for chat actions
const chatActionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 actions per minute
  message: { error: 'Too many chat actions. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.user // Only apply to authenticated users
});

const chatController = {
  // Get all conversations for the authenticated user
  getConversations: async (req, res) => {
    try {
      const userId = req.user._id;
      const { cursor, limit = 50 } = req.query;

      const conversations = await chatService.getConversations(userId, cursor, parseInt(limit));
      responseUtils.success(res, conversations, 'Conversations retrieved successfully');
    } catch (error) {
      responseUtils.error(res, error.message, 400);
    }
  },

  // Get messages for a specific conversation
  getMessages: async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id;
      const { cursor, limit = 50 } = req.query;

      const messages = await chatService.getMessages(
        conversationId,
        userId,
        cursor,
        parseInt(limit)
      );
      responseUtils.success(res, messages, 'Messages retrieved successfully');
    } catch (error) {
      responseUtils.error(res, error.message, error.message.includes('Access denied') ? 403 : 400);
    }
  },

  // Send a new message
  sendMessage: async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id;
      const { content, type = 'TEXT', media, replyTo } = req.body;

      const messageData = {
        conversationId,
        senderId: userId,
        content,
        type,
        media,
        replyTo
      };

      const message = await chatService.sendMessage(messageData);

      // Emit real-time event if socket gateway is available
      if (global.chatGateway) {
        global.chatGateway.emitNewMessage(conversationId, message);
      }

      responseUtils.success(res, message, 'Message sent successfully', 201);
    } catch (error) {
      responseUtils.error(res, error.message, error.message.includes('Access denied') ? 403 : 400);
    }
  },

  // Create or get existing conversation
  createOrGetConversation: async (req, res) => {
    try {
      const userId = req.user._id;
      const { targetUserId, listingId = null, bookingId = null } = req.body;

      // Validate ObjectIds
      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        throw new Error(`Invalid targetUserId: ${targetUserId}`);
      }
      if (listingId && !mongoose.Types.ObjectId.isValid(listingId)) {
        throw new Error(`Invalid listingId: ${listingId}`);
      }
      if (bookingId && !mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new Error(`Invalid bookingId: ${bookingId}`);
      }

      const conversation = await chatService.createOrGetConversation(
        userId,
        targetUserId,
        listingId,
        bookingId
      );

      responseUtils.success(res, conversation, 'Conversation created/retrieved successfully');
    } catch (error) {
      // Error creating conversation
      responseUtils.error(res, error.message, 400);
    }
  },

  // Find existing conversation without creating
  findExistingConversation: async (req, res) => {
    try {
      const userId = req.user._id;
      const { targetUserId, listingId = null } = req.query;

      if (!targetUserId) {
        return responseUtils.error(res, 'Target user ID is required', 400);
      }

      const conversation = await chatService.findExistingConversation(
        userId,
        targetUserId,
        listingId
      );

      if (!conversation) {
        return responseUtils.error(res, 'Conversation not found', 404);
      }

      responseUtils.success(res, conversation, 'Conversation found');
    } catch (error) {
      responseUtils.error(res, error.message, 500);
    }
  },

  // Mark messages as read
  markAsRead: async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id;

      const result = await chatService.markAsRead(conversationId, userId);

      // Emit real-time event if socket gateway is available
      if (global.chatGateway) {
        global.chatGateway.emitMarkAsRead(conversationId, userId);
      }

      responseUtils.success(res, result, 'Messages marked as read');
    } catch (error) {
      responseUtils.error(res, error.message, error.message.includes('Access denied') ? 403 : 400);
    }
  },

  // Block/unblock user
  toggleBlockUser: async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id;
      const { targetUserId, block = true } = req.body;

      const result = await chatService.toggleBlockUser(conversationId, userId, targetUserId, block);
      responseUtils.success(res, result, `User ${block ? 'blocked' : 'unblocked'} successfully`);
    } catch (error) {
      responseUtils.error(res, error.message, error.message.includes('Access denied') ? 403 : 400);
    }
  },

  // Get users for sidebar
  getUsersForSidebar: async (req, res) => {
    try {
      const userId = req.user._id;

      const users = await chatService.getUsersForSidebar(userId);
      responseUtils.success(res, users, 'Users retrieved successfully');
    } catch (error) {
      responseUtils.error(res, error.message, 400);
    }
  },

  // Delete a message
  deleteMessage: async (req, res) => {
    try {
      const { messageId } = req.params;
      const userId = req.user._id;

      const result = await chatService.deleteMessage(messageId, userId);

      // Emit real-time event if socket gateway is available
      if (global.chatGateway) {
        global.chatGateway.emitMessageDeleted(messageId, userId);
      }

      responseUtils.success(res, result, 'Message deleted successfully');
    } catch (error) {
      responseUtils.error(res, error.message, error.message.includes('Access denied') ? 403 : 400);
    }
  }
};

module.exports = { chatController, chatActionLimiter };
