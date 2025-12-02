const Notification = require('../models/Notification');
const { NotFoundError } = require('../core/error');

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

module.exports = notificationService;
