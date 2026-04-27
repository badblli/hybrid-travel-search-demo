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
  docMatchesHotelFilters,
} = require('../utils/hotel-intent');
const { fuseRankedLists } = require('../utils/rrf');
const { buildHotelsContext } = require('../utils/rag-context');

const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'openai').toLowerCase();

router.post('/rag', async (req, res) => {
  const db = getDb();
  const { query = '', collection = 'hotels', filters = {}, conversationHistory = [] } = req.body;
  const startTime = Date.now();

  try {
    if (!hasEmbeddingProvider()) throw new Error(`${getEmbeddingProviderLabel()} API key not set`);

    const intent = detectIntent(query);
    const queryVector = await generateEmbedding(query);
    const textPipeline = buildTextPipeline(query, filters, collection, intent);
    const vectorPipeline = buildVectorPipeline(queryVector, filters, collection, intent);
    const retrievedDocs = await hybridRetrieve(db, query, queryVector, collection, filters, intent);
    let facetPipeline = null;
    let facetResponse = null;
    let facets = {};
    if (collection === 'hotels') {
      const facetData = await buildHotelFacets(db, query, filters);
      facetPipeline = facetData.pipeline;
      facetResponse = facetData.response;
      facets = facetData.facets;
    }
    const grounded = retrievedDocs.slice(0, 6);
    const context = collection === 'hotels' ? buildHotelsContext(grounded) : buildGenericContext(grounded);
    const answer = await callLlm(buildSystemPrompt(), buildUserPrompt(query, intent, context), conversationHistory);

    res.json({
      answer,
      results: grounded,
      sources: grounded.map((doc, idx) => ({ ref: idx + 1, id: doc._id, name: doc.name, collection: doc._collection || collection })),
      meta: {
        version: 'v4-rag',
        query,
        intent,
        count: grounded.length,
        elapsed: Date.now() - startTime,
        llmProvider: LLM_PROVIDER,
        pipeline: { textPipeline, vectorPipeline, fusion: { method: 'RRF', alpha: 0.75 }, stage: 'RAG', notes: 'Retrieves with Atlas Search + Vector Search, then builds grounded context for the LLM.' },
        facetPipeline,
        facetResponse,
        facets,
      },
    });
  } catch (err) {
    console.error('v4 RAG error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function hybridRetrieve(db, query, queryVector, collection, filters, intent) {
  const collections = collection === 'all' ? ['destinations', 'hotels', 'experiences'] : [collection];
  const allResults = [];

  for (const col of collections) {
    const [textRes, vecRes] = await Promise.all([
      db.collection(col).aggregate(buildTextPipeline(query, filters, col, intent)).toArray().catch(() => []),
      db.collection(col).aggregate(buildVectorPipeline(queryVector, filters, col, intent)).toArray().catch(() => []),
    ]);

    let fused = fuseRankedLists(textRes, vecRes, 0.75).map((doc) => ({
      ...doc,
      _collection: col,
      score: applyIntentAwareBoosts(doc._rrfScore, doc, intent),
    }));

    if (col === 'hotels') {
      fused = fused.filter((doc) => docMatchesHotelFilters(doc, intent, filters));
    }

    allResults.push(...fused.sort((a, b) => b.score - a.score).slice(0, 8));
  }

  return allResults.sort((a, b) => b.score - a.score).slice(0, 12);
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



function buildTextPipeline(query, filters, collection, intent) {
  if (collection === 'hotels') {
    const filterClauses = buildHotelFilters(intent, filters);
    const postMatch = buildBeachPostMatch(intent);
    return [
      {
        $search: {
          index: 'hotels_search',
          compound: {
            should: buildHotelShouldClauses(query, intent),
            minimumShouldMatch: 1,
            ...(filterClauses.length ? { filter: filterClauses } : {}),
            ...(intent.beach ? { mustNot: [{ text: { path: 'excludedIntents', query: ['beach', 'sea', 'sun', 'seaside'] } }] } : {}),
          },
        },
      },
      { $addFields: { score: { $meta: 'searchScore' } } },
      ...(Object.keys(postMatch).length ? [{ $match: postMatch }] : []),
      { $project: { embedding: 0 } },
      { $limit: 20 },
    ];
  }

  return [
    {
      $search: {
        index: `${collection}_search`,
        compound: {
          should: [
            { text: { query, path: 'name', score: { boost: { value: 3 } }, fuzzy: { maxEdits: 1 } } },
            { text: { query, path: 'description' } },
            { text: { query, path: 'tags', score: { boost: { value: 2 } } } },
          ],
          minimumShouldMatch: 1,
        },
      },
    },
    { $addFields: { score: { $meta: 'searchScore' } } },
    { $project: { embedding: 0 } },
    { $limit: 20 },
  ];
}

function buildVectorPipeline(queryVector, filters, collection, intent) {
  const stage = {
    $vectorSearch: {
      index: `${collection}_vector`,
      path: 'embedding',
      queryVector,
      numCandidates: 80,
      limit: 20,
    },
  };
  if (collection === 'hotels') {
    const vf = buildVectorHotelFilter(intent, filters);
    if (Object.keys(vf).length) stage.$vectorSearch.filter = vf;
  }
  return [stage, { $addFields: { vectorScore: { $meta: 'vectorSearchScore' } } }, { $project: { embedding: 0 } }];
}

function buildGenericContext(docs) {
  return docs.map((doc, i) => `[#${i + 1}] ${doc.name}\n${doc.description || ''}`).join('\n\n---\n\n');
}

function buildSystemPrompt() {
  return `Sen MongoDB Atlas üzerinde çalışan bir seyahat asistanısın. Yalnızca verilen bağlamı kullan. Uydurma bilgi verme. Eğer kullanıcı deniz / güneş / plaj tatili isterse yalnızca bu kritere uyan otelleri öner. Her öneriyi kaynak referanslarıyla belirt.`;
}

function buildUserPrompt(query, intent, context) {
  return `Kullanıcı sorusu: ${query}\nIntent: ${JSON.stringify(intent)}\n\nBağlam:\n${context}\n\nGörev:\n- Türkçe yanıt ver\n- En fazla 3 öneri sun\n- Her öneri için neden uyduğunu açıkla\n- [1], [2] gibi kaynak referansları kullan\n- Bağlam dışında bilgi ekleme`;
}

async function callOpenAI(systemPrompt, userPrompt, history) {
  const key = process.env.OPENAI_API_KEY;
  const messages = [{ role: 'system', content: systemPrompt }, ...history.slice(-6), { role: 'user', content: userPrompt }];
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-4o', messages, max_tokens: 900, temperature: 0.2 }),
  });
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(`OpenAI error: ${err.error?.message || resp.statusText}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(systemPrompt, userPrompt, history) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const model = normalizeGeminiModel(process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash');
  const contents = [
    ...history.slice(-6).map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(msg.content || '') }],
    })),
    { role: 'user', parts: [{ text: userPrompt }] },
  ];

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        maxOutputTokens: 900,
        temperature: 0.2,
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Gemini error: ${err.error?.message || resp.statusText}`);
  }

  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '';
}

async function callLlm(systemPrompt, userPrompt, history) {
  if (LLM_PROVIDER === 'gemini') return callGemini(systemPrompt, userPrompt, history);
  return callOpenAI(systemPrompt, userPrompt, history);
}

function normalizeGeminiModel(model) {
  return model.startsWith('models/') ? model : `models/${model}`;
}

router.post('/search', async (req, res) => {
  const db = getDb();
  const { query = '', collection = 'destinations', filters = {} } = req.body;
  const startTime = Date.now();

  try {
    const intent = detectIntent(query);
    const queryVector = await generateEmbedding(query);
    const textPipeline = buildTextPipeline(query, filters, collection, intent);
    const vectorPipeline = buildVectorPipeline(queryVector, filters, collection, intent);
    const docs = await hybridRetrieve(db, query, queryVector, collection, filters, intent);
    let facets = {};
    let facetPipeline = null;
    let facetResponse = null;
    if (collection === 'hotels') {
      const facetData = await buildHotelFacets(db, query, filters);
      facets = facetData.facets;
      facetPipeline = facetData.pipeline;
      facetResponse = facetData.response;
    }
    res.json({
      results: docs.map((d) => ({ ...d, _collection: d._collection || collection })),
      facets,
      meta: {
        version: 'v4-rag',
        query,
        intent,
        count: docs.length,
        elapsed: Date.now() - startTime,
        pipeline: { textPipeline, vectorPipeline, fusion: { method: 'RRF', alpha: 0.75 }, notes: 'Uses Atlas Search + Vector Search + fusion before RAG.' },
        facetPipeline,
        facetResponse,
        facets,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/autocomplete', async (req, res) => {
  const db = getDb();
  const { q = '', collection = 'destinations' } = req.query;
  if (!q || q.length < 2) return res.json([]);
  try {
    const pipeline = [
      { $search: { index: `${collection}_search`, autocomplete: { query: q, path: 'name', fuzzy: { maxEdits: 1 } } } },
      { $limit: 6 },
      { $project: { name: 1, city: 1, category: 1 } },
    ];
    const results = await db.collection(collection).aggregate(pipeline).toArray();
    res.json(results.map((r) => ({ label: r.name, sublabel: `${r.city || ''} · ${r.category || ''}`, type: collection })));
  } catch {
    res.json([]);
  }
});

module.exports = router;
