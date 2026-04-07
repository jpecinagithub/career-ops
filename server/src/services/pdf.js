/**
 * PDF generation service — wraps generate-pdf.mjs via Playwright
 */
import { chromium } from 'playwright';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { projectPath } from '../utils/paths.js';
import db from '../db/index.js';

const execFileAsync = promisify(execFile);

// In-memory job store (good enough for single-user use)
const jobs = new Map();

function generateJobId() {
  return `pdf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureOutputDir() {
  const dir = projectPath('output');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function slugify(str) {
  return (str || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

// ── Markdown → HTML converter ────────────────────────────────────────────────

function mdToHtml(md) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = s => esc(s)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  const lines = md.split('\n');
  let out = '';
  let inTable = false;
  let tableFirstRow = true;
  let inUl = false;
  let inOl = false;
  let pBuf = [];

  const flushP = () => {
    if (pBuf.length) { out += `<p>${pBuf.join('<br>')}</p>\n`; pBuf = []; }
  };
  const closeList = () => {
    if (inUl) { out += '</ul>\n'; inUl = false; }
    if (inOl) { out += '</ol>\n'; inOl = false; }
  };
  const closeTable = () => {
    if (inTable) { out += '</tbody></table>\n'; inTable = false; tableFirstRow = true; }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Blank line
    if (!line.trim()) {
      flushP(); closeList(); closeTable();
      continue;
    }

    // HR
    if (/^---+$/.test(line)) {
      flushP(); closeList(); closeTable();
      out += '<hr>\n'; continue;
    }

    // Headers
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    const h4 = line.match(/^#### (.+)/);
    if (h1) { flushP(); closeList(); closeTable(); out += `<h1>${fmt(h1[1])}</h1>\n`; continue; }
    if (h2) { flushP(); closeList(); closeTable(); out += `<h2>${fmt(h2[1])}</h2>\n`; continue; }
    if (h3) { flushP(); closeList(); closeTable(); out += `<h3>${fmt(h3[1])}</h3>\n`; continue; }
    if (h4) { flushP(); closeList(); closeTable(); out += `<h4>${fmt(h4[1])}</h4>\n`; continue; }

    // Table
    if (line.startsWith('|')) {
      flushP(); closeList();
      // Separator row
      if (/^\|[\s\-:|]+\|$/.test(line)) {
        if (inTable && tableFirstRow) {
          // close thead, open tbody
          out += '</thead><tbody>\n';
          tableFirstRow = false;
        }
        continue;
      }
      if (!inTable) {
        out += '<table><thead>\n';
        inTable = true; tableFirstRow = true;
      }
      const cells = line.split('|').slice(1, -1);
      const tag = tableFirstRow ? 'th' : 'td';
      out += `<tr>${cells.map(c => `<${tag}>${fmt(c.trim())}</${tag}>`).join('')}</tr>\n`;
      continue;
    }

    // Unordered list
    const ulm = line.match(/^[\-\*] (.+)/);
    if (ulm) {
      flushP(); closeTable();
      if (!inUl) { if (inOl) { out += '</ol>\n'; inOl = false; } out += '<ul>\n'; inUl = true; }
      out += `<li>${fmt(ulm[1])}</li>\n`; continue;
    }

    // Ordered list
    const olm = line.match(/^\d+\. (.+)/);
    if (olm) {
      flushP(); closeTable();
      if (!inOl) { if (inUl) { out += '</ul>\n'; inUl = false; } out += '<ol>\n'; inOl = true; }
      out += `<li>${fmt(olm[1])}</li>\n`; continue;
    }

    // Regular line — buffer into paragraph
    closeTable();
    pBuf.push(fmt(line));
  }

  flushP(); closeList(); closeTable();
  return out;
}

function reportToHtmlPage(markdown, company, role, score) {
  const body = mdToHtml(markdown);
  const scoreColor = score >= 4 ? '#16a34a' : score >= 3 ? '#d97706' : '#dc2626';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Evaluación: ${company} — ${role}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 13px; line-height: 1.6;
    color: #1a1a1a; background: #fff;
    padding: 32px 40px; max-width: 860px; margin: 0 auto;
  }
  .report-header {
    border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px;
  }
  .report-header h1 { font-size: 20px; font-weight: 700; color: #111; margin-bottom: 8px; }
  .meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: #555; }
  .score-badge {
    display: inline-block; padding: 3px 12px; border-radius: 20px;
    background: ${scoreColor}18; color: ${scoreColor};
    font-weight: 700; font-size: 13px; border: 1px solid ${scoreColor}40;
  }
  h1 { font-size: 18px; font-weight: 700; color: #111; margin: 28px 0 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  h2 { font-size: 15px; font-weight: 700; color: #111; margin: 22px 0 8px; }
  h3 { font-size: 13px; font-weight: 700; color: #374151; margin: 16px 0 6px; }
  h4 { font-size: 12px; font-weight: 700; color: #6b7280; margin: 12px 0 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  p { margin-bottom: 10px; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  code { font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; background: #f3f4f6; padding: 1px 5px; border-radius: 3px; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
  a { color: #0284c7; text-decoration: none; }
  ul, ol { margin: 8px 0 12px 20px; }
  li { margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-size: 12px; }
  th { background: #f9fafb; font-weight: 700; text-align: left; padding: 7px 10px; border: 1px solid #e5e7eb; color: #374151; }
  td { padding: 6px 10px; border: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: right; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="report-header">
  <div style="font-size:11px;color:#9ca3af;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Evaluación de Oferta · career-ops</div>
  <h1 style="font-size:20px;border:none;margin:0 0 10px">${company} — ${role}</h1>
  <div class="meta">
    <span>📅 ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
    ${score != null ? `<span class="score-badge">Score: ${score}/5</span>` : ''}
  </div>
</div>
${body}
<div class="footer">Generado por career-ops · ${new Date().toISOString().split('T')[0]}</div>
</body>
</html>`;
}

