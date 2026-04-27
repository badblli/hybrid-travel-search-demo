const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { generateEmbedding, hasEmbeddingProvider, getEmbeddingProviderLabel } = require('../utils/embeddings');
const {
  detectIntent,
  buildHotelFilters,
  buildHotelShouldClauses,
  buildBeachPostMatch,
  buildVectorHotelFilter,
  applyIntentAwareBoosts,
  docHasSeaSignals,
  docMatchesHotelFilters,
} = require('../utils/hotel-intent');
const { fuseRankedLists } = require('../utils/rrf');

router.post('/search', async (req, res) => {
  const db = getDb();
  const { query = '', collection = 'destinations', filters = {}, alpha = 0.75 } = req.body;
  const cleanQuery = String(query || '').trim();
  const startTime = Date.now();

  if (!hasEmbeddingProvider()) {
    return res.status(503).json({
      error: `Hybrid Search requires a valid ${getEmbeddingProviderLabel()} key for query embedding.`,
      fallback: 'Using Atlas Search only (v2) instead.',
    });
  }

  try {
    const intent = detectIntent(cleanQuery);
    const canUseVector = collection === 'hotels' && !!cleanQuery;
    const queryVector = canUseVector ? await generateEmbedding(cleanQuery) : null;
    let facets = {};
    let facetPipeline = null;
    let facetResponse = null;

    const textPipeline = buildTextPipeline(cleanQuery, filters, collection, intent);
    const vectorPipeline = canUseVector ? buildVectorPipeline(queryVector, filters, collection, intent) : null;

    const [textResults, vectorResults, facetData] = await Promise.all([
      db.collection(collection).aggregate(textPipeline).toArray(),
      vectorPipeline ? db.collection(collection).aggregate(vectorPipeline).toArray().catch(() => []) : Promise.resolve([]),
      collection === 'hotels' ? buildHotelFacets(db, cleanQuery, filters) : Promise.resolve(null),
    ]);

    if (facetData) {
      facets = facetData.facets;
      facetPipeline = facetData.pipeline;
      facetResponse = facetData.response;
    }

    let merged = fuseRankedLists(textResults, vectorResults, alpha).map((doc) => ({
      ...doc,
      _collection: collection,
      _adjustedScore: applyIntentAwareBoosts(doc._rrfScore, doc, intent),
      score: applyIntentAwareBoosts(doc._rrfScore, doc, intent),
    }));

    if (collection === 'hotels') {
      merged = merged.filter((doc) => docMatchesHotelFilters(doc, intent, filters));
    }
    if (intent.beach && collection === 'hotels') {
      merged = merged.filter((doc) => docHasSeaSignals(doc) && !((doc.excludedIntents || []).includes('beach')));
    }

    merged = merged.sort((a, b) => b.score - a.score).slice(0, 12);

    res.json({
      results: merged,
      facets,
      meta: {
        version: 'v3-hybrid',
        query: cleanQuery,
        intent,
        count: merged.length,
        elapsed: Date.now() - startTime,
        debug: { textCount: textResults.length, vectorCount: vectorResults.length },
        pipeline: { textPipeline, vectorPipeline, fusion: { method: 'RRF', alpha } },
        facetPipeline,
        facetResponse,
        facets,
      },
    });
  } catch (err) {
    console.error('v3 hybrid error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function buildHotelSearchCompound(query, filters) {
  const intent = detectIntent(query);
  const searchFilterClauses = buildHotelFilters(intent, filters);
  const compound = {
    ...(searchFilterClauses.length ? { filter: searchFilterClauses } : {}),
  };

  if (query) {
    compound.should = buildHotelShouldClauses(query, intent);
    compound.minimumShouldMatch = 1;
    if (intent.beach) {
      compound.mustNot = [{ text: { path: 'excludedIntents', query: ['beach', 'sea', 'sun', 'seaside'] } }];
    }
  } else if (!searchFilterClauses.length) {
    compound.should = [{ exists: { path: 'name' } }];
    compound.minimumShouldMatch = 1;
  }

  return { compound, intent };
}

async function buildHotelFacets(db, query, filters) {
  const { compound } = buildHotelSearchCompound(query, filters);
  const pipeline = [
    {
      $searchMeta: {
        index: 'hotels_search',
        facet: {
          operator: { compound },
          facets: {
            starsFacet: { type: 'number', path: 'stars', boundaries: [0, 4, 5, 6], default: 'other' },
            ratingFacet: { type: 'number', path: 'rating', boundaries: [0, 4, 4.5, 5.1], default: 'other' },
            amenitiesFacet: { type: 'string', path: 'amenities', numBuckets: 12 },
            priceBucketFacet: { type: 'number', path: 'pricePerNight', boundaries: [0, 80, 160, 240], default: '240+' },
          },
        },
      },
    },
  ];

  const meta = await db.collection('hotels').aggregate(pipeline).toArray();
  const facetDoc = meta[0]?.facet || {};
  const mapBuckets = (items = []) => items.map((b) => ({ value: String(b._id), count: b.count }));

  const stars = mapBuckets(facetDoc.starsFacet?.buckets).filter((b) => ['4', '5'].includes(b.value));
  const ratings = mapBuckets(facetDoc.ratingFacet?.buckets).map((b) => ({
    value: b.value === '0' ? '0-4' : b.value === '4' ? '4-4.5' : '4.5+',
    count: b.count,
  }));

  const priceRaw = [
    ...(facetDoc.priceBucketFacet?.buckets || []).map((b) => ({ value: String(b._id), count: b.count })),
    ...(facetDoc.priceBucketFacet?.default ? [{ value: '240+', count: facetDoc.priceBucketFacet.default.count || 0 }] : []),
  ];
  const priceBuckets = priceRaw.map((b) => ({
    value: b.value === '0' ? '0-80' : b.value === '80' ? '80-160' : b.value === '160' ? '160-240' : '240+',
    count: b.count,
  }));

  const amenities = mapBuckets(facetDoc.amenitiesFacet?.buckets)
    .filter((b) => !['', '[]'].includes(b.value))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    pipeline,
    response: meta[0] || {},
    facets: { stars, ratings, amenities, priceBuckets },
  };
}



function buildTextPipeline(query, filters, collection, intent) {
  if (collection === 'hotels') {
    const searchFilterClauses = buildHotelFilters(intent, filters);
    const postMatch = buildBeachPostMatch(intent);
    const { compound } = buildHotelSearchCompound(query, filters);
    return [
      {
        $search: {
          index: 'hotels_search',
          compound,
        },
      },
      { $addFields: { score: { $meta: 'searchScore' } } },
      ...(Object.keys(postMatch).length ? [{ $match: postMatch }] : []),
      { $project: { embedding: 0 } },
      { $limit: 30 },
    ];
  }

  const filterClauses = [];
  if (filters.category) filterClauses.push({ equals: { path: 'category', value: filters.category } });
  if (filters.region) filterClauses.push({ equals: { path: 'region', value: filters.region } });

  return [
    {
      $search: {
        index: `${collection}_search`,
        compound: {
          should: query
            ? [
                { text: { query, path: 'name', score: { boost: { value: 3 } }, fuzzy: { maxEdits: 2 } } },
                { text: { query, path: 'description' } },
                { text: { query, path: 'tags', score: { boost: { value: 2 } } } },
              ]
            : [{ exists: { path: 'name' } }],
          minimumShouldMatch: 1,
          ...(filterClauses.length ? { filter: filterClauses } : {}),
        },
      },
    },
    { $addFields: { score: { $meta: 'searchScore' } } },
    { $project: { embedding: 0 } },
    { $limit: 30 },
  ];
}

function buildVectorPipeline(queryVector, filters, collection, intent) {
  const stage = {
    $vectorSearch: {
      index: `${collection}_vector`,
      path: 'embedding',
      queryVector,
      numCandidates: 100,
      limit: 30,
    },
  };

  if (collection === 'hotels') {
    const vf = buildVectorHotelFilter(intent, filters);
    if (Object.keys(vf).length) stage.$vectorSearch.filter = vf;
  }

  return [
    stage,
    { $addFields: { vectorScore: { $meta: 'vectorSearchScore' } } },
    { $project: { embedding: 0 } },
  ];
}

router.get('/autocomplete', async (req, res) => {
  const db = getDb();
  const { q = '', collection = 'destinations' } = req.query;
  if (!q || q.length < 2) return res.json([]);

  try {
    const pipeline = [
      { $search: { index: `${collection}_search`, autocomplete: { query: q, path: 'name', fuzzy: { maxEdits: 2 } } } },
      { $limit: 6 },
      { $project: { name: 1, city: 1, category: 1, rating: 1 } },
    ];
    const results = await db.collection(collection).aggregate(pipeline).toArray();
    res.json(results.map((r) => ({ label: r.name, sublabel: `${r.city || ''} · ${r.category || ''}`, type: collection })));
  } catch {
    res.json([]);
  }
});

module.exports = router;
