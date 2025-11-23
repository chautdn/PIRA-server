const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.DATABASE_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri || typeof uri !== 'string') {
      throw new Error(
        'Missing MongoDB URI. Set DATABASE_URL or MONGODB_URI or MONGO_URI in your environment.'
      );
    }

    const options = {
      strictPopulate: false,
      retryWrites: true,
      w: 'majority',
      serverSelectionTimeoutMS: 5000
    };

    await mongoose.connect(uri, options);
    console.log('✅ MongoDB connected successfully');
    try {
      const dbName = mongoose.connection.name;
      const hosts = mongoose.connection.host || mongoose.connection.client?.topology?.s?.options?.hosts;
      console.log(`MongoDB DB: ${dbName}`);
      console.log('MongoDB Hosts:', hosts);
    } catch (err) {
      // best-effort logging
    }
  } catch (error) {
    // MongoDB connection failed
    console.error('❌ MongoDB connection error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
