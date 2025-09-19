const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.DATABASE_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri || typeof uri !== 'string') {
      throw new Error('Missing MongoDB URI. Set DATABASE_URL or MONGODB_URI or MONGO_URI in your environment.');
    }

    await mongoose.connect(uri, {});
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
