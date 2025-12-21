const Notification = require('../models/Notification');
const { NotFoundError } = require('../core/error');

// Get io instance from app
let io;
const setSocketIO = (socketIO) => {
  io = socketIO;
};

const notificationService = {
  // Create a notification
  createNotification: async (notificationData) => {
    try {
      const notification = new Notification(notificationData);
      await notification.save();
      return notification;
    } catch (error) {
      throw error;
    }
  },

  // Get user notifications with pagination
  getUserNotifications: async (userId, options = {}) => {
    const { page = 1, limit = 20, status, type } = options;

    const query = { recipient: userId };
    if (status) query.status = status;
    if (type) query.type = type;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .populate('relatedWithdrawal', 'amount status')
      .lean();

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      status: { $in: ['PENDING', 'SENT', 'DELIVERED'] }
    });

    return {
      notifications,
      unreadCount,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    };
  },

  // Mark notification as read
  markAsRead: async (notificationId, userId) => {
    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: userId
    });

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    if (notification.status !== 'READ') {
      notification.status = 'READ';
      notification.readAt = new Date();
      await notification.save();
    }

    return notification;
  },

  // Mark all notifications as read
  markAllAsRead: async (userId) => {
    const result = await Notification.updateMany(
      {
        recipient: userId,
        status: { $in: ['PENDING', 'SENT', 'DELIVERED'] }
      },
      {
        $set: {
          status: 'READ',
          readAt: new Date()
        }
      }
    );

    return result;
  },

  // Delete notification
  deleteNotification: async (notificationId, userId) => {
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: userId
    });

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    return notification;
  },

  // Get unread count
  getUnreadCount: async (userId) => {
    console.log('🔢 [Notification Service] Counting unread notifications for user:', userId);
    
    const count = await Notification.countDocuments({
      recipient: userId,
      status: { $in: ['PENDING', 'SENT', 'DELIVERED'] }
    });

    console.log('🔢 [Notification Service] Found', count, 'unread notifications');
    console.log('🔢 [Notification Service] Query:', { recipient: userId, status: { $in: ['PENDING', 'SENT', 'DELIVERED'] } });

    return count;
  }
};

/**
 * Send notification to user (both push and in-app)
 * @param {string|ObjectId} recipientId - User ID to send notification to
 * @param {string} title - Notification title
 * @param {string} body - Notification body/message
 * @param {object} options - Additional options
 * @param {string} options.type - Notification type (ORDER, PAYMENT, etc)
 * @param {string} options.category - Category (INFO, SUCCESS, WARNING, ERROR)
 * @param {ObjectId} options.relatedExtension - Related extension ID
 * @param {object} options.data - Additional metadata
 */
const sendNotification = async (recipientId, title, body, options = {}) => {
  try {
    const {
      type = 'SYSTEM',
      category = 'INFO',
      relatedExtension = null,
      relatedReview = null,
      relatedProduct = null,
      actions = [],
      data = {}
    } = options;

    // Create in-app notification
    const notification = new Notification({
      recipient: recipientId,
      title,
      message: body,
      type,
      category,
      relatedExtension,
      relatedReview,
      relatedProduct,
      actions,
      data,
      status: 'DELIVERED'
    });

    await notification.save();

    console.log('✅ Notification created:', {
      recipientId,
      notificationId: notification._id,
      type,
      title
    });

    // Emit socket event to user if io is available
    if (io) {
      // Use 'user:' prefix to match ChatGateway room naming
      io.to(`user:${recipientId}`).emit('notification:new', {
        notification: {
          _id: notification._id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          category: notification.category,
          status: notification.status,
          createdAt: notification.createdAt,
          actions: notification.actions,
          data: notification.data
        }
      });
      
      console.log('📡 Socket event emitted: notification:new to user:' + recipientId);

      // Also emit updated notification count
      const unreadCount = await Notification.countDocuments({
        recipient: recipientId,
        status: { $in: ['PENDING', 'SENT', 'DELIVERED'] }
      });

      io.to(`user:${recipientId}`).emit('notification:count', {
        unreadCount
      });

      console.log('📡 Socket event emitted: notification:count (' + unreadCount + ') to user:' + recipientId);
    }

    return notification;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    // Don't throw - notifications are not critical
    return null;
  }
};

module.exports = notificationService;
module.exports.sendNotification = sendNotification;
module.exports.setSocketIO = setSocketIO;
