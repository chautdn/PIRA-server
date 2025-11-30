const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.DATABASE_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri || typeof uri !== 'string') {
      throw new Error(
        'Missing MongoDB URI. Set DATABASE_URL or MONGODB_URI or MONGO_URI in your environment.'
      );
    }

    // Optionally override DB name using DB_NAME env var. This is useful when the
    // provided connection string points to the cluster but not a specific database
    // (or you want to switch DBs without changing the full URI).
    const dbName = process.env.DB_NAME || process.env.MONGO_DB_NAME || 'PIRA_System';

    // If the URI already contains a path/database name (e.g. mongodb+srv://host/DBNAME),
    // mongoose will use that. Passing { dbName } forces the connection to use the
    // specified database regardless.
    await mongoose.connect(uri, { dbName });
    console.log(`✅ MongoDB connected successfully (db: ${dbName})`);
  } catch (error) {
    // MongoDB connection failed
    console.error('❌ MongoDB connection error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
