// ============================================================
// routes/v3-hybrid.js
// VERSION 3: Hybrid Search (Atlas Search + Vector Search + RRF)
//
// ✅ What this adds over V2:
//   - Vector Search for semantic understanding
//   - "romantik tatil yeri" finds beach/balloon destinations
//   - Reciprocal Rank Fusion (RRF) combines both result sets
//   - Better handling of conceptual/intent-based queries
//
// 📋 Required:
//   - Atlas Search index "destinations_search" (same as V2)
//   - Atlas Vector Search index "destinations_vector"
//   - See /indexes/destinations_vector.json
//   - OPENAI_API_KEY for query embedding
// ============================================================
const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { generateEmbedding, hasOpenAI } = require('../utils/embeddings');

// RRF constant (standard: 60)
const RRF_K = 60;

/**
 * POST /api/v3/search
 */
router.post('/search', async (req, res) => {
  const db = getDb();
  const { query = '', collection = 'destinations', filters = {}, alpha = 0.5 } = req.body;
  // alpha: 0 = pure vector, 1 = pure text, 0.5 = balanced
  const startTime = Date.now();

  if (!hasOpenAI) {
    return res.status(503).json({
      error: 'Hybrid Search requires OPENAI_API_KEY for query embedding.',
      fallback: 'Using Atlas Search only (v2) instead.',
    });
  }

  try {
    // ─── Step 1: Generate query embedding ─────────────────────
    const queryVector = await generateEmbedding(query);

    // ─── Step 2: Text search pipeline (Atlas Search) ──────────
    const textPipeline = buildTextPipeline(query, filters, collection);

    // ─── Step 3: Vector search pipeline ($vectorSearch) ───────
    const vectorPipeline = buildVectorPipeline(queryVector, filters, collection);

    // Run both searches in parallel
    const [textResults, vectorResults] = await Promise.all([
      db.collection(collection).aggregate(textPipeline).toArray(),
      db.collection(collection).aggregate(vectorPipeline).toArray(),
    ]);

    // ─── Step 4: Reciprocal Rank Fusion (RRF) ─────────────────
    // Each document gets: score = 1/(rank + k) for each list it appears in
    const rrfScores = {};
    const docMap = {};

    textResults.forEach((doc, rank) => {
      const id = doc._id.toString();
      docMap[id] = doc;
      rrfScores[id] = (rrfScores[id] || 0) + (alpha * 1) / (rank + RRF_K);
      doc._textRank = rank + 1;
      doc._textScore = doc.score;
    });

    vectorResults.forEach((doc, rank) => {
      const id = doc._id.toString();
      docMap[id] = { ...docMap[id], ...doc };
      rrfScores[id] = (rrfScores[id] || 0) + ((1 - alpha) * 1) / (rank + RRF_K);
      docMap[id]._vectorRank = rank + 1;
      docMap[id]._vectorScore = doc.vectorScore;
    });

    // Sort by RRF score
    const merged = Object.entries(rrfScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([id, rrfScore]) => ({
        ...docMap[id],
        _collection: collection,
        _rrfScore: rrfScore,
        score: rrfScore,
      }));

    const elapsed = Date.now() - startTime;

    res.json({
      results: merged,
      meta: {
        version: 'v3-hybrid',
        query,
        count: merged.length,
        elapsed,
        alpha,
        pipeline: {
          textPipeline,
          vectorPipeline: '[truncated — vector array omitted for readability]',
          fusion: 'Reciprocal Rank Fusion (RRF k=60)',
        },
        breakdown: {
          textResultCount: textResults.length,
          vectorResultCount: vectorResults.length,
          mergedCount: merged.length,
        },
        notes: [
          '✅ Semantic understanding: "deniz" finds beach destinations',
          '✅ "çocuklar için eğlenceli" matches family-friendly places',
          '✅ RRF combines text + vector rankings without score normalization',
          '✅ Alpha parameter controls text vs vector weight',
          `⚙️  Current alpha: ${alpha} (0=vector only, 1=text only, 0.5=balanced)`,
        ],
      },
    });
  } catch (err) {
    console.error('v3 hybrid error:', err.message);
    const isIndexMissing = err.message?.includes('index') || err.code === 40324;
    res.status(500).json({
      error: err.message,
      hint: isIndexMissing ? 'Vector Search index not found. Create "destinations_vector" in Atlas.' : null,
    });
  }
});

