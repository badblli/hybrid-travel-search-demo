# Hybrid Travel Search Demo

Hands-on MongoDB AI search workshop with traditional search, Atlas Search, vector search, hybrid search, and RAG using OpenAI or Gemini.

## What This Project Shows

This repo contains four small travel-search apps that share the same dataset and UI style:

- V1 Traditional Search: MongoDB `find()` and regex search
- V2 Atlas Search: text search and autocomplete with Atlas Search
- V3 Hybrid Search: Atlas Search plus vector search with rank fusion
- V4 RAG: hybrid retrieval plus an LLM answer grounded in retrieved travel data

The demo dataset includes Turkish destinations, hotels, and experiences.

## Requirements

- Node.js 18+
- Docker Desktop
- MongoDB local or Atlas
- Optional: OpenAI API key or Gemini API key for embeddings and RAG

## Environment Setup

Create your local `.env` from the example:

```bash
cp .env.example .env
```

Then fill the provider you want to use:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_key
```

or:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_openai_key
```

Do not commit `.env`. It is ignored by Git.

## Run With Docker

```bash
docker compose up --build
```

The Compose setup starts MongoDB and all four apps:

| App | URL |
| --- | --- |
| V1 Traditional Search | http://localhost:3001 |
| V2 Atlas Search | http://localhost:3002 |
| V3 Hybrid Search | http://localhost:3003 |
| V4 RAG | http://localhost:3004 |

Docker containers use:

```env
MONGODB_URI=mongodb://mongo:27017/travel_lab
DB_NAME=travel_lab
```

To run the Docker apps against MongoDB Atlas instead, set this in `.env`:

```env
DOCKER_MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/travel_lab?retryWrites=true&w=majority
DB_NAME=travel_lab
```

## Share On The Same Network

The apps listen on `0.0.0.0` and Docker publishes the ports, so another device on the same network can open the apps using your computer's IP address.

Find your IP on Windows:

```powershell
ipconfig
```

Look for the `IPv4 Address` under Wi-Fi or Ethernet. If your IP is `192.168.1.34`, your teammate can open:

```text
http://192.168.1.34:3001
http://192.168.1.34:3002
http://192.168.1.34:3003
http://192.168.1.34:3004
```

If `localhost` works for you but the IP does not work for your teammate, check Windows Firewall or router/client isolation settings.

## Local Run Without Docker

Install dependencies:

```bash
npm install
```

Start a specific app:

```bash
node apps/app-v1-traditional/server.js
```

For local MongoDB, use:

```env
MONGODB_URI=mongodb://localhost:27017/travel_lab
DB_NAME=travel_lab
```

## Run V2/V3/V4 With MongoDB Atlas

Local MongoDB Community does not support the `$search` and `$vectorSearch` aggregation stages used by V2, V3, and V4. Use MongoDB Atlas for the full demo.

1. In Atlas, open your project and create or select an M0/Flex cluster.

2. Create a database user:

   Atlas sidebar -> Database Access -> Add New Database User.

3. Allow your IP:

   Atlas sidebar -> Network Access -> Add IP Address -> Add Current IP Address.

   For a workshop/demo network you can temporarily use `0.0.0.0/0`, but remove it afterward.

4. Copy the connection string:

   Atlas -> Database -> Connect -> Drivers -> copy the `mongodb+srv://...` URI.

5. Update `.env`:

   ```env
   DB_NAME=travel_lab
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/travel_lab?retryWrites=true&w=majority
   DOCKER_MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/travel_lab?retryWrites=true&w=majority
   LLM_PROVIDER=gemini
   GEMINI_API_KEY=your_gemini_key
   EMBEDDING_DIMENSIONS=1536
   ```

6. Seed the Atlas database with embeddings:

   ```bash
   docker compose up --build
   ```

   The `startup-init` service calls `/api/seed?embeddings=true`. You can also click the seed button in the UI.

7. Create Atlas Search and Vector Search indexes.

   If you have `mongosh` installed locally:

   ```bash
   mongosh "mongodb+srv://<user>:<password>@<cluster-host>/travel_lab" shared/scripts/create-travel-lab-indexes.js
   ```

   Or run it through Docker:

   ```bash
   docker compose run --rm startup-init
   ```

8. Wait in Atlas until the indexes are queryable:

   Atlas -> your cluster -> Search & Vector Search.

The project creates these search indexes:

- `destinations_search`
- `hotels_search`
- `experiences_search`
- `destinations_vector`
- `hotels_vector`
- `experiences_vector`

After this, open:

```text
http://localhost:3002
http://localhost:3003
http://localhost:3004
```

## Notes

V1 works with regular local MongoDB. V2, V3, and V4 use Atlas Search and Atlas Vector Search stages, so their full search behavior is meant for MongoDB Atlas with the search indexes created.

Gemini and OpenAI are both supported. Keep `EMBEDDING_DIMENSIONS` aligned with the Atlas Vector Search index definition.
