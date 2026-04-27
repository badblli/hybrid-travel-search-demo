const BEACH_TERMS = [
  'deniz', 'güneş', 'gunes', 'plaj', 'sahil', 'sea', 'sun', 'beach', 'seaside', 'coast', 'coastal',
  'denize sıfır', 'denize sifir', 'beachfront', 'shore'
];
const ROMANTIC_TERMS = ['romantik', 'romantic', 'balayı', 'balayi', 'couple', 'çift', 'cift', 'honeymoon'];
const FAMILY_TERMS = ['aile', 'family', 'çocuk', 'cocuk', 'kids', 'children', 'child-friendly'];
const BUDGET_TERMS = ['uygun fiyat', 'ekonomik', 'cheap', 'budget', 'affordable'];
const CULTURE_TERMS = ['kültür', 'kultur', 'culture', 'museum', 'müze', 'history', 'tarih', 'gastronomy', 'food'];
const WELLNESS_TERMS = ['spa', 'wellness', 'relax', 'relaxation', 'retreat', 'rahatlama'];

const DESTINATION_ALIASES = [
  { slug: 'antalya', labels: ['antalya', "antalya'da", "antalyada"] },
  { slug: 'bodrum', labels: ['bodrum', "bodrum'da", "bodrumda"] },
  { slug: 'marmaris', labels: ['marmaris', "marmaris'te", "marmariste"] },
  { slug: 'cesme', labels: ['çeşme', 'cesme', "çeşme'de", "cesme'de", 'cesmede', 'çeşmede'] },
  { slug: 'fethiye', labels: ['fethiye', "fethiye'de", 'fethiyede'] },
  { slug: 'kas', labels: ['kaş', 'kas', "kaş'ta", "kas'ta", 'kasta', 'kaşta'] },
  { slug: 'alanya', labels: ['alanya', "alanya'da", 'alanyada'] },
  { slug: 'belek', labels: ['belek', "belek'te", 'belekte'] },
  { slug: 'istanbul', labels: ['istanbul', 'i̇stanbul', "istanbul'da", 'istanbulda'] },
  { slug: 'kapadokya', labels: ['kapadokya', 'cappadocia', "kapadokya'da", 'kapadokyada'] },
  { slug: 'mardin', labels: ['mardin', "mardin'de", 'mardinde'] },
];

