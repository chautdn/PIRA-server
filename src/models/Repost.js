const mongoose = require('mongoose');

const repostSchema = new mongoose.Schema(
  {
    // Original Post
    originalPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true
    },

    // User who reposted
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Optional comment when reposting
    comment: {
      type: String,
      trim: true,
      maxlength: 500
    }
  },
  {
    timestamps: true,
    collection: 'reposts'
  }
);

// Compound index to ensure a user can only repost a post once
repostSchema.index({ user: 1, originalPost: 1 }, { unique: true });
repostSchema.index({ originalPost: 1 });
repostSchema.index({ user: 1 });

module.exports = mongoose.model('Repost', repostSchema);
