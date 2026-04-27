# Travel Lab V1 — Traditional Search

Bu uygulama split yapının **V1 — Geleneksel Arama** sürümüdür.

## Çalıştırma

```bash
npm install
npm start
```

veya repo kökünden:

```bash
docker compose up --build app-v1-traditional
```

## Endpointler

- `GET /api/health`
- `POST /api/seed`
- `POST /api/v1/search`



## Not

Bu app ortak veri, route ve util dosyalarını `shared/` altından kullanır.
