// ============================================================
// routes/v1-traditional.js
// VERSION 1: Traditional MongoDB Search (regex / $or / find)
//
// ❌ Problems this demonstrates:
//   - Exact string matching only (no fuzzy, no typo tolerance)
//   - No relevance ranking — results come in insertion order
//   - Slow at scale (full collection scans with $regex)
//   - No semantic understanding ("deniz" won't find "plaj")
// ============================================================
const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

/**
 * POST /api/v1/search
 * Body: { query, collection?, filters? }
 * collection: 'destinations' | 'hotels' | 'experiences' | 'all'
 */
router.post('/search', async (req, res) => {
  const db = getDb();
  const { query = '', collection = 'destinations', filters = {} } = req.body;
  const startTime = Date.now();

  // ─── THE TRADITIONAL QUERY ────────────────────────────────
  // Simple case-insensitive regex across text fields
  const regexQuery = { $regex: query, $options: 'i' };

  const mongoFilter = {
    $or: [
      { name: regexQuery },
      { description: regexQuery },
      { tags: regexQuery },
      { city: regexQuery },
      { region: regexQuery },
      { category: regexQuery },
    ],
  };

  // Apply optional hard filters
  if (filters.category) mongoFilter.category = filters.category;
  if (filters.region) mongoFilter.region = filters.region;
  if (filters.minRating) mongoFilter.rating = { $gte: parseFloat(filters.minRating) };

  // ─── The actual pipeline (shown in UI for education) ──────
  const queryPipeline = {
    type: 'find',
    filter: mongoFilter,
    options: { sort: { rating: -1 }, limit: 12 },
  };

  try {
    let results = [];

    if (collection === 'all' || collection === 'destinations') {
      const dest = await db
        .collection('destinations')
        .find(query ? mongoFilter : filters.category ? { category: filters.category } : {})
        .sort({ rating: -1 })
        .limit(12)
        .toArray();
      results = results.concat(dest.map((d) => ({ ...d, _collection: 'destinations' })));
    }

    if (collection === 'hotels') {
      const buildHotelFilter = () => {
        const f = { $or: [{ name: regexQuery }, { description: regexQuery }, { tags: regexQuery }, { city: regexQuery }, { category: regexQuery }] };
        if (filters.maxPrice) f.pricePerNight = { $lte: parseInt(filters.maxPrice) };
        if (filters.minRating) f.rating = { $gte: parseFloat(filters.minRating) };
        return query ? f : {};
      };
      const hResults = await db.collection('hotels').find(buildHotelFilter()).sort({ rating: -1 }).limit(12).toArray();
      results = hResults.map((h) => ({ ...h, _collection: 'hotels' }));
    }

    if (collection === 'experiences') {
      const expFilter = query
        ? { $or: [{ name: regexQuery }, { description: regexQuery }, { tags: regexQuery }, { category: regexQuery }] }
        : {};
      if (filters.maxPrice) expFilter.price = { $lte: parseInt(filters.maxPrice) };
      const eResults = await db.collection('experiences').find(expFilter).sort({ rating: -1 }).limit(12).toArray();
      results = eResults.map((e) => ({ ...e, _collection: 'experiences' }));
    }

    const elapsed = Date.now() - startTime;

    res.json({
      results,
      meta: {
        version: 'v1-traditional',
        query,
        count: results.length,
        elapsed,
        pipeline: queryPipeline,
        notes: [
          'Uses MongoDB $regex — full collection scan for unindexed fields',
          'No relevance scoring — sorted by rating only',
          'Typo "Kapadoya" → 0 results. Atlas Search handles this.',
          'Semantic: searching "romantik tatil" won\'t find "balon turu"',
        ],
      },
    });
  } catch (err) {
    console.error('v1 search error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/autocomplete?q=ista
 * Traditional: simple startsWith regex (no fuzzy, limited)
 */
router.get('/autocomplete', async (req, res) => {
  const db = getDb();
  const { q = '' } = req.query;
  if (!q || q.length < 2) return res.json([]);

  const results = await db
    .collection('destinations')
    .find({ name: { $regex: `^${q}`, $options: 'i' } })
    .project({ name: 1, city: 1, category: 1 })
    .limit(5)
    .toArray();

  res.json(results.map((r) => ({ label: r.name, sublabel: r.city, type: 'destination' })));
});

module.exports = router;
