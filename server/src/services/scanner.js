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
    const jobs = (data.jobs || []).map(j => ({
      title: j.title,
      url: j.absolute_url,
      company,
      location: j.location?.name || null,
      posted_at: j.updated_at || null,
      verified_active: true,
      source: `Greenhouse API — ${company}`,
    }));
    emit({ type: 'log', msg: `    ✓ ${company}: ${jobs.length} ofertas activas` });
    return jobs;
  } catch (err) {
    emit({ type: 'log', msg: `    ✗ ${company}: ${err.message}` });
    return [];
  }
}

// ── Ashby API ───────────────────────────────────────────────────────────────

async function fetchAshbyApi(company, slug, emit) {
  try {
    emit({ type: 'log', msg: `  → Ashby API: ${company}` });
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) { emit({ type: 'log', msg: `    ✗ ${company}: HTTP ${res.status}` }); return []; }
    const data = await res.json();
    const jobs = (data.results || []).map(j => ({
      title: j.title,
      url: j.jobUrl || `https://jobs.ashbyhq.com/${slug}/${j.id}`,
      company,
      location: j.locationName || j.isRemote ? 'Remote' : null,
      posted_at: j.publishedDate || null,
      verified_active: true,
      source: `Ashby API — ${company}`,
    }));
    emit({ type: 'log', msg: `    ✓ ${company}: ${jobs.length} ofertas activas` });
    return jobs;
  } catch (err) {
    emit({ type: 'log', msg: `    ✗ ${company}: ${err.message}` });
    return [];
  }
}

// ── Lever API ───────────────────────────────────────────────────────────────

async function fetchLeverApi(company, slug, emit) {
  try {
    emit({ type: 'log', msg: `  → Lever API: ${company}` });
    const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) { emit({ type: 'log', msg: `    ✗ ${company}: HTTP ${res.status}` }); return []; }
    const data = await res.json();
    const jobs = (Array.isArray(data) ? data : []).map(j => ({
      title: j.text,
      url: j.hostedUrl,
      company,
      location: j.categories?.location || null,
      posted_at: j.createdAt ? new Date(j.createdAt).toISOString().split('T')[0] : null,
      verified_active: true,
      source: `Lever API — ${company}`,
    }));
    emit({ type: 'log', msg: `    ✓ ${company}: ${jobs.length} ofertas activas` });
    return jobs;
  } catch (err) {
    emit({ type: 'log', msg: `    ✗ ${company}: ${err.message}` });
    return [];
  }
}

// ── VisaSponsor.jobs HTML scraper ───────────────────────────────────────────

/**
 * Scrapes job cards from visasponsor.jobs HTML pages.
 * Page structure: <a href="/api/jobs/{id}/{slug}">
 *   <span class="employer-name">Company</span>
 *   <div class="location">City, Country</div>
 *   <span class="publish-date">Publish date DD-MM-YYYY</span>
 * </a>
 */
async function fetchVisaSponsorPage(baseUrl, path, emit) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; career-ops-scanner/1.0)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) { emit({ type: 'log', msg: `    ✗ VisaSponsor ${path}: HTTP ${res.status}` }); return []; }
    const html = await res.text();

    const jobs = [];
    // Match each job card anchor: <a href="/api/jobs/{id}/{slug}" class="col-12 ...">...</a>
    // Cards end right before the next <a href="/api/jobs/... or end of row div
    const cardRegex = /<a\s+href="(\/api\/jobs\/[a-f0-9]+\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let cardMatch;

    while ((cardMatch = cardRegex.exec(html)) !== null) {
      const [, jobPath, cardHtml] = cardMatch;

      // Skip if card doesn't contain job content (must have employer-name)
      if (!cardHtml.includes('employer-name')) continue;

      // Title from <div class="fs-5 fw-medium ...">Title text</div>
      const titleMatch = cardHtml.match(/class="fs-5 fw-medium[^"]*"[^>]*>([^<]+)<\/div>/);
      const title = titleMatch ? titleMatch[1].trim() : null;

      // Company from <span class="... employer-name ...">Company</span>
      const companyMatch = cardHtml.match(/class="[^"]*employer-name[^"]*"[^>]*>([^<]+)<\/span>/);
      const company = companyMatch ? companyMatch[1].trim() : null;

      // Location: extract all <span style="color:#25201F">...</span> inside location area
      // They appear as: City, Region, Country (3 separate spans)
      const locationSpans = [...cardHtml.matchAll(/<span style="color:#25201F">([^<]+)<\/span>/g)]
        .map(m => m[1].trim().replace(/,\s*$/, ''))
        .filter(s => s && !/^\d{2}-\d{2}-\d{4}$/.test(s)); // exclude date strings
      const location = locationSpans.length > 0 ? locationSpans.join(', ') : null;

      // Date from: Publish date </span><span style="color:#25201F">DD-MM-YYYY</span>
      const dateMatch = cardHtml.match(/Publish date\s*<\/span><span[^>]*>(\d{2}-\d{2}-\d{4})<\/span>/);
      let posted_at = null;
      if (dateMatch) {
        const [dd, mm, yyyy] = dateMatch[1].split('-');
        posted_at = `${yyyy}-${mm}-${dd}`;
      }

      if (title && company) {
        jobs.push({
          title,
          url: `${baseUrl}${jobPath}`,
          company,
          location,
          posted_at,
          verified_active: true, // listed = open on the portal
          source: 'VisaSponsor.jobs',
        });
      }
    }

    return jobs;
  } catch (err) {
    emit({ type: 'log', msg: `    ✗ VisaSponsor ${path}: ${err.message}` });
    return [];
  }
}

