/**
 * Portal Scanner Service
 * Runs independently of Claude Code using WebSearch via Qwen + Greenhouse APIs
 */
import { readFileSync, existsSync, writeFileSync, appendFileSync } from 'fs';
import { load as yamlLoad } from 'js-yaml';
import { projectPath } from '../utils/paths.js';
import db from '../db/index.js';

// ── Config loading ──────────────────────────────────────────────────────────

function loadPortalsConfig() {
  const path = projectPath('portals.yml');
  if (!existsSync(path)) throw new Error('portals.yml not found');
  return yamlLoad(readFileSync(path, 'utf-8'));
}

// ── Title filtering ─────────────────────────────────────────────────────────

function matchesFilter(title, filter) {
  if (!title) return false;
  const t = title.toLowerCase();
  const hasPositive = filter.positive.some(k => t.includes(k.toLowerCase()));
  const hasNegative = filter.negative.some(k => t.includes(k.toLowerCase()));
  return hasPositive && !hasNegative;
}

function seniorityScore(title, boosts) {
  const t = title.toLowerCase();
  return boosts.filter(k => t.includes(k.toLowerCase())).length;
}

// ── Dedup ───────────────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();

  // From SQLite pipeline_urls
  const pipeline = db.runQuery('SELECT url FROM pipeline_urls');
  pipeline.forEach(r => seen.add(normalizeUrl(r.url)));

  // From SQLite applications
  const apps = db.runQuery('SELECT url FROM applications WHERE url IS NOT NULL');
  apps.forEach(r => seen.add(normalizeUrl(r.url)));

  // From scan-history.tsv
  const histPath = projectPath('data', 'scan-history.tsv');
  if (existsSync(histPath)) {
    const lines = readFileSync(histPath, 'utf-8').split('\n').slice(1); // skip header
    lines.forEach(l => {
      const url = l.split('\t')[0]?.trim();
      if (url) seen.add(normalizeUrl(url));
    });
  }

  return seen;
}

function normalizeUrl(url) {
  return (url || '').trim().replace(/\/$/, '').toLowerCase();
}

// ── Scan history writer ─────────────────────────────────────────────────────

