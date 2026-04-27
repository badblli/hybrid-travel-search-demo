const DESTINATIONS = [
  { slug: 'antalya', city: 'Antalya', region: 'Akdeniz', neighborhoods: ['Lara', 'Konyaaltı', 'Kemer', 'Side'] },
  { slug: 'bodrum', city: 'Bodrum', region: 'Ege', neighborhoods: ['Bitez', 'Yalıkavak', 'Torba', 'Gümbet'] },
  { slug: 'cesme', city: 'Çeşme', region: 'Ege', neighborhoods: ['Alaçatı', 'Ilıca', 'Altınkum'] },
  { slug: 'fethiye', city: 'Fethiye', region: 'Ege', neighborhoods: ['Ölüdeniz', 'Çalış', 'Göcek'] },
  { slug: 'marmaris', city: 'Marmaris', region: 'Ege', neighborhoods: ['İçmeler', 'Siteler', 'Turunç'] },
  { slug: 'kapadokya', city: 'Nevşehir', region: 'İç Anadolu', neighborhoods: ['Göreme', 'Uçhisar', 'Ürgüp'], inland: true },
  { slug: 'mardin', city: 'Mardin', region: 'Güneydoğu Anadolu', neighborhoods: ['Artuklu', 'Midyat'], inland: true },
  { slug: 'istanbul', city: 'İstanbul', region: 'Marmara', neighborhoods: ['Sultanahmet', 'Beyoğlu', 'Beşiktaş'], inland: true },
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function makeBeachHotel(dest, i) {
  const beachfront = Math.random() < 0.7;
  const family = Math.random() < 0.5;
  const romantic = Math.random() < 0.35;
  const luxury = Math.random() < 0.45;
  const privateBeach = beachfront && Math.random() < 0.7;
  return {
    name: `${dest.city} ${pick(['Blue', 'Golden', 'Sunset', 'Azure'])} ${pick(['Resort', 'Suites', 'Beach Hotel'])}`,
    slug: `${dest.slug}-hotel-${i}`,
    destinationSlug: dest.slug,
    city: dest.city,
    region: dest.region,
    neighborhood: pick(dest.neighborhoods),
    category: luxury ? 'lüks' : 'resort',
    description: `${dest.city} bölgesinde ${beachfront ? 'denize sıfır' : 'denize çok yakın'} konumlanan bu otel, ${privateBeach ? 'özel plajı' : 'sahil erişimi'} ve ${family ? 'aile dostu' : 'rahat'} atmosferi ile deniz ve güneş tatili arayanlar için uygundur.`,
    amenities: ['wifi', 'restoran', 'havuz', ...(privateBeach ? ['private beach'] : []), ...(family ? ['kids club'] : []), ...(luxury ? ['spa'] : [])],
    rating: Number((Math.random() * 0.8 + 4.1).toFixed(1)),
    stars: luxury ? 5 : pick([4, 5]),
    pricePerNight: luxury ? rand(180, 420) : rand(85, 220),
    tags: ['plaj', 'deniz', 'güneş', 'sahil', ...(family ? ['aile'] : []), ...(romantic ? ['romantik'] : [])],
    travelStyles: ['beach', 'sun', 'seaside', ...(family ? ['family'] : []), ...(romantic ? ['romantic'] : []), 'relaxation'],
    suitableFor: ['summer holidays', ...(family ? ['families'] : []), ...(romantic ? ['couples'] : [])],
    themes: ['deniz', 'güneş', 'sahil', 'plaj', beachfront ? 'denize sıfır' : 'denize yakın', ...(privateBeach ? ['özel plaj'] : [])],
    excludedIntents: [],
    searchableText: `${dest.city} ${beachfront ? 'denize sıfır' : 'denize yakın'} sahil plaj yaz tatili deniz güneş ${family ? 'aile oteli' : ''} ${romantic ? 'romantik tatil' : ''}`,
    highlights: [beachfront ? 'Denize sıfır konum' : 'Sahile kısa mesafe', privateBeach ? 'Özel plaj' : 'Kolay plaj erişimi', family ? 'Aile dostu' : 'Yaz tatili için ideal'],
    beach: { isBeachfront: beachfront, privateBeach, seaDistanceMeters: beachfront ? 0 : rand(80, 250), beachType: [pick(['sand', 'pebble', 'mixed'])] },
  };
}

function makeInlandHotel(dest, i) {
  return {
    name: `${dest.city} ${pick(['Stone', 'Valley', 'Heritage', 'Sky'])} ${pick(['Boutique', 'Retreat', 'Hotel'])}`,
    slug: `${dest.slug}-hotel-${i}`,
    destinationSlug: dest.slug,
    city: dest.city,
    region: dest.region,
    neighborhood: pick(dest.neighborhoods),
    category: 'butik',
    description: `${dest.city} bölgesindeki bu butik otel kültür, manzara ve romantik kaçamak için uygundur. Plaj veya deniz tatili için uygun değildir.`,
    amenities: ['wifi', 'restoran', 'kahvaltı'],
    rating: Number((Math.random() * 0.8 + 4.0).toFixed(1)),
    stars: pick([4, 5]),
    pricePerNight: rand(95, 260),
    tags: ['butik', 'kültür', 'manzara', 'romantik'],
    travelStyles: ['culture', 'scenic', 'romantic', 'boutique'],
    suitableFor: ['couples', 'culture travelers'],
    themes: dest.slug === 'kapadokya' ? ['balon', 'mağara oteli', 'vadiler', 'gün doğumu'] : ['tarihi doku', 'taş mimari', 'kültürel gezi'],
    excludedIntents: ['beach', 'sea', 'sun', 'seaside'],
    searchableText: `${dest.city} butik otel kültür manzara sahil değildir plaj oteli değildir`,
    highlights: ['Kültür odaklı konaklama', 'Manzara deneyimi', 'Plaj tatili değildir'],
    beach: { isBeachfront: false, privateBeach: false, seaDistanceMeters: 999999, beachType: [] },
  };
}

function generateHotels() {
  const hotels = [];
  for (const dest of DESTINATIONS) {
    const count = dest.inland ? 8 : 14;
    for (let i = 1; i <= count; i++) {
      hotels.push(dest.inland ? makeInlandHotel(dest, i) : makeBeachHotel(dest, i));
    }
  }
  return hotels;
}

module.exports = { generateHotels };
