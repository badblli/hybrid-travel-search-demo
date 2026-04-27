# Travel Lab V3 — Hybrid Search

Bu uygulama split yapının **V3 — Hybrid Search** sürümüdür.

## Çalıştırma

```bash
npm install
npm start
```

veya repo kökünden:

```bash
docker compose up --build app-v3-hybrid-search
```

## Endpointler

- `GET /api/health`
- `POST /api/seed`
- `POST /api/v3/search`
- `GET /api/v3/autocomplete`


## Not

Bu app ortak veri, route ve util dosyalarını `shared/` altından kullanır.
