# Monolith → 4 App Mapping

Eski yapıdaki dosyalar şu şekilde bölündü:

- `app/server.js` → her app altında ayrı `server.js`
- `app/public/*` → her app altında ayrı `public/`
- `app/routes/*` → `shared/routes/`
- `app/utils/*` → `shared/utils/`
- `app/data/*` → `shared/data/`
- `app/db.js` → `shared/db.js`

## Route Dağılımı

- V1 app → `shared/routes/v1-traditional.js`
- V2 app → `shared/routes/v2-atlas-search.js`
- V3 app → `shared/routes/v3-hybrid.js`
- V4 app → `shared/routes/v4-rag.js`
- Ortak seed → `shared/routes/seed.js`

## Neden Bu Yapı?

- Workshop sırasında her aşamayı ayrı bir servis olarak göstermek kolaylaşır.
- Katılımcılar sadece ilgili sürümü açarak odaklı ilerler.
- Docker/compose ile her sürüm bağımsız ayağa kalkar.
- Ortak veri ve route mantığı tek yerde tutulur.
