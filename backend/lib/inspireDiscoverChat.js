/**
 * Discover chatbot — embed user query, retrieve use cases from __inspire_usecase_search, answer with FM.
 */

function splitInspireDatabase(inspire_database) {
  const s = String(inspire_database || '').trim();
  if (!s || !s.includes('.')) return null;
  const [catalog, schema] = s.split('.', 2);
  if (!catalog || !schema) return null;
  return { catalog, schema };
}

function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : -1;
}

function parseChunkMeta(chunkText) {
  const text = String(chunkText || '');
  const pick = (label) => {
    const re = new RegExp(`^${label}:\\s*(.+)$`, 'im');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };
  return {
    title: pick('Use case') || pick('Title') || pick('Short name'),
    domain: pick('Domain'),
    technique: pick('Technique'),
  };
}

function parseEmbedding(raw) {
  if (Array.isArray(raw)) return raw.map(Number);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(Number) : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function embedTexts(dbFetch, host, token, texts, model = 'databricks-gte-large-en') {
  const resp = await dbFetch(host, token, `/serving-endpoints/${encodeURIComponent(model)}/invocations`, {
    method: 'POST',
    body: JSON.stringify({ input: texts }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Embedding failed (${resp.status}): ${err.slice(0, 400)}`);
  }
  const data = await resp.json();
  const vectors = [];
  if (data?.data) {
    for (const item of data.data) {
      vectors.push(item.embedding || item);
    }
  } else if (Array.isArray(data)) {
    for (const item of data) {
      vectors.push(item.embedding || item);
    }
  } else {
    throw new Error('Unexpected embedding API response');
  }
  return vectors;
}

/**
 * @param {Function} executeSql - (host, token, warehouseId, sql) => result
 * @param {Function} sqlResultToObjects
 */
async function searchUseCaseChunks(
  executeSql,
  sqlResultToObjects,
  host,
  token,
  warehouseId,
  inspireDatabase,
  { sessionId, limit = 400, topK = 8 },
) {
  const parsed = splitInspireDatabase(inspireDatabase);
  if (!parsed) throw new Error('inspire_database must be catalog._inspire');
  const { catalog, schema } = parsed;
  const table = `\`${catalog}\`.\`${schema}\`.\`__inspire_usecase_search\``;

  let sql = `SELECT id, session_id, usecase_id, business_name, business_domain, priority_score, chunk_text, embedding FROM ${table}`;
  if (sessionId != null && String(sessionId).trim() !== '') {
    sql += ` WHERE session_id = ${String(sessionId).trim()}`;
  }
  sql += ` ORDER BY synced_at DESC NULLS LAST LIMIT ${Math.min(Math.max(limit, 1), 1000)}`;

  const result = await executeSql(host, token, warehouseId, sql);
  return sqlResultToObjects(result);
}

async function chatDiscoverUseCases(
  dbFetch,
  executeSql,
  sqlResultToObjects,
  host,
  token,
  {
    message,
    inspire_database,
    warehouse_id,
    session_id,
    embedding_model = process.env.INSPIRE_EMBEDDING_MODEL || 'databricks-gte-large-en',
    chat_model = process.env.INSPIRE_CHAT_MODEL || 'databricks-claude-sonnet-4',
    top_k = 8,
  },
) {
  const query = String(message || '').trim();
  if (!query) throw new Error('message is required');
  if (!inspire_database || !warehouse_id) {
    throw new Error('inspire_database and warehouse_id are required');
  }

  const [queryVec] = await embedTexts(dbFetch, host, token, [query], embedding_model);

  const parsed = splitInspireDatabase(inspire_database);
  const searchTablePath = parsed
    ? `${parsed.catalog}.${parsed.schema}.__inspire_usecase_search`
    : inspire_database;
  const tableFqn = parsed
    ? `\`${parsed.catalog}\`.\`${parsed.schema}\`.\`__inspire_usecase_search\``
    : null;

  let globalIndexedCount = 0;
  if (tableFqn) {
    try {
      const countResult = await executeSql(
        host,
        token,
        warehouse_id,
        `SELECT COUNT(*) AS cnt FROM ${tableFqn}`,
      );
      const countRows = sqlResultToObjects(countResult);
      globalIndexedCount = Number(countRows[0]?.cnt || 0);
    } catch (err) {
      const missing =
        err.message?.includes('TABLE_OR_VIEW_NOT_FOUND') || err.message?.includes('does not exist');
      if (!missing) throw err;
    }
  }

  const rows = await searchUseCaseChunks(
    executeSql,
    sqlResultToObjects,
    host,
    token,
    warehouse_id,
    inspire_database,
    { sessionId: session_id, limit: 500, topK: top_k },
  );

  if (!globalIndexedCount) {
    return {
      answer:
        `No indexed use cases found. Sync **${searchTablePath}** from your \`__inspire_usecases\` table (runs the **dbx_inspire_embed_usecases** notebook), then try again.`,
      sources: [],
      indexed_count: 0,
      needs_sync: true,
      search_table: searchTablePath,
    };
  }

  if (!rows.length) {
    const scoped = session_id != null && String(session_id).trim() !== '';
    return {
      answer: scoped
        ? `No indexed use cases for experiment **${session_id}**. Try **All experiments** in the dropdown, or run Inspire discovery for this session first, then sync the index.`
        : `The search index exists (${globalIndexedCount} row(s)) but nothing matched your filters.`,
      sources: [],
      indexed_count: 0,
      needs_sync: false,
      global_indexed_count: globalIndexedCount,
      search_table: searchTablePath,
    };
  }

  const scored = rows
    .map((row) => {
      const emb = parseEmbedding(row.embedding);
      return {
        row,
        score: emb ? cosineSimilarity(queryVec, emb) : -1,
      };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top_k);

  const contextBlocks = scored.map((s, i) => {
    const r = s.row;
    return `[${i + 1}] (session ${r.session_id}, score ${s.score.toFixed(3)})\n${r.chunk_text}`;
  });

  const system = `You are Inspire AI Discover Assistant. Help the user explore Databricks use cases already discovered and stored in Unity Catalog.
Use ONLY the provided use case excerpts. If the answer is not in the excerpts, say what is missing and suggest running Inspire on more tables.
Be concise. Reference sources by [1], [2], etc. Suggest concrete next steps (tables, domains, priorities).`;

  const userContent = `User question:\n${query}\n\nUse case excerpts:\n${contextBlocks.join('\n\n')}`;

  const chatResp = await dbFetch(host, token, '/serving-endpoints/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: chat_model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      max_tokens: 4096,
    }),
  });

  if (!chatResp.ok) {
    const err = await chatResp.text();
    throw new Error(`Chat model failed (${chatResp.status}): ${err.slice(0, 400)}`);
  }

  const chatData = await chatResp.json();
  const answer =
    chatData?.choices?.[0]?.message?.content ||
    chatData?.messages?.[0]?.content ||
    'No response from model.';

  return {
    answer,
    needs_sync: false,
    search_table: searchTablePath,
    sources: scored.map((s, i) => {
      const meta = parseChunkMeta(s.row.chunk_text);
      return {
        rank: i + 1,
        id: s.row.id,
        session_id: s.row.session_id,
        usecase_id: s.row.usecase_id,
        business_name: s.row.business_name,
        business_domain: s.row.business_domain || meta.domain,
        title: meta.title,
        technique: meta.technique,
        score: s.score,
        preview: String(s.row.chunk_text || '').slice(0, 280),
      };
    }),
    indexed_count: rows.length,
  };
}

module.exports = {
  chatDiscoverUseCases,
  searchUseCaseChunks,
  embedTexts,
};
