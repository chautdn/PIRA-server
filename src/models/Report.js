const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reportType: {
      type: String,
      enum: ['SPAM', 'INAPPROPRIATE', 'HARASSMENT', 'OTHER'],
      required: true
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000
    },
    reportedItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED'],
      default: 'PENDING'
    },
    adminNotes: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    deletedAt: Date
  },
  {
    timestamps: true,
    collection: 'reports'
  }
);
module.exports = mongoose.model('Report', reportSchema);
