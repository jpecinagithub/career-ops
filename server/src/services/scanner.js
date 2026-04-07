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

// ── Date filtering ──────────────────────────────────────────────────────────

const MAX_AGE_DAYS = 14;

function cutoffDate(days = MAX_AGE_DAYS) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/** Returns true if the job is within the allowed age window.
 *  If no date is provided, returns true (benefit of the doubt — will be verified later).
 */
function isWithinWindow(dateStr, days = MAX_AGE_DAYS) {
  if (!dateStr) return true; // unknown date: let it through, mark as unverified
  const posted = new Date(dateStr);
  if (isNaN(posted.getTime())) return true; // unparseable: let it through
  return posted >= cutoffDate(days);
}

// ── Title filtering ─────────────────────────────────────────────────────────

function matchesFilter(title, filter) {
  if (!title) return false;
  const t = title.toLowerCase();
  const hasPositive = filter.positive.some(k => t.includes(k.toLowerCase()));
  const hasNegative = filter.negative.some(k => t.includes(k.toLowerCase()));
  return hasPositive && !hasNegative;
}

function isUSLocation(job, locationExclude = []) {
  if (!locationExclude || locationExclude.length === 0) return false;
  const haystack = [job.title, job.location, job.company].filter(Boolean).join(' ').toLowerCase();
  return locationExclude.some(term => haystack.includes(term.toLowerCase()));
}

function isNonTargetLanguage(job, languageExclude = []) {
  if (!languageExclude || languageExclude.length === 0) return false;
  // Only check the title — location and company names are often in local language
  const title = (job.title || '').toLowerCase();
  return languageExclude.some(term => title.includes(term.toLowerCase()));
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
      console.log(`[scanner] ✓ DB insert: ${company} — ${role || url}`);
    } else {
      console.log(`[scanner] skip dup: ${url}`);
    }
  } catch (err) {
    console.error(`[scanner] ✗ DB insert failed for ${url}:`, err.message);
  }
}

// ── Greenhouse API ──────────────────────────────────────────────────────────

async function fetchGreenhouseApi(company, apiUrl, emit) {
  try {
    emit({ type: 'log', msg: `  → Greenhouse API: ${company}` });
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) { emit({ type: 'log', msg: `    ✗ ${company}: HTTP ${res.status}` }); return []; }
    const data = await res.json();

    // NOTE: Greenhouse API only returns OPEN/ACTIVE jobs.
    // If a job is listed here it IS currently accepting applications — no date filter needed.
    // We mark them verified_active so the main loop skips the date check.
    const jobs = (data.jobs || []).map(j => ({
      title: j.title,
      url: j.absolute_url,
      company,
      location: j.location?.name || null,
      posted_at: j.updated_at || null,
      verified_active: true,   // confirmed open via API
      source: `Greenhouse API — ${company}`,
    }));

    emit({ type: 'log', msg: `    ✓ ${company}: ${jobs.length} ofertas activas` });
    return jobs;
  } catch (err) {
    emit({ type: 'log', msg: `    ✗ ${company}: ${err.message}` });
    return [];
  }
}

// ── WebSearch via DashScope ─────────────────────────────────────────────────

// Track LLM availability — if it fails once, skip remaining WebSearch queries
let llmAvailable = null; // null = untested, true = ok, false = unavailable

