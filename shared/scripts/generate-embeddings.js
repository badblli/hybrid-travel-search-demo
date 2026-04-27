const { MongoClient } = require('mongodb');
require('dotenv').config();
const { generateEmbedding, buildEmbeddingText } = require('../utils/embeddings');

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'travel_lab';

if (!uri) {
  throw new Error('MONGODB_URI is not set');
}

async function processCollection(db, collectionName, type) {
  const coll = db.collection(collectionName);

  const total = await coll.countDocuments({});
  console.log(`\n[${collectionName}] total docs: ${total}`);

  const docs = await coll.find({}).toArray();
  console.log(`[${collectionName}] docs to inspect: ${docs.length}`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of docs) {
    try {
      if (Array.isArray(doc.embedding) && doc.embedding.length > 0) {
        skipped++;
        console.log(`Skipping ${collectionName}/${doc._id} - embedding already exists`);
        continue;
      }

      const text = buildEmbeddingText(doc, type);

      if (!text || !text.trim()) {
        skipped++;
        console.log(`Skipping ${collectionName}/${doc._id} - no text`);
        continue;
      }

      const embedding = await generateEmbedding(text);

      await coll.updateOne(
        { _id: doc._id },
        { $set: { embedding } }
      );

      success++;
      console.log(`Updated ${collectionName}/${doc._id} (${embedding.length} dims)`);
    } catch (err) {
      failed++;
      console.error(`Failed ${collectionName}/${doc._id}: ${err.message}`);
    }
  }

  console.log(`[${collectionName}] done - success=${success}, skipped=${skipped}, failed=${failed}`);
}

async function main() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);

    await processCollection(db, 'destinations', 'destination');
    await processCollection(db, 'hotels', 'hotel');
    await processCollection(db, 'experiences', 'experience');

    console.log('\nAll embeddings generated.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