async function fetchVisaSponsorPortals(portalsConfig, emit) {
  const portals = (portalsConfig || []).filter(p => p.enabled !== false);
  if (portals.length === 0) return [];

  const allJobs = [];

  for (const portal of portals) {
    emit({ type: 'log', msg: `\n🌐 ${portal.name} (${portal.pages?.length || 0} páginas)...` });
    const pages = portal.pages || [];
    let portalTotal = 0;

    for (const page of pages) {
      const jobs = await fetchVisaSponsorPage(portal.base_url, page, emit);
      allJobs.push(...jobs);
      portalTotal += jobs.length;
    }

    emit({ type: 'log', msg: `    ✓ ${portal.name}: ${portalTotal} ofertas encontradas` });
  }

  return allJobs;
}

// ── WebSearch via DashScope ─────────────────────────────────────────────────

// Track LLM availability — if it fails once, skip remaining WebSearch queries
let llmAvailable = null; // null = untested, true = ok, false = unavailable

async function webSearch(query, emit) {
  if (llmAvailable === false) return []; // already known unavailable, skip silently

  try {
    const { chat } = await import('./llm.js');
    const today = new Date().toISOString().split('T')[0];

    const prompt = `Today is ${today}. Search the web for job listings matching the query below. Return a JSON array.

Query: ${query}

Return ONLY a valid JSON array (no markdown, no explanation):
[{"title":"Job Title","url":"https://direct-apply-url","company":"Company Name","posted_date":"YYYY-MM-DD or null","location":"City, Country"}]

Rules: real results only, no US/Canada/Australia jobs, 3-10 items max, return [] if nothing found.`;

    const result = await chat([
      { role: 'user', content: prompt }
    ], { maxTokens: 1500, temperature: 0, enableSearch: true, model: 'qwen-max' });

    llmAvailable = true;
    const content = result.choices[0]?.message?.content || '';

    // Debug: show first 120 chars of raw response
    const preview = content.slice(0, 120).replace(/\n/g, ' ');
    emit({ type: 'log', msg: `    ↳ LLM raw: ${preview}${content.length > 120 ? '…' : ''}` });

    if (!content || content.trim() === '[]' || content.trim() === '') {
      return [];
    }

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      emit({ type: 'log', msg: `    ⚠️ No JSON array in response — model may not be searching the web` });
      return [];
    }

    let jobs;
    try {
      jobs = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      emit({ type: 'log', msg: `    ⚠️ JSON parse error: ${parseErr.message}` });
      return [];
    }

    if (!Array.isArray(jobs) || jobs.length === 0) return [];

    const filtered = jobs.filter(j => !j.posted_date || isWithinWindow(j.posted_date));
    emit({ type: 'log', msg: `    ✓ ${filtered.length} jobs parsed (${jobs.length - filtered.length} filtered by date)` });
    return filtered.map(j => ({ ...j, source: `WebSearch: ${query.slice(0, 40)}` }));

  } catch (err) {
    const is403 = err.message?.includes('403') || err.message?.includes('Access to model denied');
    const is401 = err.message?.includes('401') || err.message?.includes('Incorrect API key');
    const isTimeout = err.message?.includes('timeout') || err.message?.includes('AbortError');
    if (is403 || is401) {
      llmAvailable = false;
      emit({ type: 'log', msg: `  ⚠️  LLM no disponible (${err.status || err.message}). WebSearch desactivado.` });
    } else if (isTimeout) {
      emit({ type: 'log', msg: `    ✗ Timeout (30s) — query demasiado lenta, saltando` });
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
  const { title_filter, tracked_companies = [], search_queries = [], visa_sponsor_portals = [] } = config;
  const locationExclude = title_filter.location_exclude || [];
  const languageExclude = title_filter.language_exclude || [];
  const seen = loadSeenUrls();

  let totalFound = 0;
  let totalFiltered = 0;
  let totalTooOld = 0;
  let totalDup = 0;
  let totalAdded = 0;
  const newOffers = [];

  const wsEnabled         = config.websearch_enabled !== false; // default true, opt-out via portals.yml
  const ghCompaniesCount  = tracked_companies.filter(c => c.enabled !== false && c.api).length;
  const ashbyCount        = tracked_companies.filter(c => c.enabled !== false && c.ashby_api).length;
  const leverCount        = tracked_companies.filter(c => c.enabled !== false && c.lever_api).length;
  const wsCompaniesCount  = wsEnabled ? tracked_companies.filter(c => c.enabled !== false && c.scan_method === 'websearch' && c.scan_query && !c.api && !c.ashby_api && !c.lever_api).length : 0;
  const queriesCount      = wsEnabled ? search_queries.filter(q => q.enabled !== false).length : 0;
  emit({ type: 'start', msg: `Portal Scan — ${new Date().toISOString().split('T')[0]} (ventana: últimos ${MAX_AGE_DAYS} días)` });
  const wsStatus = wsEnabled ? `WebSearch: ${wsCompaniesCount} portales · ${queriesCount} queries` : `WebSearch: desactivado`;
  emit({ type: 'log', msg: `📋 APIs directas: ${ghCompaniesCount} Greenhouse · ${ashbyCount} Ashby · ${leverCount} Lever | ${wsStatus}` });
  emit({ type: 'log', msg: '━━━━━━━━━━━━━━━━━━━━━━━━━━' });

  // ── Level 2a: Greenhouse APIs ─────────────────────────────────────────────
  const ghCompanies = tracked_companies.filter(c => c.enabled !== false && c.api);
  emit({ type: 'log', msg: `\n📡 Greenhouse APIs (${ghCompanies.length} empresas)...` });

  const allJobs = [];

  for (const company of ghCompanies) {
    const jobs = await fetchGreenhouseApi(company.name, company.api, emit);
    allJobs.push(...jobs);
    totalFound += jobs.length;
  }

  // ── Level 2b: Ashby APIs ───────────────────────────────────────────────────
  const ashbyCompanies = tracked_companies.filter(c => c.enabled !== false && c.ashby_api);
  if (ashbyCompanies.length > 0) {
    emit({ type: 'log', msg: `\n📡 Ashby APIs (${ashbyCompanies.length} empresas)...` });
    for (const company of ashbyCompanies) {
      const jobs = await fetchAshbyApi(company.name, company.ashby_api, emit);
      allJobs.push(...jobs);
      totalFound += jobs.length;
    }
  }

  // ── Level 2c: Lever APIs ───────────────────────────────────────────────────
  const leverCompanies = tracked_companies.filter(c => c.enabled !== false && c.lever_api);
  if (leverCompanies.length > 0) {
    emit({ type: 'log', msg: `\n📡 Lever APIs (${leverCompanies.length} empresas)...` });
    for (const company of leverCompanies) {
      const jobs = await fetchLeverApi(company.name, company.lever_api, emit);
      allJobs.push(...jobs);
      totalFound += jobs.length;
    }
  }

  // ── Level 2b: VisaSponsor.jobs HTML scraper ────────────────────────────────
  const vsJobs = await fetchVisaSponsorPortals(visa_sponsor_portals, emit);
  allJobs.push(...vsJobs);
  totalFound += vsJobs.length;

  // ── Level 3: tracked_companies with scan_method: websearch ───────────────
  const wsCompanies = wsEnabled 
    ? tracked_companies.filter(c => c.enabled !== false && c.scan_method === 'websearch' && c.scan_query)
    : [];
  
  if (wsEnabled && wsCompanies.length > 0) {
    emit({ type: 'log', msg: `\n🏢 Portales corporativos/directos WebSearch (${wsCompanies.length} portales)...` });

    for (const company of wsCompanies) {
      emit({ type: 'log', msg: `  → ${company.name}` });
      const results = await webSearch(company.scan_query, emit);
      allJobs.push(...results.map(r => ({ ...r, source: company.name, company: r.company || company.name })));
      totalFound += results.length;
      emit({ type: 'log', msg: `    ✓ ${results.length} resultados` });
      if (llmAvailable === false) break;
      await new Promise(r => setTimeout(r, 800));
    }
  }

  // ── Level 4: WebSearch generic queries ─────────────────────────────────────
  if (wsEnabled) {
    const queries = search_queries.filter(q => q.enabled !== false);
    emit({ type: 'log', msg: `\n🔍 WebSearch queries genéricas (${queries.length} queries)...` });

    for (const q of queries) {
      emit({ type: 'log', msg: `  → ${q.name}` });
      const results = await webSearch(q.query, emit);
      allJobs.push(...results.map(r => ({ ...r, source: q.name })));
      totalFound += results.length;
      emit({ type: 'log', msg: `    ✓ ${results.length} resultados` });
      if (llmAvailable === false) break;
      await new Promise(r => setTimeout(r, 800));
    }
  }

  // ── Filter + dedup ─────────────────────────────────────────────────────────
  emit({ type: 'log', msg: `\n🔎 Filtrando ${totalFound} ofertas brutas...` });
  emit({ type: 'log', msg: `   (${allJobs.filter(j=>j.verified_active).length} via API/scraper · ${allJobs.filter(j=>!j.verified_active).length} via WebSearch)` });

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
    queriesRun: ghCompanies.length + (wsEnabled ? (wsCompanies?.length || 0) + (search_queries.filter(q => q.enabled !== false).length) : 0),
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
