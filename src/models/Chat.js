const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    ],
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MasterOrder',
      default: null
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    },
    lastMessageAt: {
      type: Date,
      default: null
    },
    lastReads: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        lastReadAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    // Block functionality
    blockedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    // Soft delete for individual users - array of user IDs who deleted this conversation
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ]
  },
  { timestamps: true }
);

// CRITICAL: Add proper indexes for performance
chatSchema.index({ participants: 1 });
chatSchema.index({ lastMessageAt: -1 });
chatSchema.index({ listingId: 1 });
chatSchema.index({ bookingId: 1 });
chatSchema.index({ 'lastReads.userId': 1 });

// CRITICAL: Add validation
chatSchema.pre('save', function (next) {
  if (this.participants.length !== 2) {
    return next(new Error('Chat must have exactly 2 participants'));
  }

  // Conversations can be general (no listingId/bookingId required)
  // if (!this.listingId && !this.bookingId) {
  //   return next(new Error('Chat must be tied to either a listing or booking'));
  // }

  next();
});

// Helper method to check if user is blocked
chatSchema.methods.isUserBlocked = function (userId) {
  return this.blockedBy.some((blockedUserId) => blockedUserId.toString() === userId.toString());
};

// Helper method to get unread count for user
chatSchema.methods.getUnreadCount = function (userId) {
  const userRead = this.lastReads.find((read) => read.userId.toString() === userId.toString());

  if (!userRead || !this.lastMessageAt) return 0;
  return this.lastMessageAt > userRead.lastReadAt ? 1 : 0;
};

module.exports = mongoose.model('Chat', chatSchema);