function ensureScanHistory() {
  const path = projectPath('data', 'scan-history.tsv');
  if (!existsSync(path)) {
    writeFileSync(path, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
  return path;
}

function recordToHistory(url, portal, title, company, status) {
  const path = ensureScanHistory();
  const date = new Date().toISOString().split('T')[0];
  appendFileSync(path, `${url}\t${date}\t${portal}\t${title}\t${company}\t${status}\n`, 'utf-8');
}

// ── Pipeline writer ─────────────────────────────────────────────────────────

function addToPipelineMd(url, company, title) {
  const path = projectPath('data', 'pipeline.md');
  appendFileSync(path, `- [ ] ${url} | ${company} | ${title}\n`, 'utf-8');
}

function addToPipelineDb(url, company, role, source) {
  try {
    const existing = db.runQuery('SELECT id FROM pipeline_urls WHERE url = ?', [url]);
    if (existing.length === 0) {
      db.runInsert(
        'INSERT INTO pipeline_urls (url, company, role, source) VALUES (?, ?, ?, ?)',
        [url, company || null, role || null, source || 'scan']
      );
    }
  } catch {}
}

// ── Greenhouse API ──────────────────────────────────────────────────────────

async function fetchGreenhouseApi(company, apiUrl, emit) {
  try {
    emit({ type: 'log', msg: `  → Greenhouse API: ${company}` });
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) { emit({ type: 'log', msg: `    ✗ ${company}: HTTP ${res.status}` }); return []; }
    const data = await res.json();
    const jobs = (data.jobs || []).map(j => ({
      title: j.title,
      url: j.absolute_url,
      company,
      source: `Greenhouse API — ${company}`,
    }));
    emit({ type: 'log', msg: `    ✓ ${company}: ${jobs.length} ofertas` });
    return jobs;
  } catch (err) {
    emit({ type: 'log', msg: `    ✗ ${company}: ${err.message}` });
    return [];
  }
}

// ── WebSearch via DashScope ─────────────────────────────────────────────────

async function webSearch(query, emit) {
  // Qwen supports web search via tool_calls in compatible mode
  // We use a simple approach: ask Qwen to return job listings from the query
  try {
    const { chat } = await import('./llm.js');
    const prompt = `Search for job listings matching this query and return a JSON array of results.
Query: ${query}

Return ONLY a valid JSON array like:
[{"title":"Job Title","url":"https://...","company":"Company Name"}]

Find real, active job listings. Return 3-8 results maximum. Return [] if none found.`;

    const result = await chat([
      { role: 'user', content: prompt }
    ], { maxTokens: 800, temperature: 0.1 });

    const content = result.choices[0]?.message?.content || '[]';
    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const jobs = JSON.parse(jsonMatch[0]);
    return jobs.map(j => ({ ...j, source: `WebSearch: ${query.slice(0, 40)}` }));
  } catch (err) {
    emit({ type: 'log', msg: `    ✗ WebSearch error: ${err.message}` });
    return [];
  }
}

// ── Main scan function ──────────────────────────────────────────────────────

export async function runScan(emit) {
  const config = loadPortalsConfig();
  const { title_filter, tracked_companies = [], search_queries = [] } = config;
  const seen = loadSeenUrls();

  let totalFound = 0;
  let totalFiltered = 0;
  let totalDup = 0;
  let totalAdded = 0;
  const newOffers = [];

  emit({ type: 'start', msg: `Portal Scan — ${new Date().toISOString().split('T')[0]}` });
  emit({ type: 'log', msg: '━━━━━━━━━━━━━━━━━━━━━━━━━━' });

  // ── Level 2: Greenhouse APIs ───────────────────────────────────────────────
  const ghCompanies = tracked_companies.filter(c => c.enabled !== false && c.api);
  emit({ type: 'log', msg: `\n📡 Greenhouse APIs (${ghCompanies.length} empresas)...` });

  const allJobs = [];

  for (const company of ghCompanies) {
    const jobs = await fetchGreenhouseApi(company.name, company.api, emit);
    allJobs.push(...jobs);
    totalFound += jobs.length;
  }

  // ── Level 3: WebSearch queries ─────────────────────────────────────────────
  const queries = search_queries.filter(q => q.enabled !== false).slice(0, 10); // limit to 10 to avoid rate limits
  emit({ type: 'log', msg: `\n🔍 WebSearch queries (${queries.length} queries)...` });

  for (const q of queries) {
    emit({ type: 'log', msg: `  → ${q.name}` });
    const results = await webSearch(q.query, emit);
    allJobs.push(...results.map(r => ({ ...r, source: q.name })));
    totalFound += results.length;
    emit({ type: 'log', msg: `    ✓ ${results.length} resultados` });
  }

  // ── Filter + dedup ─────────────────────────────────────────────────────────
  emit({ type: 'log', msg: `\n🔎 Filtrando ${totalFound} ofertas...` });

  for (const job of allJobs) {
    if (!job.url || !job.title) continue;

    // Title filter
    if (!matchesFilter(job.title, title_filter)) {
      totalFiltered++;
      recordToHistory(job.url, job.source, job.title, job.company, 'skipped_title');
      continue;
    }

    // Dedup
    const norm = normalizeUrl(job.url);
    if (seen.has(norm)) {
      totalDup++;
      recordToHistory(job.url, job.source, job.title, job.company, 'skipped_dup');
      continue;
    }

    // New offer!
    seen.add(norm);
    totalAdded++;
    newOffers.push(job);

    addToPipelineDb(job.url, job.company, job.title, job.source);
    addToPipelineMd(job.url, job.company, job.title);
    recordToHistory(job.url, job.source, job.title, job.company, 'added');
    emit({ type: 'result', offer: job });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary = {
    date: new Date().toISOString().split('T')[0],
    queriesRun: ghCompanies.length + queries.length,
    totalFound,
    filtered: totalFiltered,
    duplicated: totalDup,
    added: totalAdded,
    offers: newOffers,
  };

  emit({ type: 'done', summary });
  return summary;
}
