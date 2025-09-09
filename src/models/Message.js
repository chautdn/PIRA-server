const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Message Content
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },

    // Message Type
    type: {
      type: String,
      enum: ['TEXT', 'IMAGE', 'FILE', 'SYSTEM', 'ORDER_UPDATE'],
      default: 'TEXT'
    },

    // Attachments
    attachments: [
      {
        type: {
          type: String,
          enum: ['IMAGE', 'FILE', 'DOCUMENT']
        },
        url: String,
        filename: String,
        size: Number,
        mimeType: String
      }
    ],

    // Message Status
    status: {
      type: String,
      enum: ['SENT', 'DELIVERED', 'READ'],
      default: 'SENT'
    },

    // Read Receipts
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        readAt: Date
      }
    ],

    // Reply/Thread
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },

    // Editing
    edited: {
      isEdited: {
        type: Boolean,
        default: false
      },
      editedAt: Date,
      originalContent: String
    },

    // System Message Data
    systemData: mongoose.Schema.Types.Mixed
  },
  {
    timestamps: true,
    collection: 'messages'
  }
);

messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });

module.exports = mongoose.model('Message', messageSchema);
