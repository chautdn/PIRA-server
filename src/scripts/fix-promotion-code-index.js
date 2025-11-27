/**
 * Fix Promotion Code Index
 *
 * This script drops the old unique index on the 'code' field
 * and creates a new sparse unique index that allows null values.
 *
 * Run this script once to migrate existing database.
 *
 * Usage: node src/scripts/fix-promotion-code-index.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function fixPromotionCodeIndex() {
  try {
    console.log('🔌 Connecting to MongoDB...');

    const uri = process.env.DATABASE_URL;
    if (!uri) {
      throw new Error('DATABASE_URL not found in environment variables');
    }

    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('promotions');

    console.log('\n📋 Checking existing indexes...');
    const indexes = await collection.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    // Drop the old code index if it exists
    const codeIndexExists = indexes.some((idx) => idx.key && idx.key.code && !idx.sparse);

    if (codeIndexExists) {
      console.log('\n🗑️  Dropping old non-sparse code index...');
      await collection.dropIndex('code_1');
      console.log('✅ Old index dropped');
    } else {
      console.log('\n✅ No old index to drop');
    }

    // Create new sparse unique index
    console.log('\n🔨 Creating new sparse unique index on code...');
    await collection.createIndex(
      { code: 1 },
      {
        unique: true,
        sparse: true,
        name: 'code_1_sparse'
      }
    );
    console.log('✅ New sparse index created');

    console.log('\n📋 Final indexes:');
    const finalIndexes = await collection.indexes();
    console.log(JSON.stringify(finalIndexes, null, 2));

    console.log('\n✅ Migration completed successfully!');
    console.log('📝 System promotions can now be created without codes.');
  } catch (error) {
    console.error('\n❌ Error during migration:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the migration
fixPromotionCodeIndex();
