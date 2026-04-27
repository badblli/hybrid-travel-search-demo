const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 1536);

function getAiProvider() {
  return (process.env.LLM_PROVIDER || 'openai').toLowerCase();
}

async function generateEmbedding(text) {
  const input = String(text || '').trim();
  if (!input) {
    throw new Error('Cannot generate embedding for an empty query.');
  }
  const provider = getAiProvider();
  if (provider === 'gemini') return generateGeminiEmbedding(input);
  return generateOpenAIEmbedding(input);
}

async function generateOpenAIEmbedding(text) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: text.slice(0, 8000),
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`OpenAI embedding error: ${err.error?.message}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

async function generateGeminiEmbedding(text) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const model = normalizeGeminiModel(GEMINI_EMBEDDING_MODEL);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:embedContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text: text.slice(0, 8000) }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini embedding error: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const values = data.embedding?.values;
  if (!Array.isArray(values)) {
    throw new Error('Gemini embedding response did not include embedding.values');
  }
  return values;
}

function buildEmbeddingText(doc, type) {
  if (type === 'destination') {
    return [
      doc.name,
      doc.city,
      doc.region,
      doc.category,
      doc.description,
      ...(doc.tags || []),
      ...(doc.highlights || []),
    ].join(' ');
  }

  if (type === 'hotel') {
    return [
      `Hotel name: ${doc.name || ''}`,
      `City: ${doc.city || ''}`,
      `Neighborhood: ${doc.neighborhood || ''}`,
      `Region: ${doc.region || ''}`,
      `Category: ${doc.category || ''}`,
      `Stars: ${doc.stars || ''}`,
      `PricePerNight: ${doc.pricePerNight || ''}`,
      `Beachfront: ${doc.beach?.isBeachfront ? 'yes' : 'no'}`,
      `SeaDistanceMeters: ${doc.beach?.seaDistanceMeters ?? ''}`,
      `TravelStyles: ${(doc.travelStyles || []).join(', ')}`,
      `SuitableFor: ${(doc.suitableFor || []).join(', ')}`,
      `Themes: ${(doc.themes || []).join(', ')}`,
      doc.description || '',
      ...(doc.tags || []),
      ...(doc.highlights || []),
      ...(doc.amenities || []),
      doc.searchableText || '',
      `ExcludedIntents: ${(doc.excludedIntents || []).join(', ')}`,
    ].join(' ');
  }

  if (type === 'experience') {
    return [
      doc.name,
      doc.category,
      doc.description,
      ...(doc.tags || []),
      ...(doc.includes || []),
    ].join(' ');
  }

  return doc.description || doc.name || '';
}

function hasOpenAI() {
  return !!process.env.OPENAI_API_KEY;
}

function hasGemini() {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

function hasEmbeddingProvider() {
  return getAiProvider() === 'gemini' ? hasGemini() : hasOpenAI();
}

function getEmbeddingProviderLabel() {
  return getAiProvider() === 'gemini' ? 'Gemini' : 'OpenAI';
}

function normalizeGeminiModel(model) {
  return model.startsWith('models/') ? model : `models/${model}`;
}

module.exports = {
  generateEmbedding,
  buildEmbeddingText,
  hasOpenAI,
  hasGemini,
  hasEmbeddingProvider,
  getEmbeddingProviderLabel,
  getAiProvider,
};
