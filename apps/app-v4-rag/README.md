# Travel Lab V4 — RAG

Bu uygulama split yapının **V4 — RAG AI Asistan** sürümüdür.

## Çalıştırma

```bash
npm install
npm start
```

veya repo kökünden:

```bash
docker compose up --build app-v4-rag
```

## Endpointler

- `GET /api/health`
- `POST /api/seed`
- `POST /api/v4/search`

- `POST /api/v4/rag`

## Not

Bu app ortak veri, route ve util dosyalarını `shared/` altından kullanır.
