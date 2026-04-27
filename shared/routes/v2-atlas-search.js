const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const {
  detectIntent,
  buildHotelFilters,
  buildHotelShouldClauses,
  buildBeachPostMatch,
} = require('../utils/hotel-intent');

router.post('/search', async (req, res) => {
  const db = getDb();
  const { query = '', collection = 'destinations', filters = {} } = req.body;
  const startTime = Date.now();

  try {
    let results = [];
    let facets = {};
    let pipeline = [];
    let facetPipeline = null;
    let facetResponse = null;

    if (collection === 'destinations' || collection === 'all') {
      pipeline = buildDestinationPipeline(query, filters);
      const raw = await db.collection('destinations').aggregate(pipeline).toArray();
      results = raw.map((d) => ({ ...d, _collection: 'destinations' }));
    }

    if (collection === 'hotels') {
      pipeline = buildHotelPipeline(query, filters);
      const raw = await db.collection('hotels').aggregate(pipeline).toArray();
      results = raw.map((h) => ({ ...h, _collection: 'hotels' }));
      const facetData = await buildHotelFacets(db, query, filters);
      facets = facetData.facets;
      facetPipeline = facetData.pipeline;
      facetResponse = facetData.response;
    }

    if (collection === 'experiences') {
      pipeline = buildExperiencePipeline(query, filters);
      const raw = await db.collection('experiences').aggregate(pipeline).toArray();
      results = raw.map((e) => ({ ...e, _collection: 'experiences' }));
    }

    const elapsed = Date.now() - startTime;
    res.json({
      results,
      facets,
      meta: {
        version: 'v2-atlas-search',
        query,
        count: results.length,
        elapsed,
        pipeline,
        facetPipeline,
        facetResponse,
        facets,
        notes: [
          'Intent-aware filtering now applies stronger beach constraints for hotel searches.',
          'Beach queries boost seaside fields and demote inland boutique properties.',
        ],
      },
    });
  } catch (err) {
    const isIndexMissing = err.message?.includes('$search') || err.codeName === 'IndexNotFound';
    console.error('v2 search error:', err.message);
    res.status(isIndexMissing ? 503 : 500).json({
      error: isIndexMissing
        ? 'Atlas Search index missing. Create the required search indexes in Atlas.'
        : err.message,
    });
  }
});

function buildDestinationPipeline(query, filters) {
  const filterClauses = [];
  if (filters.category) filterClauses.push({ equals: { path: 'category', value: filters.category } });
  if (filters.region) filterClauses.push({ equals: { path: 'region', value: filters.region } });
  if (filters.minRating) filterClauses.push({ range: { path: 'rating', gte: parseFloat(filters.minRating) } });

  return [
    {
      $search: {
        index: 'destinations_search',
        compound: {
          ...(query
            ? {
                should: [
                  { text: { query, path: 'name', fuzzy: { maxEdits: 2, prefixLength: 2 }, score: { boost: { value: 3 } } } },
                  { text: { query, path: 'description', fuzzy: { maxEdits: 2 } } },
                  { text: { query, path: 'tags', score: { boost: { value: 2 } } } },
                  { text: { query, path: ['city', 'region'], fuzzy: { maxEdits: 2 } } },
                ],
                minimumShouldMatch: 1,
              }
            : { should: [{ exists: { path: 'name' } }], minimumShouldMatch: 1 }),
          ...(filterClauses.length ? { filter: filterClauses } : {}),
        },
      },
    },
    { $addFields: { score: { $meta: 'searchScore' } } },
    { $limit: 12 },
    { $project: { embedding: 0 } },
  ];
}


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


function buildHotelPipeline(query, filters) {
  const { compound, intent } = buildHotelSearchCompound(query, filters);
  const postMatch = buildBeachPostMatch(intent);

  return [
    {
      $search: {
        index: 'hotels_search',
        compound,
      },
    },
    { $addFields: { score: { $meta: 'searchScore' } } },
    ...(Object.keys(postMatch).length ? [{ $match: postMatch }] : []),
    { $sort: { score: -1, rating: -1 } },
    { $limit: 12 },
    { $project: { embedding: 0 } },
  ];
}

function buildExperiencePipeline(query, filters) {
  const filterClauses = [];
  if (filters.maxPrice) filterClauses.push({ range: { path: 'price', lte: parseInt(filters.maxPrice, 10) } });
  if (filters.category) filterClauses.push({ equals: { path: 'category', value: filters.category } });

  return [
    {
      $search: {
        index: 'experiences_search',
        compound: {
          ...(query
            ? {
                should: [
                  { text: { query, path: 'name', score: { boost: { value: 3 } } } },
                  { text: { query, path: 'description' } },
                  { text: { query, path: 'tags', score: { boost: { value: 2 } } } },
                ],
                minimumShouldMatch: 1,
              }
            : { should: [{ exists: { path: 'name' } }], minimumShouldMatch: 1 }),
          ...(filterClauses.length ? { filter: filterClauses } : {}),
        },
      },
    },
    { $addFields: { score: { $meta: 'searchScore' } } },
    { $limit: 12 },
    { $project: { embedding: 0 } },
  ];
}

router.get('/autocomplete', async (req, res) => {
  const db = getDb();
  const { q = '', collection = 'destinations' } = req.query;
  if (!q || q.length < 2) return res.json([]);

  try {
    const pipeline = [
      {
        $search: {
          index: `${collection}_search`,
          autocomplete: {
            query: q,
            path: 'name',
            fuzzy: { maxEdits: 2 },
          },
        },
      },
      { $limit: 6 },
      { $project: { name: 1, city: 1, category: 1, rating: 1 } },
    ];

    const results = await db.collection(collection).aggregate(pipeline).toArray();
    res.json(results.map((r) => ({ label: r.name, sublabel: `${r.city || ''} · ${r.category || ''}`, type: collection })));
  } catch (err) {
    console.warn('autocomplete error:', err.message);
    res.json([]);
  }
});

module.exports = router;
