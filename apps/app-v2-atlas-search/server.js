const express = require('express');
const path = require('path');
require('dotenv').config();

const { connect } = require('../../shared/db');
const { hasGemini } = require('../../shared/utils/embeddings');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'app-v2-atlas-search',
    version: 'v2',
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    hasGemini: hasGemini(),
    hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
    llmProvider: process.env.LLM_PROVIDER || 'openai',
    dbName: process.env.DB_NAME || 'travel_lab',
  });
});

app.use('/api/seed', require('../../shared/routes/seed'));
app.use('/api/v2', require('../../shared/routes/v2-atlas-search'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

const PORT = process.env.PORT || 3000;
(async function start() {
  try {
    await connect();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Travel Lab V2 — Atlas Search running on http://localhost:${PORT}`);
      console.log(`POST /api/seed`);
      console.log(`POST /api/v2/search`);
      
      
    });
  } catch (err) {
    console.error('❌ Failed to start:', err.message);
    process.exit(1);
  }
})();
