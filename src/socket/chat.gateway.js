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
      // console.log('Socket connected:', socket.id);

      // Handle authentication
      socket.on('authenticate', async (token) => {
        try {
          await this.authenticateSocket(socket, token);
        } catch (error) {
          // console.error('Socket authentication failed:', error.message);
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
        this.handleDisconnect(socket);
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error('Socket error:', error);
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
      console.error('Error joining conversations:', error);
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

      console.log(`User ${socket.userId} left ${conversationIds.length} conversations`);
    } catch (error) {
      console.error('Error leaving conversations:', error);
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
      console.error('Error handling typing:', error);
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
      console.error('Error handling stop typing:', error);
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
      console.error('Error handling disconnect:', error);
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
      console.error('Error emitting new message:', error);
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
      console.error('Error emitting mark as read:', error);
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
      console.error('Error emitting message deleted:', error);
    }
  }

  emitOnlineUsers() {
    try {
      const onlineUserIds = Array.from(this.userSockets.keys());
      this.io.emit('chat:online-users', { userIds: onlineUserIds });
    } catch (error) {
      console.error('Error emitting online users:', error);
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
      console.error('Error sending notification to user:', error);
    }
  }

  // Cleanup method
  cleanup() {
    this.userSockets.clear();
    this.socketUsers.clear();
  }
}

module.exports = ChatGateway;