// ── Report PDF generation (markdown → styled PDF) ───────────────────────────

export async function generateReportPdf(markdown, company, role, score, applicationId) {
  const date = new Date().toISOString().split('T')[0];
  const slug = slugify(company);
  const outputDir = ensureOutputDir();
  const htmlPath = join(outputDir, `report-${slug}-${date}.html`);
  const pdfPath = join(outputDir, `report-${slug}-${date}.pdf`);

  const html = reportToHtmlPage(markdown, company, role, score);
  writeFileSync(htmlPath, html, 'utf-8');

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }

  // Update application record with pdf_path
  if (applicationId != null) {
    try {
      db.runUpdate('UPDATE applications SET pdf_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [pdfPath, applicationId]);
    } catch {}
  }

  console.log(`[pdf] Report PDF generated: ${pdfPath}`);
  return pdfPath;
}

// ── CV PDF generation (existing flow) ────────────────────────────────────────

export function startPdfJob(applicationId, company, role, customHtml = null) {
  const jobId = generateJobId();
  const date = new Date().toISOString().split('T')[0];
  const slug = slugify(company);
  const outputDir = ensureOutputDir();
  const htmlPath = join(outputDir, `cv-${slug}-${date}.html`);
  const pdfPath = join(outputDir, `cv-${slug}-${date}.pdf`);

  jobs.set(jobId, { status: 'pending', pdfPath: null, error: null, applicationId });

  // Run async
  (async () => {
    try {
      jobs.set(jobId, { ...jobs.get(jobId), status: 'processing' });

      let html;
      if (customHtml) {
        html = customHtml;
      } else {
        // Read template and fill basic placeholders
        const templatePath = projectPath('templates', 'cv-template.html');
        if (!existsSync(templatePath)) throw new Error('cv-template.html not found');
        html = readFileSync(templatePath, 'utf-8');
      }

      writeFileSync(htmlPath, html, 'utf-8');

      // Call generate-pdf.mjs
      const scriptPath = projectPath('generate-pdf.mjs');
      await execFileAsync('node', [scriptPath, htmlPath, pdfPath, '--format=a4'], {
        cwd: projectPath(),
        timeout: 30000
      });

      jobs.set(jobId, { ...jobs.get(jobId), status: 'done', pdfPath });
      console.log(`[pdf] Job ${jobId} completed: ${pdfPath}`);
    } catch (err) {
      console.error(`[pdf] Job ${jobId} failed:`, err.message);
      jobs.set(jobId, { ...jobs.get(jobId), status: 'error', error: err.message });
    }
  })();

  return jobId;
}

export function getJobStatus(jobId) {
  return jobs.get(jobId) || null;
}

export function getPdfPath(jobId) {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'done') return null;
  return job.pdfPath;
}