function normalizeText(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function containsAny(text, terms) {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

function extractDestination(query = '') {
  const q = normalizeText(query);
  const match = DESTINATION_ALIASES.find((dest) =>
    dest.labels.some((label) => q.includes(normalizeText(label)))
  );
  if (!match) return null;
  return { slug: match.slug };
}

function detectIntent(query = '') {
  const q = normalizeText(query);
  const destination = extractDestination(q);
  return {
    beach: containsAny(q, BEACH_TERMS),
    sea: containsAny(q, BEACH_TERMS),
    romantic: containsAny(q, ROMANTIC_TERMS),
    romance: containsAny(q, ROMANTIC_TERMS),
    family: containsAny(q, FAMILY_TERMS),
    budget: containsAny(q, BUDGET_TERMS),
    culture: containsAny(q, CULTURE_TERMS),
    wellness: containsAny(q, WELLNESS_TERMS),
    destination,
    destinationSlug: destination?.slug || null,
    raw: q,
  };
}

function buildHotelFilters(intent = {}, filters = {}) {
  const clauses = [];
  if (intent.beach) {
    clauses.push({ equals: { path: 'beach.isBeachfront', value: true } });
    clauses.push({ range: { path: 'beach.seaDistanceMeters', lte: 250 } });
  }
  if (intent.family) {
    clauses.push({ text: { path: 'suitableFor', query: ['families', 'family', 'aile'] } });
  }
  if (intent.romantic) {
    clauses.push({ text: { path: ['travelStyles', 'themes', 'suitableFor'], query: ['romantic', 'romantik', 'couples', 'cift', 'çift'] } });
  }
  if (intent.destinationSlug) {
    clauses.push({
      compound: {
        should: [
          { text: { path: 'destinationSlug', query: intent.destinationSlug } },
          { text: { path: 'city', query: intent.destinationSlug } },
        ],
        minimumShouldMatch: 1,
      },
    });
  }
  if (filters.maxPrice) {
    clauses.push({ range: { path: 'pricePerNight', lte: parseInt(filters.maxPrice, 10) } });
  }
  if (filters.minRating) {
    clauses.push({ range: { path: 'rating', gte: parseFloat(filters.minRating) } });
  }
  if (filters.category) {
    clauses.push({ equals: { path: 'category', value: filters.category } });
  }

  if (Array.isArray(filters.stars) && filters.stars.length) {
    clauses.push({
      compound: {
        should: filters.stars.map((value) => ({ equals: { path: 'stars', value: Number(value) } })),
        minimumShouldMatch: 1,
      },
    });
  }

  if (Array.isArray(filters.amenities) && filters.amenities.length) {
    clauses.push({
      compound: {
        should: filters.amenities.map((value) => ({ text: { path: 'amenities', query: value } })),
        minimumShouldMatch: 1,
      },
    });
  }

  if (Array.isArray(filters.ratingBuckets) && filters.ratingBuckets.length) {
    clauses.push({
      compound: {
        should: filters.ratingBuckets.map((bucket) => {
          if (bucket === '0-4') return { range: { path: 'rating', gte: 0, lt: 4 } };
          if (bucket === '4-4.5') return { range: { path: 'rating', gte: 4, lt: 4.5 } };
          return { range: { path: 'rating', gte: 4.5, lte: 5 } };
        }),
        minimumShouldMatch: 1,
      },
    });
  }

  if (Array.isArray(filters.priceBuckets) && filters.priceBuckets.length) {
    clauses.push({
      compound: {
        should: filters.priceBuckets.map((bucket) => {
          if (bucket === '0-80') return { range: { path: 'pricePerNight', gte: 0, lt: 80 } };
          if (bucket === '80-160') return { range: { path: 'pricePerNight', gte: 80, lt: 160 } };
          if (bucket === '160-240') return { range: { path: 'pricePerNight', gte: 160, lt: 240 } };
          return { range: { path: 'pricePerNight', gte: 240 } };
        }),
        minimumShouldMatch: 1,
      },
    });
  }

  return clauses;
}

function buildHotelShouldClauses(query, intent = {}) {
  const should = [
    {
      text: {
        path: ['name', 'description', 'searchableText'],
        query,
        score: { boost: { value: 3 } },
        fuzzy: { maxEdits: 2, prefixLength: 2 },
      },
    },
    {
      text: {
        path: ['themes', 'travelStyles', 'highlights', 'tags', 'amenities'],
        query,
        score: { boost: { value: 5 } },
      },
    },
    {
      text: {
        path: ['city', 'region', 'destinationSlug', 'neighborhood'],
        query,
        score: { boost: { value: 2 } },
        fuzzy: { maxEdits: 2 },
      },
    },
  ];

  if (intent.beach) {
    should.push({
      text: {
        path: ['themes', 'travelStyles', 'searchableText', 'description', 'tags'],
        query: ['deniz', 'güneş', 'gunes', 'plaj', 'sahil', 'beach', 'sea', 'sun', 'seaside', 'beachfront'],
        score: { boost: { value: 8 } },
      },
    });
  }

  if (intent.family) {
    should.push({
      text: {
        path: ['suitableFor', 'amenities', 'themes', 'tags'],
        query: ['families', 'family', 'kids club', 'çocuk', 'cocuk', 'aile'],
        score: { boost: { value: 4 } },
      },
    });
  }

  if (intent.romantic) {
    should.push({
      text: {
        path: ['travelStyles', 'themes', 'description', 'tags'],
        query: ['romantic', 'romantik', 'couples', 'çift', 'cift', 'honeymoon', 'balayı', 'balayi'],
        score: { boost: { value: 4 } },
      },
    });
  }

  return should;
}

function buildBeachPostMatch(intent = {}) {
  const post = {};
  if (intent.beach) {
    post['beach.isBeachfront'] = true;
    post['beach.seaDistanceMeters'] = { $lte: 250 };
    post.excludedIntents = { $nin: ['beach', 'sea', 'sun', 'seaside'] };
  }
  if (intent.destinationSlug) {
    post.destinationSlug = intent.destinationSlug;
  }
  return post;
}

function buildVectorHotelFilter(intent = {}, filters = {}) {
  const clauses = [];

  if (intent.beach) {
    clauses.push({ 'beach.isBeachfront': true });
  }
  if (intent.destinationSlug) {
    clauses.push({ destinationSlug: intent.destinationSlug });
  }
  if (filters.category) clauses.push({ category: filters.category });

  if (Array.isArray(filters.stars) && filters.stars.length) {
    clauses.push({ stars: { $in: filters.stars.map((v) => Number(v)) } });
  }

  if (Array.isArray(filters.amenities) && filters.amenities.length) {
    clauses.push({ amenities: { $in: filters.amenities } });
  }

  if (Array.isArray(filters.ratingBuckets) && filters.ratingBuckets.length) {
    const ranges = filters.ratingBuckets.map((bucket) => {
      if (bucket === '0-4') return { rating: { $gte: 0, $lt: 4 } };
      if (bucket === '4-4.5') return { rating: { $gte: 4, $lt: 4.5 } };
      return { rating: { $gte: 4.5, $lte: 5 } };
    });
    clauses.push(ranges.length === 1 ? ranges[0] : { $or: ranges });
  }

  if (Array.isArray(filters.priceBuckets) && filters.priceBuckets.length) {
    const ranges = filters.priceBuckets.map((bucket) => {
      if (bucket === '0-80') return { pricePerNight: { $gte: 0, $lt: 80 } };
      if (bucket === '80-160') return { pricePerNight: { $gte: 80, $lt: 160 } };
      if (bucket === '160-240') return { pricePerNight: { $gte: 160, $lt: 240 } };
      return { pricePerNight: { $gte: 240 } };
    });
    clauses.push(ranges.length === 1 ? ranges[0] : { $or: ranges });
  }

  if (!clauses.length) return {};
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

function docMatchesHotelFilters(doc = {}, intent = {}, filters = {}) {
  const amenities = Array.isArray(doc.amenities) ? doc.amenities.map((x) => normalizeText(x)) : [];
  const stars = Number(doc.stars || 0);
  const rating = Number(doc.rating || 0);
  const price = Number(doc.pricePerNight || 0);
  const dest = normalizeText(doc.destinationSlug || doc.city || '');

  if (intent.destinationSlug && dest !== normalizeText(intent.destinationSlug)) return false;
  if (intent.beach && !doc?.beach?.isBeachfront) return false;

  if (Array.isArray(filters.stars) && filters.stars.length && !filters.stars.map(Number).includes(stars)) return false;

  if (Array.isArray(filters.amenities) && filters.amenities.length) {
    const wanted = filters.amenities.map((x) => normalizeText(x));
    if (!wanted.every((item) => amenities.includes(item))) return false;
  }

  if (Array.isArray(filters.ratingBuckets) && filters.ratingBuckets.length) {
    const ok = filters.ratingBuckets.some((bucket) => {
      if (bucket === '0-4') return rating >= 0 && rating < 4;
      if (bucket === '4-4.5') return rating >= 4 && rating < 4.5;
      return rating >= 4.5 && rating <= 5;
    });
    if (!ok) return false;
  }

  if (Array.isArray(filters.priceBuckets) && filters.priceBuckets.length) {
    const ok = filters.priceBuckets.some((bucket) => {
      if (bucket === '0-80') return price >= 0 && price < 80;
      if (bucket === '80-160') return price >= 80 && price < 160;
      if (bucket === '160-240') return price >= 160 && price < 240;
      return price >= 240;
    });
    if (!ok) return false;
  }

  return true;
}

function docHasSeaSignals(doc = {}) {
  if (doc?.beach?.isBeachfront) return true;
  const text = buildDocText(doc);
  return ['beach', 'seaside', 'coast', 'coastal', 'sahil', 'deniz', 'sea', 'shore', 'private beach', 'plaj']
    .some((term) => text.includes(term));
}

function buildDocText(doc = {}) {
  return [
    doc.name,
    doc.description,
    doc.city,
    doc.region,
    doc.category,
    doc.destinationSlug,
    doc.neighborhood,
    doc.searchableText,
    ...(doc.tags || []),
    ...(doc.highlights || []),
    ...(doc.amenities || []),
    ...(doc.travelStyles || []),
    ...(doc.themes || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function applyIntentAwareBoosts(baseScore, doc = {}, intent = {}) {
  let score = baseScore;
  const text = buildDocText(doc);
  if (intent.destinationSlug && doc.destinationSlug && normalizeText(doc.destinationSlug) === normalizeText(intent.destinationSlug)) {
    score *= 1.35;
  }
  if (intent.beach) {
    if (doc?.beach?.isBeachfront) score *= 1.6;
    if ((doc?.beach?.seaDistanceMeters ?? 999999) <= 100) score *= 1.15;
    if (containsAny(text, ['beach', 'seaside', 'coast', 'sahil', 'deniz', 'sea', 'plaj'])) score *= 1.2;
    if ((doc.excludedIntents || []).some((v) => ['beach', 'sea', 'sun', 'seaside'].includes(String(v).toLowerCase()))) score *= 0.15;
  }
  if (intent.family && containsAny(text, ['family', 'kids', 'children', 'aile', 'çocuk', 'cocuk'])) score *= 1.15;
  if (intent.romantic && containsAny(text, ['romantic', 'honeymoon', 'couple', 'balayı', 'balayi', 'çift', 'cift'])) score *= 1.12;
  if (intent.culture && containsAny(text, ['museum', 'history', 'culture', 'gastronomy', 'food', 'müze', 'tarih', 'kültür'])) score *= 1.08;
  if (intent.wellness && containsAny(text, ['spa', 'wellness', 'relax', 'retreat', 'rahatlama'])) score *= 1.08;
  return score;
}

module.exports = {
  detectIntent,
  extractDestination,
  normalizeText,
  buildHotelFilters,
  buildHotelShouldClauses,
  buildBeachPostMatch,
  buildVectorHotelFilter,
  docMatchesHotelFilters,
  applyIntentAwareBoosts,
  docHasSeaSignals,
  buildDocText,
};
