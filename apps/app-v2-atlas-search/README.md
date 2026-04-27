# Travel Lab V2 — Atlas Search

Bu uygulama split yapının **V2 — Atlas Search** sürümüdür.

## Çalıştırma

```bash
npm install
npm start
```

veya repo kökünden:

```bash
docker compose up --build app-v2-atlas-search
```

## Endpointler

- `GET /api/health`
- `POST /api/seed`
- `POST /api/v2/search`



## Not

Bu app ortak veri, route ve util dosyalarını `shared/` altından kullanır.