// ─── Pipeline Builders ───────────────────────────────────────

function buildTextPipeline(query, filters, collection) {
  const indexName = `${collection}_search`;
  const filterClauses = buildFilterClauses(filters, collection);

  return [
    {
      $search: {
        index: indexName,
        compound: {
          should: [
            { text: { query, path: 'name', fuzzy: { maxEdits: 1 }, score: { boost: { value: 3 } } } },
            { text: { query, path: 'description', fuzzy: { maxEdits: 1 } } },
            { text: { query, path: 'tags', score: { boost: { value: 2 } } } },
          ],
          minimumShouldMatch: 1,
          ...(filterClauses.length > 0 ? { filter: filterClauses } : {}),
        },
      },
    },
    { $addFields: { score: { $meta: 'searchScore' } } },
    { $limit: 20 },
    { $project: { embedding: 0 } },
  ];
}

function buildVectorPipeline(queryVector, filters, collection) {
  const indexName = `${collection}_vector`;

  // Build $vectorSearch filter (pre-filter for performance)
  const preFilter = buildPreFilter(filters, collection);

  return [
    {
      $vectorSearch: {
        index: indexName,
        path: 'embedding',
        queryVector,
        numCandidates: 100,
        limit: 20,
        ...(preFilter ? { filter: preFilter } : {}),
      },
    },
    {
      $addFields: {
        vectorScore: { $meta: 'vectorSearchScore' },
      },
    },
    { $project: { embedding: 0 } },
  ];
}

function buildFilterClauses(filters, collection) {
  const clauses = [];
  if (filters.category) clauses.push({ equals: { path: 'category', value: filters.category } });
  if (filters.region && collection === 'destinations') clauses.push({ equals: { path: 'region', value: filters.region } });
  if (filters.minRating) clauses.push({ range: { path: 'rating', gte: parseFloat(filters.minRating) } });
  if (filters.maxPrice) {
    const pricePath = collection === 'hotels' ? 'pricePerNight' : 'price';
    clauses.push({ range: { path: pricePath, lte: parseInt(filters.maxPrice) } });
  }
  return clauses;
}

function buildPreFilter(filters, collection) {
  // $vectorSearch uses MQL-style pre-filters
  const conditions = {};
  if (filters.category) conditions.category = { $eq: filters.category };
  if (filters.region && collection === 'destinations') conditions.region = { $eq: filters.region };
  if (filters.minRating) conditions.rating = { $gte: parseFloat(filters.minRating) };
  return Object.keys(conditions).length > 0 ? conditions : null;
}

/**
 * GET /api/v3/autocomplete — same as v2 (Atlas Search)
 */
router.get('/autocomplete', async (req, res) => {
  const db = getDb();
  const { q = '', collection = 'destinations' } = req.query;
  if (!q || q.length < 2) return res.json([]);

  try {
    const pipeline = [
      {
        $search: {
          index: `${collection}_search`,
          autocomplete: { query: q, path: 'name', fuzzy: { maxEdits: 1 } },
        },
      },
      { $limit: 6 },
      { $project: { name: 1, city: 1, category: 1, rating: 1 } },
    ];
    const results = await db.collection(collection).aggregate(pipeline).toArray();
    res.json(results.map((r) => ({ label: r.name, sublabel: `${r.city} · ${r.category}`, type: collection })));
  } catch {
    res.json([]);
  }
});

module.exports = router;
