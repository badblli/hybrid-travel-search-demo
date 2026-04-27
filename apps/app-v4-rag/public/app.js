window.APP_VERSION = 'v4';
// ============================================================
// Travel Discovery Lab — Frontend App
// Handles V1-V4 modes, search, autocomplete, RAG chat
// ============================================================

// ─── State ───────────────────────────────────────────────────
const state = {
  version: window.APP_VERSION || 'v1',
  query: '',
  collection: 'destinations',
  filters: { stars: [], ratingBuckets: [], amenities: [], priceBuckets: [] },
  lastMeta: null,
  ragHistory: [],
  autocompleteTimer: null,
  queryViews: { text: null, vector: null, facets: null, response: null, rag: null },
  activeQueryTab: 'text',
};

// ─── Version Config ───────────────────────────────────────────
const VERSION_CONFIG = {
  v1: {
    label: 'V1 — Geleneksel Arama',
    desc: 'MongoDB find() + $regex — Anahtar kelime eşleşmesi, önem sıralaması yok',
    badges: [
      { text: 'Typo Yok', cls: 'badge-red' },
      { text: 'Semantik Yok', cls: 'badge-red' },
      { text: 'Sıralama Yok', cls: 'badge-red' },
      { text: 'Basit Kurulum', cls: 'badge-green' },
    ],
    quickTags: ['İstanbul', 'plaj', 'lüks', 'tarihi', 'doğa', 'otel'],
  },
  v2: {
    label: 'V2 — Atlas Search',
    desc: '$search pipeline — Lucene analyzer, fuzzy, boost, autocomplete, facets',
    badges: [
      { text: 'Fuzzy Match', cls: 'badge-green' },
      { text: 'Sıralama', cls: 'badge-green' },
      { text: 'Facets', cls: 'badge-green' },
      { text: 'Semantik Yok', cls: 'badge-red' },
    ],
    quickTags: ['Kapadoya', 'romantk', 'İstanbul', 'balon', 'UNESCO', 'macera'],
  },
  v3: {
    label: 'V3 — Hybrid Search',
    desc: 'Atlas Search + Vector Search + RRF Fusion — Semantik anlama',
    badges: [
      { text: 'Semantik', cls: 'badge-green' },
      { text: 'RRF Fusion', cls: 'badge-blue' },
      { text: 'Niyet Anlama', cls: 'badge-green' },
      { text: 'OpenAI Gerekli', cls: 'badge-gold' },
    ],
    quickTags: ['romantik kaçamak', 'çocuklar için', 'macera dolu tatil', 'kültür turu', 'deniz ve güneş'],
  },
  v4: {
    label: 'V4 — RAG AI Asistan',
    desc: 'Hybrid Retrieval + LLM Generation — Grounded AI yanıtları',
    badges: [
      { text: 'Grounded AI', cls: 'badge-gold' },
      { text: 'Kaynak Atıf', cls: 'badge-green' },
      { text: 'Çok Dönüşlü', cls: 'badge-blue' },
      { text: 'LLM Gerekli', cls: 'badge-gold' },
    ],
    quickTags: ['7 gün Türkiye rotası', 'balayı planı', 'bütçe seyahati', 'kültür ve tarih'],
  },
};

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  setInterval(checkHealth, 30000);
  switchVersion(state.version);
  renderQuickTags(state.version);
});

// ─── Health Check ─────────────────────────────────────────────
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    document.querySelector('.health-dot').className = 'health-dot ok';
    document.getElementById('healthText').textContent =
      `Connected · ${data.hasOpenAI ? 'OpenAI ✓' : 'No OpenAI'} · ${data.hasGemini ? 'Gemini ✓' : ''} · ${data.hasAnthropic ? 'Anthropic ✓' : ''}`;
  } catch {
    document.querySelector('.health-dot').className = 'health-dot error';
    document.getElementById('healthText').textContent = 'Bağlantı hatası';
  }
}

// ─── Version Switching ─────────────────────────────────────────
function switchVersion(version) {
  state.version = version;
  state.ragHistory = [];

  // Update tabs
  document.querySelectorAll('.version-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.version === version);
  });

  // Update banner
  const cfg = VERSION_CONFIG[version];
  document.getElementById('bannerVersion').textContent = cfg.label;
  document.getElementById('bannerDesc').textContent = cfg.desc;
  const badgesEl = document.getElementById('bannerBadges');
  badgesEl.innerHTML = cfg.badges.map((b) => `<span class="badge ${b.cls}">${b.text}</span>`).join('');

  // Show/hide version-specific UI
  document.getElementById('ragPanel').style.display = version === 'v4' ? 'block' : 'none';
  document.getElementById('alphaSection').style.display = version === 'v3' ? 'block' : 'none';
  document.getElementById('ragConversation').innerHTML = '';

  // Update quick tags
  renderQuickTags(version);

  // Re-search if there's a query
  if (state.query) performSearch();
}

