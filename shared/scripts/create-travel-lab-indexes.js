function askDbName(defaultName) {
  const envDbName =
    typeof process !== 'undefined' &&
    process.env &&
    (process.env.DB_NAME || process.env.TRAVEL_LAB_DB);

  if (envDbName && envDbName.trim()) {
    return envDbName.trim();
  }

  let input = '';

  if (typeof readline === 'function') {
    input = readline(`Enter database name [${defaultName}]: `);
  }

  input = input && input.trim();

  return input || defaultName;
}

const DB_NAME = askDbName('travel_lab');
const dbx = db.getSiblingDB(DB_NAME);

function upsertSearchIndex(collectionName, spec) {
  const coll = dbx.getCollection(collectionName);
  const existing = coll.getSearchIndexes().find(ix => ix.name === spec.name);

  if (existing) {
    print(`Updating ${collectionName}.${spec.name} (${spec.type}) ...`);
    coll.updateSearchIndex(spec.name, spec.definition);
  } else {
    print(`Creating ${collectionName}.${spec.name} (${spec.type}) ...`);
    coll.createSearchIndex(spec);
  }
}

function printIndexes(collectionName) {
  const coll = dbx.getCollection(collectionName);
  print(`\nCurrent indexes for ${DB_NAME}.${collectionName}:`);
  coll.getSearchIndexes().forEach(ix => {
    printjson({
      name: ix.name,
      type: ix.type,
      status: ix.status,
      queryable: ix.queryable,
      latestDefinitionVersion: ix.latestDefinitionVersion
    });
  });
}

const indexes = [
  {
    collection: 'destinations',
    spec: {
      name: 'destinations_search',
      type: 'search',
      definition: {
        analyzer: 'lucene.turkish',
        searchAnalyzer: 'lucene.turkish',
        mappings: {
          dynamic: false,
          fields: {
            name: [
              { type: 'string', analyzer: 'lucene.turkish' },
              {
                type: 'autocomplete',
                analyzer: 'lucene.standard',
                tokenization: 'edgeGram',
                minGrams: 2,
                maxGrams: 10
              }
            ],
            description: { type: 'string', analyzer: 'lucene.turkish' },
            highlights: { type: 'string', analyzer: 'lucene.turkish' },
            city: { type: 'string', analyzer: 'lucene.turkish' },
            region: { type: 'string', analyzer: 'lucene.turkish' },
            country: { type: 'string', analyzer: 'lucene.standard' },
            tags: { type: 'string', analyzer: 'lucene.turkish' },
            category: { type: 'token' },
            rating: { type: 'number' },
            priceLevel: { type: 'number' },
            bestSeason: { type: 'string', analyzer: 'lucene.turkish' }
          }
        }
      }
    }
  },
  {
    collection: 'hotels',
    spec: {
      name: 'hotels_search',
      type: 'search',
      definition: {
        analyzer: 'lucene.turkish',
        searchAnalyzer: 'lucene.turkish',
        mappings: {
          dynamic: false,
          fields: {
            name: [
              { type: 'string', analyzer: 'lucene.turkish' },
              {
                type: 'autocomplete',
                analyzer: 'lucene.standard',
                tokenization: 'edgeGram',
                minGrams: 2,
                maxGrams: 10
              }
            ],
            description: { type: 'string', analyzer: 'lucene.turkish' },
            searchableText: { type: 'string', analyzer: 'lucene.turkish' },
            highlights: { type: 'string', analyzer: 'lucene.turkish' },
            city: { type: 'string', analyzer: 'lucene.turkish' },
            region: { type: 'string', analyzer: 'lucene.turkish' },
            neighborhood: { type: 'string', analyzer: 'lucene.turkish' },
            destinationSlug: { type: 'string', analyzer: 'lucene.turkish' },
            amenities: [
            { type: 'string', analyzer: 'lucene.turkish' },
            { type: 'token' }
          ],
            tags: { type: 'string', analyzer: 'lucene.turkish' },
            travelStyles: { type: 'string', analyzer: 'lucene.turkish' },
            suitableFor: { type: 'string', analyzer: 'lucene.turkish' },
            themes: { type: 'string', analyzer: 'lucene.turkish' },
            excludedIntents: { type: 'string', analyzer: 'lucene.keyword' },
            type: { type: 'token' },
            rating: { type: 'number' },
            stars: { type: 'number' },
            pricePerNight: { type: 'number' },
            beach: {
              type: 'document',
              fields: {
                isBeachfront: { type: 'boolean' },
                privateBeach: { type: 'boolean' },
                seaDistanceMeters: { type: 'number' },
                beachType: { type: 'string', analyzer: 'lucene.turkish' }
              }
            }
          }
        }
      }
    }
  },
  {
    collection: 'experiences',
    spec: {
      name: 'experiences_search',
      type: 'search',
      definition: {
        analyzer: 'lucene.turkish',
        searchAnalyzer: 'lucene.turkish',
        mappings: {
          dynamic: false,
          fields: {
            name: [
              { type: 'string', analyzer: 'lucene.turkish' },
              {
                type: 'autocomplete',
                analyzer: 'lucene.standard',
                tokenization: 'edgeGram',
                minGrams: 2,
                maxGrams: 10
              }
            ],
            description: { type: 'string', analyzer: 'lucene.turkish' },
            highlights: { type: 'string', analyzer: 'lucene.turkish' },
            city: { type: 'string', analyzer: 'lucene.turkish' },
            region: { type: 'string', analyzer: 'lucene.turkish' },
            tags: { type: 'string', analyzer: 'lucene.turkish' },
            category: { type: 'token' },
            difficulty: { type: 'token' },
            duration: { type: 'string', analyzer: 'lucene.turkish' },
            price: { type: 'number' },
            rating: { type: 'number' }
          }
        }
      }
    }
  },
  {
    collection: 'destinations',
    spec: {
      name: 'destinations_vector',
      type: 'vectorSearch',
      definition: {
        fields: [
          { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' },
          { type: 'filter', path: 'category' },
          { type: 'filter', path: 'region' },
          { type: 'filter', path: 'rating' }
        ]
      }
    }
  },
  {
    collection: 'experiences',
    spec: {
      name: 'experiences_vector',
      type: 'vectorSearch',
      definition: {
        fields: [
          { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' },
          { type: 'filter', path: 'category' },
          { type: 'filter', path: 'region' },
          { type: 'filter', path: 'difficulty' }
        ]
      }
    }
  },
  {
    collection: 'hotels',
    spec: {
      name: 'hotels_vector',
      type: 'vectorSearch',
      definition: {
        fields: [
          { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' },
          { type: 'filter', path: 'type' },
          { type: 'filter', path: 'region' },
          { type: 'filter', path: 'stars' },
          { type: 'filter', path: 'pricePerNight' },
          { type: 'filter', path: 'category' },
          { type: 'filter', path: 'destinationSlug' },
          { type: 'filter', path: 'beach.isBeachfront' }
        ]
      }
    }
  }
];

print(`Using database: ${DB_NAME}\n`);
indexes.forEach(({ collection, spec }) => upsertSearchIndex(collection, spec));
print('\nSubmitted all index create/update requests.');
print('Index builds are asynchronous. Check status below or again in Atlas in a minute.\n');
printIndexes('destinations');
printIndexes('hotels');
printIndexes('experiences');