async function webSearch(query, emit) {
  if (llmAvailable === false) return []; // already known unavailable, skip silently

  try {
    const { chat } = await import('./llm.js');
    const today = new Date().toISOString().split('T')[0];
    const cutoff = cutoffDate(MAX_AGE_DAYS).toISOString().split('T')[0];

    const prompt = `Today is ${today}. Search for active job listings matching this query and return a JSON array.

Query: ${query}

RULES:
- Include jobs that appear to be currently open and accepting applications.
- Prefer jobs posted or updated in the last ${MAX_AGE_DAYS} days (after ${cutoff}). Include the date if visible.
- If you can see the posting date, include it. If not visible, include the job anyway with posted_date null.
- Only include direct application URLs (greenhouse.io, ashbyhq.com, lever.co, workable.com, linkedin.com/jobs, company career pages — NOT search result pages).
- Do NOT include jobs in the United States, Canada, or Australia.

Return ONLY a valid JSON array (no markdown, no explanation):
[{"title":"Job Title","url":"https://...","company":"Company Name","posted_date":"YYYY-MM-DD or null","location":"City, Country"}]

Return 3-10 results. Return [] if nothing found.`;

    const result = await chat([
      { role: 'user', content: prompt }
    ], { maxTokens: 1200, temperature: 0.1 });

    llmAvailable = true;
    const content = result.choices[0]?.message?.content || '[]';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const jobs = JSON.parse(jsonMatch[0]);

    return jobs
      .filter(j => !j.posted_date || isWithinWindow(j.posted_date))
      .map(j => ({ ...j, source: `WebSearch: ${query.slice(0, 40)}` }));
  } catch (err) {
    const is403 = err.message?.includes('403') || err.message?.includes('Access to model denied');
    const is401 = err.message?.includes('401') || err.message?.includes('Incorrect API key');
    if (is403 || is401) {
      llmAvailable = false;
      emit({ type: 'log', msg: `  ⚠️  LLM no disponible (${err.status || 'error'}). WebSearch desactivado — usando solo APIs de portales.` });
    } else {
      emit({ type: 'log', msg: `    ✗ WebSearch error: ${err.message}` });
    }
    return [];
  }
}

// ── Main scan function ──────────────────────────────────────────────────────

export async function runScan(emit) {
  llmAvailable = null; // reset per scan — re-test LLM availability each time
  const config = loadPortalsConfig();
  const { title_filter, tracked_companies = [], search_queries = [] } = config;
  const locationExclude = title_filter.location_exclude || [];
  const languageExclude = title_filter.language_exclude || [];
  const seen = loadSeenUrls();

  let totalFound = 0;
  let totalFiltered = 0;
  let totalTooOld = 0;
  let totalDup = 0;
  let totalAdded = 0;
  const newOffers = [];

  emit({ type: 'start', msg: `Portal Scan — ${new Date().toISOString().split('T')[0]} (ventana: últimos ${MAX_AGE_DAYS} días)` });
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
  emit({ type: 'log', msg: `\n🔎 Filtrando ${totalFound} ofertas brutas...` });
  emit({ type: 'log', msg: `   (${allJobs.filter(j=>j.verified_active).length} via API activa · ${allJobs.filter(j=>!j.verified_active).length} via WebSearch)` });

  for (const job of allJobs) {
    if (!job.url || !job.title) continue;

    // Date filter — only for WebSearch results where we have a confirmed date.
    // Greenhouse API jobs are always active (verified_active = true), skip date check.
    if (!job.verified_active) {
      const dateStr = job.posted_at || job.posted_date;
      if (dateStr && !isWithinWindow(dateStr)) {
        totalTooOld++;
        recordToHistory(job.url, job.source, job.title, job.company, 'skipped_too_old');
        continue;
      }
    }

    // Title filter
    if (!matchesFilter(job.title, title_filter)) {
      totalFiltered++;
      recordToHistory(job.url, job.source, job.title, job.company, 'skipped_title');
      continue;
    }

    // Location filter — block US jobs (no work permit)
    if (isUSLocation(job, locationExclude)) {
      totalFiltered++;
      recordToHistory(job.url, job.source, job.title, job.company, 'skipped_location_us');
      continue;
    }

    // Language filter — English and Spanish only
    if (isNonTargetLanguage(job, languageExclude)) {
      totalFiltered++;
      recordToHistory(job.url, job.source, job.title, job.company, 'skipped_language');
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
    tooOld: totalTooOld,
    filtered: totalFiltered,
    duplicated: totalDup,
    added: totalAdded,
    offers: newOffers,
  };

  emit({ type: 'log', msg: `\n📊 Resultado: ${totalAdded} añadidas · ${totalFiltered} filtradas por título/ubicación · ${totalTooOld} demasiado antiguas · ${totalDup} duplicadas` });
  emit({ type: 'done', summary });
  return summary;
}