// ─── Seed Database ────────────────────────────────────────────
async function seedDatabase() {
  const btn = document.getElementById('seedBtn');
  if (!btn) {
    showToast('Seed işlemi artık otomatik başlatılıyor.');
    return;
  }

  btn.classList.add('loading');
  btn.innerHTML = '<span class="seed-icon">⟳</span> Yükleniyor...';

  try {
    const health = await fetch('/api/health').then((r) => r.json());
    const withEmbeddings = health.hasOpenAI || health.hasGemini;

    const url = `/api/seed${withEmbeddings ? '?embeddings=true' : ''}`;
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      showToast(
        `✅ ${data.destinations} destinasyon, ${data.hotels} otel, ${data.experiences} deneyim yüklendi` +
          (data.embeddingsGenerated ? ' (embedding dahil)' : ' (embedding olmadan)')
      );
    } else {
      showToast('❌ Seed hatası: ' + data.error, true);
    }
  } catch (err) {
    showToast('❌ ' + err.message, true);
  } finally {
    btn.classList.remove('loading');
    btn.innerHTML = '<span class="seed-icon">⟳</span> Veritabanını Yükle';
  }
}

// ─── Search ───────────────────────────────────────────────────
function handleSearchKeyup(e) {
  const val = document.getElementById('searchInput').value;
  document.getElementById('searchClear').style.display = val ? 'block' : 'none';
  if (e.key === 'Enter') {
    closeAutocomplete();
    performSearch();
  }
  if (e.key === 'Escape') closeAutocomplete();
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').style.display = 'none';
  state.query = '';
  closeAutocomplete();
  renderResults([], null);
}

function quickSearch(q) {
  document.getElementById('searchInput').value = q;
  document.getElementById('searchClear').style.display = 'block';
  state.query = q;
  performSearch();
}

function ragQuery(q) {
  document.getElementById('ragInput').value = q;
  sendRagQuery();
}

async function performSearch() {
  const query = document.getElementById('searchInput').value.trim();
  state.query = query;

  const collection = document.querySelector('input[name="collection"]:checked')?.value || 'destinations';
  state.collection = collection;

  const filters = collectFacetFilters();
  state.filters = filters;

  // Show loading
  renderLoading();

  try {
    const endpoint = `/api/${state.version}/search`;
    const body = { query, collection, filters };
    if (state.version === 'v3') {
      body.alpha = parseFloat(document.getElementById('alphaSlider').value);
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    state.lastMeta = data.meta;

    if (!res.ok) {
      showError(data.error, data.indexSetup);
      return;
    }

    renderResults(data.results, data.meta);
    renderFacets(data.meta?.facets || null);
    updateQueryViewer({
      text: data.meta?.pipeline?.textPipeline || data.meta?.textPipeline || null,
      vector: data.meta?.pipeline?.vectorPipeline || data.meta?.vectorPipeline || null,
      facets: data.meta?.facetPipeline || null,
      response: data.meta?.facetResponse || null,
      rag: data.meta?.pipeline?.stage || data.meta?.pipeline?.notes ? data.meta?.pipeline : null,
    });
  } catch (err) {
    showError(err.message);
  }
}

function handleCollectionChange(input) {
  document.querySelectorAll('.radio-option').forEach((el) => {
    el.classList.toggle('active', el.contains(input));
  });
  renderFacets(null);
  if (state.query) performSearch();
}

function collectFacetFilters() {
  const readChecked = (name) => Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => el.value);
  return {
    stars: readChecked('facet-stars'),
    ratingBuckets: readChecked('facet-rating'),
    amenities: readChecked('facet-amenities'),
    priceBuckets: readChecked('facet-price'),
  };
}

