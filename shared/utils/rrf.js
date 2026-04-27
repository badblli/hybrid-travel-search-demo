function fuseRankedLists(textResults = [], vectorResults = [], alpha = 0.7, k = 60) {
  const scores = new Map();
  const docs = new Map();

  textResults.forEach((doc, idx) => {
    const id = String(doc._id);
    docs.set(id, { ...(docs.get(id) || {}), ...doc, _textRank: idx + 1, _textScore: doc.score || doc.textScore });
    scores.set(id, (scores.get(id) || 0) + alpha / (k + idx + 1));
  });

  vectorResults.forEach((doc, idx) => {
    const id = String(doc._id);
    docs.set(id, { ...(docs.get(id) || {}), ...doc, _vectorRank: idx + 1, _vectorScore: doc.vectorScore });
    scores.set(id, (scores.get(id) || 0) + (1 - alpha) / (k + idx + 1));
  });

  return Array.from(scores.entries())
    .map(([id, score]) => ({ ...docs.get(id), _rrfScore: score }))
    .sort((a, b) => b._rrfScore - a._rrfScore);
}

module.exports = { fuseRankedLists };
