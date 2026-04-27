// ============================================================
// db.js — MongoDB Connection Manager
// ============================================================
const { MongoClient } = require('mongodb');

let client;
let db;

async function connect() {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is not set');

  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  await client.connect();
  db = client.db(process.env.DB_NAME || 'travel_lab');
  console.log(`✅ Connected to MongoDB: ${db.databaseName}`);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not connected. Call connect() first.');
  return db;
}

async function close() {
  if (client) await client.close();
}

module.exports = { connect, getDb, close };