function renderFacets(facets) {
  const section = document.getElementById('facetSection');
  const menu = document.getElementById('facetMenu');
  if (!section || !menu) return;

  if (state.collection !== 'hotels') {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  if (!facets) {
    menu.innerHTML = '<div class="facet-empty">Facetler otel aramasından sonra burada görünür</div>';
    return;
  }

  const sectionHtml = (title, name, items, selected = []) => `
    <div class="facet-group">
      <div class="facet-group-title">${title}</div>
      <div class="facet-options">
        ${items.length ? items.map((item) => `
          <label class="facet-option">
            <input type="checkbox" name="${name}" value="${item.value}" ${selected.includes(item.value) ? 'checked' : ''} onchange="performSearch()" />
            <span class="facet-option-label">${item.label || item.value}</span>
            <span class="facet-option-count">${item.count}</span>
          </label>`).join('') : '<div class="facet-empty small">Sonuç yok</div>'}
      </div>
    </div>`;

  menu.innerHTML = [
    sectionHtml('Otel Yıldızı', 'facet-stars', (facets.stars || []).map((x) => ({ ...x, label: `${x.value} yıldız` })), state.filters.stars || []),
    sectionHtml('Hotel Rating', 'facet-rating', (facets.ratings || []).map((x) => ({ ...x, label: x.value })), state.filters.ratingBuckets || []),
    sectionHtml('Amenities', 'facet-amenities', (facets.amenities || []).map((x) => ({ ...x, label: x.value })), state.filters.amenities || []),
    sectionHtml('Price Bucket', 'facet-price', (facets.priceBuckets || []).map((x) => ({ ...x, label: x.value === '240+' ? '>240' : x.value })), state.filters.priceBuckets || []),
    '<button class="facet-clear-btn" onclick="clearFacets()">Facetleri Temizle</button>',
  ].join('');
}

function clearFacets() {
  document.querySelectorAll('#facetMenu input[type="checkbox"]').forEach((el) => { el.checked = false; });
  state.filters = { stars: [], ratingBuckets: [], amenities: [], priceBuckets: [] };
  if (state.query) performSearch();
}

// ─── RAG ─────────────────────────────────────────────────────
async function sendRagQuery() {
  const query = document.getElementById('ragInput').value.trim();
  if (!query) return;

  document.getElementById('ragInput').value = '';
  state.query = query;

  const conversation = document.getElementById('ragConversation');

  // Add user message
  const userMsg = document.createElement('div');
  userMsg.className = 'rag-message user';
  userMsg.textContent = query;
  conversation.appendChild(userMsg);

  // Add loading message
  const loadingMsg = document.createElement('div');
  loadingMsg.className = 'rag-message assistant loading';
  loadingMsg.textContent = '✦ Düşünüyorum...';
  conversation.appendChild(loadingMsg);
  conversation.scrollTop = conversation.scrollHeight;

  try {
    const res = await fetch('/api/v4/rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        collection: document.querySelector('input[name="collection"]:checked')?.value || 'all',
        filters: collectFacetFilters(),
        conversationHistory: state.ragHistory,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'RAG isteği başarısız oldu');
    }

    // Update loading with actual response
    loadingMsg.className = 'rag-message assistant';
    loadingMsg.innerHTML = '';

    const answerEl = document.createElement('div');
    answerEl.textContent = data.answer || '';
    loadingMsg.appendChild(answerEl);

    if (data.sources?.length) {
      const sourcesEl = document.createElement('div');
      sourcesEl.className = 'rag-sources';
      sourcesEl.textContent = '📍 Kaynaklar: ' + data.sources.map((s) => s.name).join(', ');
      loadingMsg.appendChild(sourcesEl);
    }

    // Keep the visible results panel aligned with the grounded RAG retrieval
    state.lastMeta = data.meta || null;
    renderResults(data.results || [], data.meta || null);
    renderFacets(data.meta?.facets || null);

    updateQueryViewer({
      text: data.meta?.pipeline?.textPipeline || data.meta?.textPipeline || null,
      vector: data.meta?.pipeline?.vectorPipeline || data.meta?.vectorPipeline || null,
      facets: data.meta?.facetPipeline || null,
      response: data.meta?.facetResponse || null,
      rag: data.meta?.pipeline || data.meta?.pipelines || null,
    });

    // Update conversation history
    state.ragHistory.push({ role: 'user', content: query });
    state.ragHistory.push({ role: 'assistant', content: data.answer || '' });

    conversation.scrollTop = conversation.scrollHeight;
  } catch (err) {
    loadingMsg.className = 'rag-message assistant';
    loadingMsg.textContent = `❌ ${err.message}`;
    conversation.scrollTop = conversation.scrollHeight;
  }
}

