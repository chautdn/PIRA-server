const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: function () {
        return this.type !== 'SYSTEM';
      }
    },
    type: {
      type: String,
      enum: ['TEXT', 'IMAGE', 'SYSTEM'],
      default: 'TEXT'
    },
    content: {
      type: String,
      maxlength: 2000,
      required: function () {
        return this.type === 'TEXT' || this.type === 'SYSTEM';
      }
    },
    media: {
      url: String,
      width: Number,
      height: Number,
      mime: String,
      size: Number
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    },
    status: {
      type: String,
      enum: ['SENT', 'DELIVERED', 'READ'],
      default: 'SENT'
    },
    // Soft delete fields
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date,
      default: null
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    // System message metadata
    systemData: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  { timestamps: true }
);

// CRITICAL: Add proper indexes
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ isDeleted: 1 });
messageSchema.index({ type: 1 });
messageSchema.index({ replyTo: 1 });

// CRITICAL: Validation middleware
messageSchema.pre('save', function (next) {
  // Validate image messages
  if (this.type === 'IMAGE') {
    if (!this.media || !this.media.url) {
      return next(new Error('Image messages must have media.url'));
    }

    // Validate mime type
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedMimes.includes(this.media.mime)) {
      return next(new Error('Only PNG, JPG, and WebP images are allowed'));
    }

    // Validate file size (5MB max)
    if (this.media.size && this.media.size > 5 * 1024 * 1024) {
      return next(new Error('Image size must be less than 5MB'));
    }
  }

  // Basic profanity filter (simple implementation)
  if (this.content && this.type === 'TEXT') {
    const profanityWords = ['spam', 'scam']; // Add more as needed
    const lowerContent = this.content.toLowerCase();

    for (const word of profanityWords) {
      if (lowerContent.includes(word)) {
        this.content = this.content.replace(new RegExp(word, 'gi'), '***');
      }
    }
  }

  next();
});

// Helper method to check if message is visible to user
messageSchema.methods.isVisibleToUser = function (userId) {
  // Don't show deleted messages
  if (this.isDeleted) return false;

  return true;
};

module.exports = mongoose.model('Message', messageSchema);
