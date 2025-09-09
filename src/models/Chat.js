const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    // Participants
    participants: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        joinedAt: {
          type: Date,
          default: Date.now
        },
        lastReadAt: Date
      }
    ],

    // Chat Type
    type: {
      type: String,
      enum: ['DIRECT', 'ORDER_CHAT', 'SUPPORT'],
      default: 'DIRECT'
    },

    // Related Entities
    relatedOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    relatedProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },

    // Chat Info
    title: String,

    // Last Message
    lastMessage: {
      content: String,
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      timestamp: Date,
      type: {
        type: String,
        enum: ['TEXT', 'IMAGE', 'FILE', 'SYSTEM']
      }
    },

    // Status
    status: {
      type: String,
      enum: ['ACTIVE', 'ARCHIVED', 'BLOCKED'],
      default: 'ACTIVE'
    },

    // Settings
    settings: {
      muteNotifications: {
        type: Boolean,
        default: false
      }
    }
  },
  {
    timestamps: true,
    collection: 'chats'
  }
);

chatSchema.index({ participants: 1 });
chatSchema.index({ relatedOrder: 1 });
chatSchema.index({ type: 1, status: 1 });

module.exports = mongoose.model('Chat', chatSchema);