// ─── Autocomplete ─────────────────────────────────────────────
function handleAutocomplete(value) {
  clearTimeout(state.autocompleteTimer);
  if (!value || value.length < 2 || state.version === 'v1') {
    closeAutocomplete();
    return;
  }
  state.autocompleteTimer = setTimeout(() => fetchAutocomplete(value), 250);
}

async function fetchAutocomplete(q) {
  const collection = document.querySelector('input[name="collection"]:checked')?.value || 'destinations';
  try {
    const res = await fetch(`/api/${state.version}/autocomplete?q=${encodeURIComponent(q)}&collection=${collection}`);
    const items = await res.json();
    renderAutocomplete(items);
  } catch {
    closeAutocomplete();
  }
}

function renderAutocomplete(items) {
  const dropdown = document.getElementById('autocompleteDropdown');
  if (!items.length) { closeAutocomplete(); return; }
  dropdown.innerHTML = items.map((item) => `
    <div class="autocomplete-item" onclick="selectAutocomplete('${item.label.replace(/'/g, "\\'")}')">
      <span class="autocomplete-label">${item.label}</span>
      <span class="autocomplete-sublabel">${item.sublabel || ''}</span>
    </div>
  `).join('');
  dropdown.classList.add('open');
}

function selectAutocomplete(label) {
  document.getElementById('searchInput').value = label;
  document.getElementById('searchClear').style.display = 'block';
  closeAutocomplete();
  performSearch();
}

function closeAutocomplete() {
  document.getElementById('autocompleteDropdown').classList.remove('open');
}

