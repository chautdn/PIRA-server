const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

const chatService = {
  // Get all conversations for a user
  getConversations: async (userId, cursor = null, limit = 50) => {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const query = {
        participants: userId,
        lastMessageAt: { $ne: null } // Only show chats with messages
      };

      if (cursor) {
        query.lastMessageAt = { $lt: new Date(cursor) };
      }

      const conversations = await Chat.find(query)
        .populate('participants', 'profile.firstName profile.lastName profile.avatar')
        .populate('listingId', 'title images.url price')
        .populate('bookingId', 'status totalAmount')
        .populate({
          path: 'lastMessage',
          select: 'content type createdAt senderId',
          populate: {
            path: 'senderId',
            select: 'profile.firstName profile.lastName'
          }
        })
        .sort({ lastMessageAt: -1 })
        .limit(limit);

      // Add unread count for each conversation
      const conversationsWithUnread = conversations.map((conv) => {
        const convObj = conv.toObject();
        convObj.unreadCount = conv.getUnreadCount(userId);
        return convObj;
      });

      return conversationsWithUnread;
    } catch (error) {
      throw new Error(`Failed to get conversations: ${error.message}`);
    }
  },

  // Get messages for a specific conversation
  getMessages: async (conversationId, userId, cursor = null, limit = 50) => {
    try {
      if (!conversationId || !userId) {
        throw new Error('Conversation ID and User ID are required');
      }

      // Check if user is participant in the conversation
      const conversation = await Chat.findById(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      if (!conversation.participants.includes(userId)) {
        throw new Error('Access denied');
      }

      // Check if user is blocked
      if (conversation.isUserBlocked(userId)) {
        throw new Error('Access denied - user is blocked');
      }

      const query = {
        conversationId,
        isDeleted: false
      };

      if (cursor) {
        query.createdAt = { $lt: new Date(cursor) };
      }

      const messages = await Message.find(query)
        .populate('senderId', 'profile.firstName profile.lastName profile.avatar')
        .populate({
          path: 'replyTo',
          select: 'content type senderId',
          populate: {
            path: 'senderId',
            select: 'profile.firstName profile.lastName'
          }
        })
        .sort({ createdAt: -1 })
        .limit(limit);

      return messages.reverse(); // Return in chronological order
    } catch (error) {
      throw new Error(`Failed to get messages: ${error.message}`);
    }
  },

  // Send a new message
  sendMessage: async (messageData) => {
    try {
      const { conversationId, senderId, content, type = 'TEXT', media, replyTo } = messageData;

      if (!conversationId || !senderId) {
        throw new Error('Conversation ID and Sender ID are required');
      }

      // Verify conversation exists and user is participant
      const conversation = await Chat.findById(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      if (!conversation.participants.includes(senderId)) {
        throw new Error('Access denied');
      }

      // Check if user is blocked
      if (conversation.isUserBlocked(senderId)) {
        throw new Error('Access denied - user is blocked');
      }

      // Validate message content
      if (type === 'TEXT' && (!content || content.trim().length === 0)) {
        throw new Error('Text messages must have content');
      }

      if (type === 'IMAGE' && (!media || !media.url)) {
        throw new Error('Image messages must have media URL');
      }

      // Create the message
      const message = new Message({
        conversationId,
        senderId,
        type,
        content: content ? content.trim() : undefined,
        media,
        replyTo
      });

      await message.save();

      // Update conversation's last message and timestamp
      conversation.lastMessage = message._id;
      conversation.lastMessageAt = message.createdAt;
      await conversation.save();

      // Populate message data for response
      await message.populate('senderId', 'profile.firstName profile.lastName profile.avatar');
      if (replyTo) {
        await message.populate({
          path: 'replyTo',
          select: 'content type senderId',
          populate: {
            path: 'senderId',
            select: 'profile.firstName profile.lastName'
          }
        });
      }

      return message;
    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  },

  // Create or get existing conversation
  createOrGetConversation: async (userId, targetUserId, listingId = null, bookingId = null) => {
    try {
      if (!userId || !targetUserId) {
        throw new Error('User ID and Target User ID are required');
      }

      if (userId === targetUserId) {
        throw new Error('Cannot create conversation with yourself');
      }

      // Check if conversation already exists
      let conversation = await Chat.findOne({
        participants: { $all: [userId, targetUserId] },
        $or: [
          { listingId },
          { bookingId },
          { listingId: null, bookingId: null } // General chat
        ]
      });

      if (conversation) {
        await conversation.populate(
          'participants',
          'profile.firstName profile.lastName profile.avatar'
        );
        await conversation.populate('listingId', 'title images.url price');
        await conversation.populate('bookingId', 'status totalAmount');
        return conversation;
      }

      // Create new conversation
      conversation = new Chat({
        participants: [userId, targetUserId],
        listingId,
        bookingId,
        lastReads: [
          { userId, lastReadAt: new Date() },
          { userId: targetUserId, lastReadAt: new Date() }
        ]
      });

      await conversation.save();
      await conversation.populate(
        'participants',
        'profile.firstName profile.lastName profile.avatar'
      );
      await conversation.populate('listingId', 'title images.url price');
      await conversation.populate('bookingId', 'status totalAmount');

      return conversation;
    } catch (error) {
      throw new Error(`Failed to create conversation: ${error.message}`);
    }
  },

  // Mark messages as read
  markAsRead: async (conversationId, userId) => {
    try {
      if (!conversationId || !userId) {
        throw new Error('Conversation ID and User ID are required');
      }

      const conversation = await Chat.findById(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      if (!conversation.participants.includes(userId)) {
        throw new Error('Access denied');
      }

      // Update user's last read timestamp
      const userReadIndex = conversation.lastReads.findIndex(
        (read) => read.userId.toString() === userId.toString()
      );

      if (userReadIndex !== -1) {
        conversation.lastReads[userReadIndex].lastReadAt = new Date();
      } else {
        conversation.lastReads.push({
          userId,
          lastReadAt: new Date()
        });
      }

      await conversation.save();
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to mark as read: ${error.message}`);
    }
  },

  // Block/unblock user in conversation
  toggleBlockUser: async (conversationId, userId, targetUserId, block = true) => {
    try {
      if (!conversationId || !userId || !targetUserId) {
        throw new Error('Conversation ID, User ID, and Target User ID are required');
      }

      const conversation = await Chat.findById(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      if (
        !conversation.participants.includes(userId) ||
        !conversation.participants.includes(targetUserId)
      ) {
        throw new Error('Access denied');
      }

      if (block) {
        // Add to blocked list if not already blocked
        if (!conversation.blockedBy.includes(userId)) {
          conversation.blockedBy.push(userId);
        }
      } else {
        // Remove from blocked list
        conversation.blockedBy = conversation.blockedBy.filter(
          (blockedUserId) => blockedUserId.toString() !== userId.toString()
        );
      }

      await conversation.save();
      return { success: true, blocked: block };
    } catch (error) {
      throw new Error(`Failed to ${block ? 'block' : 'unblock'} user: ${error.message}`);
    }
  },

  // Get users for sidebar (users with existing conversations)
  getUsersForSidebar: async (userId) => {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      // Get all conversations for the user
      const conversations = await Chat.find({
        participants: userId,
        lastMessageAt: { $ne: null }
      })
        .populate('participants', 'profile.firstName profile.lastName profile.avatar _id')
        .sort({ lastMessageAt: -1 });

      // Extract other participants (not the current user)
      const users = conversations
        .map((conv) => {
          const otherParticipant = conv.participants.find(
            (participant) => participant._id.toString() !== userId.toString()
          );
          return otherParticipant;
        })
        .filter((user, index, self) => {
          // Remove duplicates
          return index === self.findIndex((u) => u._id.toString() === user._id.toString());
        });

      return users;
    } catch (error) {
      throw new Error(`Failed to get users for sidebar: ${error.message}`);
    }
  },

  // Delete a message (soft delete)
  deleteMessage: async (messageId, userId) => {
    try {
      if (!messageId || !userId) {
        throw new Error('Message ID and User ID are required');
      }

      const message = await Message.findById(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Only sender can delete their own messages
      if (message.senderId.toString() !== userId.toString()) {
        throw new Error('Access denied - can only delete your own messages');
      }

      // Soft delete
      message.isDeleted = true;
      message.deletedAt = new Date();
      message.deletedBy = userId;
      await message.save();

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete message: ${error.message}`);
    }
  }
};

module.exports = chatService;

