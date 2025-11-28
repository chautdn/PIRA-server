const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');

class ChatGateway {
  constructor(io) {
    this.io = io;
    this.userSockets = new Map(); // userId -> socketId mapping
    this.socketUsers = new Map(); // socketId -> userId mapping

    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`[ChatGateway] 🔌 New socket connection: ${socket.id}`);
      console.log(`[ChatGateway] Total connected clients: ${this.io.sockets.sockets.size}`);

      // Handle authentication
      socket.on('authenticate', async (token) => {
        try {
          await this.authenticateSocket(socket, token);
        } catch (error) {
          console.error('[ChatGateway] ❌ Authentication failed for socket:', socket.id);
          socket.emit('auth:error', { message: 'Authentication failed' });
          socket.disconnect();
        }
      });

      // Handle joining conversations
      socket.on('chat:join', (data) => {
        this.handleJoinConversations(socket, data);
      });

      // Handle leaving conversations
      socket.on('chat:leave', (data) => {
        this.handleLeaveConversations(socket, data);
      });

      // Handle typing indicators
      socket.on('chat:typing', (data) => {
        this.handleTyping(socket, data);
      });

      socket.on('chat:stop-typing', (data) => {
        this.handleStopTyping(socket, data);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`[ChatGateway] 🔌 Socket disconnected: ${socket.id}`);
        console.log(`[ChatGateway] Remaining connected clients: ${this.io.sockets.sockets.size}`);
        this.handleDisconnect(socket);
      });

      // Handle errors
      socket.on('error', (error) => {
        // Socket error
      });
    });
  }

  async authenticateSocket(socket, token) {
    try {
      if (!token) {
        throw new Error('No token provided');
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      const user = await User.findById(decoded.id).select('_id profile.firstName profile.lastName');

      if (!user) {
        throw new Error('User not found');
      }

      // Store user information
      socket.userId = user._id.toString();
      socket.user = user;

      // Add to mappings
      this.userSockets.set(socket.userId, socket.id);
      this.socketUsers.set(socket.id, socket.userId);

      // Join user to their personal room
      socket.join(`user:${socket.userId}`);

      // Emit online status
      this.emitOnlineUsers();

      // Send authentication success
      socket.emit('auth:success', { user: user });
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  handleJoinConversations(socket, data) {
    try {
      if (!socket.userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { conversationIds } = data;
      if (!Array.isArray(conversationIds)) {
        socket.emit('error', { message: 'Invalid conversation IDs format' });
        return;
      }

      // Join conversation rooms
      conversationIds.forEach((conversationId) => {
        socket.join(`chat:${conversationId}`);
      });
    } catch (error) {
      // Error joining conversations
      socket.emit('error', { message: 'Failed to join conversations' });
    }
  }

  handleLeaveConversations(socket, data) {
    try {
      if (!socket.userId) {
        return;
      }

      const { conversationIds } = data;
      if (!Array.isArray(conversationIds)) {
        return;
      }

      // Leave conversation rooms
      conversationIds.forEach((conversationId) => {
        socket.leave(`chat:${conversationId}`);
      });
    } catch (error) {
      // Error leaving conversations
    }
  }

  handleTyping(socket, data) {
    try {
      if (!socket.userId) {
        return;
      }

      const { conversationId } = data;
      if (!conversationId) {
        return;
      }

      // Emit typing indicator to conversation room (excluding sender)
      socket.to(`chat:${conversationId}`).emit('chat:user-typing', {
        userId: socket.userId,
        conversationId,
        user: socket.user
      });
    } catch (error) {
      // Error handling typing
    }
  }

  handleStopTyping(socket, data) {
    try {
      if (!socket.userId) {
        return;
      }

      const { conversationId } = data;
      if (!conversationId) {
        return;
      }

      // Emit stop typing indicator to conversation room (excluding sender)
      socket.to(`chat:${conversationId}`).emit('chat:user-stop-typing', {
        userId: socket.userId,
        conversationId
      });
    } catch (error) {
      // Error handling stop typing
    }
  }

  handleDisconnect(socket) {
    try {
      const userId = socket.userId;
      if (userId) {
        // Remove from mappings
        this.userSockets.delete(userId);
        this.socketUsers.delete(socket.id);

        // Emit updated online users
        this.emitOnlineUsers();
      }
    } catch (error) {
      // Error handling disconnect
    }
  }

  // Public methods for emitting events from controllers

  emitNewMessage(conversationId, message) {
    try {
      // Emit to all users in the conversation room
      this.io.to(`chat:${conversationId}`).emit('chat:new-message', {
        conversationId,
        message
      });

      // Also emit to each participant's personal room for notifications
      if (message.conversationId && message.conversationId.participants) {
        message.conversationId.participants.forEach((participantId) => {
          this.io.to(`user:${participantId}`).emit('chat:notification', {
            type: 'new-message',
            conversationId,
            message
          });
        });
      }
    } catch (error) {
      // Error emitting new message
    }
  }

  emitMarkAsRead(conversationId, userId) {
    try {
      // Emit to conversation room that messages were read
      this.io.to(`chat:${conversationId}`).emit('chat:marked-as-read', {
        conversationId,
        userId,
        timestamp: new Date()
      });
    } catch (error) {
      // Error emitting mark as read
    }
  }

  emitMessageDeleted(messageId, userId) {
    try {
      // Emit message deletion to all connected sockets
      this.io.emit('chat:message-deleted', {
        messageId,
        deletedBy: userId,
        timestamp: new Date()
      });
    } catch (error) {
      // Error emitting message deleted
    }
  }

  emitOnlineUsers() {
    try {
      const onlineUserIds = Array.from(this.userSockets.keys());
      this.io.emit('chat:online-users', { userIds: onlineUserIds });
    } catch (error) {
      // Error emitting online users
    }
  }

  // Get online status
  isUserOnline(userId) {
    return this.userSockets.has(userId.toString());
  }

  getOnlineUsers() {
    return Array.from(this.userSockets.keys());
  }

  // Send notification to specific user
  sendNotificationToUser(userId, notification) {
    try {
      this.io.to(`user:${userId}`).emit('notification', notification);
    } catch (error) {
      // Error sending notification to user
    }
  }

  // Emit custom event to specific user (generic method)
  emitToUser(userId, eventName, data) {
    try {
      this.io.to(`user:${userId}`).emit(eventName, {
        ...data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`Error emitting ${eventName} to user ${userId}:`, error);
    }
  }

  // WALLET REAL-TIME UPDATES - NEW METHODS

  // Emit wallet balance update to user
  emitWalletUpdate(userId, data) {
    try {
      this.io.to(`user:${userId}`).emit('wallet-updated', {
        ...data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error emitting wallet update:', error);
    }
  }

  // Emit transaction update to user
  emitTransactionUpdate(userId, transactionData) {
    try {
      this.io.to(`user:${userId}`).emit('wallet-transaction-updated', {
        transaction: transactionData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error emitting transaction update:', error);
    }
  }

  // Emit payment status update
  emitPaymentStatusUpdate(userId, paymentData) {
    try {
      this.io.to(`user:${userId}`).emit('wallet-payment-status', {
        payment: paymentData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error emitting payment status update:', error);
    }
  }

  // Broadcast wallet maintenance notifications
  broadcastWalletMaintenance(message, affectedUsers = null) {
    try {
      const notification = {
        type: 'wallet-maintenance',
        message,
        timestamp: new Date().toISOString()
      };

      if (affectedUsers && Array.isArray(affectedUsers)) {
        // Send to specific users
        affectedUsers.forEach((userId) => {
          this.io.to(`user:${userId}`).emit('wallet-maintenance', notification);
        });
      } else {
        // Broadcast to all connected users
        this.io.emit('wallet-maintenance', notification);
      }
    } catch (error) {
      console.error('Error broadcasting wallet maintenance:', error);
    }
  }

  // SYSTEM PROMOTION REAL-TIME UPDATES - NEW METHODS

  // Emit system promotion created to all users
  emitSystemPromotionCreated(promotionData) {
    try {
      const connectedClients = this.io.sockets.sockets.size;
      console.log(
        `[ChatGateway] 📡 Emitting system:promotion:created to ${connectedClients} connected clients`
      );

      this.io.emit('system:promotion:created', {
        promotion: promotionData,
        timestamp: new Date().toISOString()
      });

      console.log('[ChatGateway] ✅ Event emitted successfully');
    } catch (error) {
      console.error('[ChatGateway] ❌ Error emitting system promotion created:', error);
    }
  }

  // Emit system promotion updated to all users
  emitSystemPromotionUpdated(promotionData) {
    try {
      this.io.emit('system:promotion:updated', {
        promotion: promotionData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error emitting system promotion updated:', error);
    }
  }

  // Emit system promotion ended to all users
  emitSystemPromotionEnded(promotionId) {
    try {
      this.io.emit('system:promotion:ended', {
        promotionId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error emitting system promotion ended:', error);
    }
  }

  // Emit promotion notification to specific user
  emitPromotionNotification(userId, notificationData) {
    try {
      this.io.to(`user:${userId}`).emit('notification:promotion', {
        notification: notificationData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error emitting promotion notification:', error);
    }
  }

  // NOTIFICATION REAL-TIME UPDATES - NEW METHODS

  // Emit new notification to user
  emitNotification(userId, notificationData) {
    try {
      console.log(`[ChatGateway] 🔔 Emitting notification to user ${userId}:`, notificationData);
      this.io.to(`user:${userId}`).emit('notification:new', {
        notification: notificationData,
        timestamp: new Date().toISOString()
      });
      console.log(`[ChatGateway] ✅ Notification emitted successfully`);
    } catch (error) {
      console.error('[ChatGateway] ❌ Error emitting notification:', error);
    }
  }

  // Emit notification count update
  emitNotificationCount(userId, count) {
    try {
      console.log(`[ChatGateway] 🔢 Emitting notification count ${count} to user ${userId}`);
      this.io.to(`user:${userId}`).emit('notification:count', {
        unreadCount: count,
        timestamp: new Date().toISOString()
      });
      console.log(`[ChatGateway] ✅ Notification count emitted successfully`);
    } catch (error) {
      console.error('[ChatGateway] ❌ Error emitting notification count:', error);
    }
  }

  // Cleanup method
  cleanup() {
    this.userSockets.clear();
    this.socketUsers.clear();
  }
}

module.exports = ChatGateway;