// ─── Render Results ───────────────────────────────────────────
function renderResults(results, meta) {
  _currentResults = results || [];

  const grid = document.getElementById('resultsGrid');
  const metaEl = document.getElementById('resultsMeta');

  if (meta) {
    document.getElementById('resultsCount').textContent = `${meta.count} sonuç`;
    document.getElementById('resultsTime').textContent = meta.elapsed ? `· ${meta.elapsed}ms` : '';
    const notesEl = document.getElementById('metaNotes');
    notesEl.innerHTML = (meta.notes || [])
      .slice(0, 2)
      .map((n) => `<span class="badge ${n.startsWith('✅') ? 'badge-green' : n.startsWith('⚠') ? 'badge-red' : 'badge-blue'}">${n.replace(/^[✅⚠️⚙️]\s*/, '')}</span>`)
      .join('');
  }

  if (!results.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">Sonuç bulunamadı</div>
        <div class="empty-desc">Farklı bir arama terimi deneyin${state.version === 'v1' ? ' ya da V2\'ye geçerek fuzzy arama kullanın' : ''}</div>
      </div>`;
    return;
  }

  grid.innerHTML = results
    .map((doc, i) => renderCard(doc, i))
    .join('');
}

function renderCard(doc, index) {
  const emoji = getEmoji(doc);
  const col = doc._collection || 'destinations';
  const colLabel = { destinations: 'Destinasyon', hotels: 'Otel', experiences: 'Deneyim' }[col] || col;
  const location = [doc.city, doc.region || doc.neighborhood].filter(Boolean).join(' · ');
  const price = doc.pricePerNight ? `$${doc.pricePerNight}/gece` : doc.price ? `$${doc.price}/kişi` : '';
  const tags = (doc.tags || []).slice(0, 4);
  const score = doc.score ? doc.score.toFixed(4) : null;

  return `
    <div class="result-card" onclick="showModal(${index})" style="animation-delay:${index * 0.05}s">
      <div class="card-image-placeholder">
        <span>${emoji}</span>
        <div class="card-badge-row">
          ${score ? `<span class="badge badge-blue">score: ${parseFloat(score).toFixed(3)}</span>` : ''}
        </div>
      </div>
      <div class="card-body">
        <div class="card-collection">${colLabel}</div>
        <div class="card-name">${doc.name}</div>
        ${location ? `<div class="card-location">📍 ${location}</div>` : ''}
        <div class="card-tags">${tags.map((t) => `<span class="card-tag">${t}</span>`).join('')}</div>
        <div class="card-desc">${doc.description || ''}</div>
        <div class="card-footer">
          <div class="card-rating">★ ${doc.rating || '—'}</div>
          ${price ? `<span class="card-price">${price}</span>` : ''}
          ${doc.duration ? `<span class="card-price">⏱ ${doc.duration}</span>` : ''}
        </div>
      </div>
    </div>`;
}

// Store results globally for modal
let _currentResults = [];

// ─── Modal ────────────────────────────────────────────────────
function showModal(index) {
  const doc = _currentResults[index];
  if (!doc) return;

  const col = doc._collection || 'destinations';
  const location = [doc.city, doc.region, doc.neighborhood].filter(Boolean).join(' · ');
  const price = doc.pricePerNight ? `$${doc.pricePerNight} / gece` : doc.price ? `$${doc.price} / kişi` : '';

  document.getElementById('modalContent').innerHTML = `
    <div class="card-collection">${col}</div>
    <div class="modal-title">${doc.name}</div>
    <div class="modal-subtitle">📍 ${location}${price ? '  ·  💰 ' + price : ''}${doc.rating ? '  ·  ★ ' + doc.rating : ''}</div>
    <div class="modal-desc">${doc.description || ''}</div>
    ${doc.highlights?.length ? `
      <div class="modal-section-label">Öne Çıkanlar</div>
      <div class="modal-highlights">${doc.highlights.map((h) => `<span class="modal-highlight">${h}</span>`).join('')}</div>` : ''}
    ${doc.amenities?.length ? `
      <div class="modal-section-label">Olanaklar</div>
      <div class="modal-tags">${doc.amenities.map((a) => `<span class="card-tag">${a}</span>`).join('')}</div>` : ''}
    ${doc.includes?.length ? `
      <div class="modal-section-label">Dahil</div>
      <div class="modal-tags">${doc.includes.map((i) => `<span class="card-tag">✓ ${i}</span>`).join('')}</div>` : ''}
    ${doc.tags?.length ? `
      <div class="modal-section-label">Etiketler</div>
      <div class="modal-tags">${doc.tags.map((t) => `<span class="card-tag">${t}</span>`).join('')}</div>` : ''}
    ${doc.bestSeason?.length ? `<div class="modal-section-label">En İyi Sezon</div>
      <div class="modal-tags">${doc.bestSeason.map((s) => `<span class="card-tag">🌤 ${s}</span>`).join('')}</div>` : ''}
    ${doc.score ? `<div class="modal-section-label">Arama Skoru</div>
      <code style="font-size:0.75rem;color:var(--blue)">${doc.score}</code>` : ''}
  `;

  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}


// ─── Query Drawer ─────────────────────────────────────────────
function openQueryDrawer() {
  document.getElementById('queryDrawer')?.classList.add('open');
  document.getElementById('queryDrawerOverlay')?.classList.add('open');
  document.body.classList.add('drawer-open');
}

function closeQueryDrawer() {
  document.getElementById('queryDrawer')?.classList.remove('open');
  document.getElementById('queryDrawerOverlay')?.classList.remove('open');
  document.body.classList.remove('drawer-open');
}

// ─── Query Viewer ─────────────────────────────────────────────
function prettyCode(obj) {
  if (!obj) return '<span class="code-comment">// Bu görünüm için veri yok</span>';
  return JSON.stringify(obj, null, 2)
    .replace(/"([^"]+)":/g, '<span class="code-key">"$1"</span>:')
    .replace(/: "([^"]+)"/g, ': <span class="code-str">"$1"</span>')
    .replace(/: (\d+\.?\d*)/g, ': <span class="code-num">$1</span>');
}

function getAvailableQueryTabs() {
  const tabs = [];
  if (state.queryViews?.text) tabs.push({ key: 'text', label: 'Text Query' });
  if (state.queryViews?.vector) tabs.push({ key: 'vector', label: 'Vector Query' });
  if (state.queryViews?.facets) tabs.push({ key: 'facets', label: 'Facet Query' });
  if (state.queryViews?.response) tabs.push({ key: 'response', label: 'Facet Response' });
  if (state.queryViews?.rag && state.version === 'v4') tabs.push({ key: 'rag', label: 'RAG Retrieval Meta' });
  if (!tabs.length) {
    return state.version === 'v4'
      ? [
          { key: 'text', label: 'Text Query' },
          { key: 'vector', label: 'Vector Query' },
          { key: 'facets', label: 'Facet Query' },
          { key: 'response', label: 'Facet Response' },
          { key: 'rag', label: 'RAG Retrieval Meta' },
        ]
      : [
          { key: 'text', label: 'Text Query' },
          { key: 'vector', label: 'Vector Query' },
          { key: 'facets', label: 'Facet Query' },
          { key: 'response', label: 'Facet Response' },
        ];
  }
  return tabs;
}

function renderQueryTabs() {
  const tabsEl = document.getElementById('queryDrawerTabs');
  if (!tabsEl) return;
  const tabs = getAvailableQueryTabs();
  if (!tabs.some((t) => t.key === state.activeQueryTab)) {
    state.activeQueryTab = tabs[0]?.key || 'text';
  }
  tabsEl.innerHTML = tabs
    .map((tab) => `<button class="query-tab ${tab.key === state.activeQueryTab ? 'active' : ''}" onclick="switchQueryTab('${tab.key}')">${tab.label}</button>`)
    .join('');
}

function updateQueryViewer(views) {
  state.queryViews = {
    text: views?.text || null,
    vector: views?.vector || null,
    facets: views?.facets || null,
    response: views?.response || null,
    rag: views?.rag || null,
  };
  const tabs = getAvailableQueryTabs();
  if (!tabs.some((t) => t.key === state.activeQueryTab)) {
    state.activeQueryTab = tabs[0]?.key || 'text';
  }
  renderQueryTabs();
  renderActiveQueryTab();
}

function switchQueryTab(tab) {
  state.activeQueryTab = tab;
  renderQueryTabs();
  renderActiveQueryTab();
}

function renderActiveQueryTab() {
  const code = document.getElementById('queryCode');
  if (!code) return;
  const current = state.queryViews?.[state.activeQueryTab];
  code.innerHTML = prettyCode(current);
}

function copyQuery() {
  const current = state.queryViews?.[state.activeQueryTab];
  const text = current ? JSON.stringify(current, null, 2) : '';
  navigator.clipboard.writeText(text).then(() => showToast('📋 Sorgu kopyalandı'));
}

// ─── Filter display ───────────────────────────────────────────
function updateRatingDisplay(val) {
  document.getElementById('ratingDisplay').textContent = val > 0 ? `${val}+` : 'Tümü';
}

function updateAlphaDisplay(val) {
  const label = val < 0.3 ? '(Vektör ağırlıklı)' : val > 0.7 ? '(Metin ağırlıklı)' : '(Dengeli)';
  document.getElementById('alphaDisplay').textContent = `α = ${val} ${label}`;
}

// ─── Quick tags ───────────────────────────────────────────────
function renderQuickTags(version) {
  const tags = VERSION_CONFIG[version]?.quickTags || [];
  document.getElementById('quickTags').innerHTML = tags
    .map((t) => `<button class="quick-tag" onclick="quickSearch('${t}')">${t}</button>`)
    .join('');
}

// ─── Loading skeleton ─────────────────────────────────────────
function renderLoading() {
  const grid = document.getElementById('resultsGrid');
  grid.innerHTML = Array.from({ length: 6 })
    .map(
      (_, i) => `
    <div class="loading-card" style="animation-delay:${i * 0.08}s">
      <div class="loading-card-image skeleton"></div>
      <div class="loading-card-body">
        <div class="skeleton sk-line sk-short"></div>
        <div class="skeleton sk-line sk-title"></div>
        <div class="skeleton sk-line sk-short"></div>
      </div>
    </div>`
    )
    .join('');
}

// ─── Error display ─────────────────────────────────────────────
function showError(message, hint) {
  document.getElementById('resultsGrid').innerHTML = `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">⚠️</div>
      <div class="empty-title" style="color:var(--red)">${message}</div>
      ${hint ? `<div class="empty-desc" style="margin-top:8px;font-size:0.75rem;color:var(--text-muted)">${hint}</div>` : ''}
    </div>`;
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.borderColor = isError ? 'rgba(224,85,85,0.3)' : 'var(--border)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ─── Emoji helper ─────────────────────────────────────────────
function getEmoji(doc) {
  const col = doc._collection || 'destinations';
  if (col === 'hotels') {
    const m = { lüks: '🏰', butik: '🏡', resort: '🌴', termal: '♨️', şehir: '🏙' };
    return m[doc.category] || '🏨';
  }
  if (col === 'experiences') {
    const m = { macera: '🪂', gastronomi: '🍽', kültür: '🎭', doğa: '🌿', deniz: '⛵' };
    return m[doc.category] || '🎫';
  }
  // destinations
  const m = { şehir: '🌆', doğa: '🏔', plaj: '🏖', tarihi: '🏛', kültür: '🎭' };
  return m[doc.category] || '📍';
}
