const notificationService = require('../services/notification.service');
const { SUCCESS } = require('../core/success');

const notificationController = {
  // Get user notifications
  getUserNotifications: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        status: req.query.status,
        type: req.query.type
      };

      const result = await notificationService.getUserNotifications(userId, options);

      new SUCCESS({
        message: 'Notifications retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Mark notification as read
  markAsRead: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { id } = req.params;

      const notification = await notificationService.markAsRead(id, userId);

      new SUCCESS({
        message: 'Notification marked as read',
        metadata: { notification }
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Mark all as read
  markAllAsRead: async (req, res, next) => {
    try {
      const userId = req.user._id;

      const result = await notificationService.markAllAsRead(userId);

      new SUCCESS({
        message: 'All notifications marked as read',
        metadata: { modifiedCount: result.modifiedCount }
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Delete notification
  deleteNotification: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { id } = req.params;

      await notificationService.deleteNotification(id, userId);

      new SUCCESS({
        message: 'Notification deleted successfully'
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Get unread count
  getUnreadCount: async (req, res, next) => {
    try {
      const userId = req.user._id;
      console.log('🔔 [Notification Controller] Getting unread count for user:', userId);

      const count = await notificationService.getUnreadCount(userId);
      console.log('🔔 [Notification Controller] Unread count:', count);

      new SUCCESS({
        message: 'Unread count retrieved',
        metadata: { unreadCount: count }
      }).send(res);
    } catch (error) {
      console.error('❌ [Notification Controller] Error getting unread count:', error);
      next(error);
    }
  }
};

module.exports = notificationController;
