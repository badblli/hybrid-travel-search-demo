const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { destinations, experiences } = require('../data/sample-data');
const {
  generateEmbedding,
  buildEmbeddingText,
  hasEmbeddingProvider,
  getEmbeddingProviderLabel,
} = require('../utils/embeddings');
const { generateHotels } = require('../scripts/generate-hotels-v2');

router.post('/', async (req, res) => {
  const db = getDb();
  let withEmbeddings = req.query.embeddings === 'true' && hasEmbeddingProvider();
  const results = { destinations: 0, hotels: 0, experiences: 0, embeddingsGenerated: false, embeddingProvider: null };
  let embeddingError = null;

  try {
    await db.collection('destinations').drop().catch(() => {});
    const destDocs = [];
    for (const dest of destinations) {
      const doc = { ...dest, type: 'destination', createdAt: new Date() };
      if (withEmbeddings) {
        const embedding = await tryGenerateEmbedding(buildEmbeddingText(doc, 'destination'));
        if (embedding) doc.embedding = embedding;
        await sleep(150);
      }
      destDocs.push(doc);
    }
    await db.collection('destinations').insertMany(destDocs);
    results.destinations = destDocs.length;

    await db.collection('hotels').drop().catch(() => {});
    const hotels = generateHotels();
    const hotelDocs = [];
    for (const hotel of hotels) {
      const doc = { ...hotel, type: 'hotel', createdAt: new Date() };
      if (withEmbeddings) {
        const embedding = await tryGenerateEmbedding(buildEmbeddingText(doc, 'hotel'));
        if (embedding) doc.embedding = embedding;
        await sleep(150);
      }
      hotelDocs.push(doc);
    }
    await db.collection('hotels').insertMany(hotelDocs);
    results.hotels = hotelDocs.length;

    await db.collection('experiences').drop().catch(() => {});
    const expDocs = [];
    for (const exp of experiences) {
      const doc = { ...exp, type: 'experience', createdAt: new Date() };
      if (withEmbeddings) {
        const embedding = await tryGenerateEmbedding(buildEmbeddingText(doc, 'experience'));
        if (embedding) doc.embedding = embedding;
        await sleep(150);
      }
      expDocs.push(doc);
    }
    await db.collection('experiences').insertMany(expDocs);
    results.experiences = expDocs.length;

    await db.collection('destinations').createIndex({ slug: 1 }, { unique: true });
    await db.collection('hotels').createIndex({ slug: 1 }, { unique: true });
    await db.collection('hotels').createIndex({ destinationSlug: 1 });
    await db.collection('hotels').createIndex({ 'beach.isBeachfront': 1, destinationSlug: 1 });
    await db.collection('experiences').createIndex({ destinationSlug: 1 });

    results.embeddingsGenerated = withEmbeddings;
    results.embeddingProvider = withEmbeddings ? getEmbeddingProviderLabel() : null;
    if (embeddingError) results.embeddingError = embeddingError;
    res.json({ success: true, ...results });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ success: false, error: err.message });
  }

  async function tryGenerateEmbedding(text) {
    try {
      return await generateEmbedding(text);
    } catch (err) {
      embeddingError = err.message;
      withEmbeddings = false;
      return undefined;
    }
  }
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

module.exports = router;
