/**
 * Imports data/applications.md (markdown table) into SQLite
 * Imports data/pipeline.md (checklist format) into pipeline_urls SQLite table
 * Run once to migrate existing data. Safe to run multiple times (upsert).
 */
import { readFileSync, existsSync } from 'fs';
import { projectPath } from '../utils/paths.js';
import db from '../db/index.js';

function parseMarkdownTable(markdown) {
  const lines = markdown.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 3) return []; // header + separator + at least 1 row

  const dataLines = lines.slice(2); // skip header and separator

  return dataLines.map(line => {
    const cells = line.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 8) return null;
    // Columns: # | Date | Company | Role | Score | Status | PDF | Report | Notes
    const [num, date, company, role, scoreRaw, status, pdf, report, ...notesParts] = cells;
    const scoreMatch = scoreRaw?.match(/(\d+\.?\d*)/);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;
    const pdfDone = pdf?.includes('✅');
    const reportMatch = report?.match(/\[(\d+)\]\(([^)]+)\)/);
    const reportPath = reportMatch ? reportMatch[2] : null;
    const notes = notesParts.join('|').trim() || null;
    return { num: parseInt(num) || 0, date: date || null, company, role, score, status, pdfDone, reportPath, notes };
  }).filter(Boolean).filter(r => r.company && r.company !== 'Company');
}

export async function importApplicationsMd() {
  const mdPath = projectPath('data', 'applications.md');
  if (!existsSync(mdPath)) {
    console.log('[importer] applications.md not found, skipping');
    return { imported: 0, skipped: 0 };
  }

  const content = readFileSync(mdPath, 'utf-8');
  const rows = parseMarkdownTable(content);

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const existing = db.runQuery(
      'SELECT id FROM applications WHERE company = ? AND role = ?',
      [row.company, row.role]
    );

    const pdfPath = row.pdfDone
      ? (row.reportPath?.replace('reports/', 'output/').replace('.md', '.pdf') || null)
      : null;

    if (existing.length > 0) {
      // Update score, notes, report_path from markdown — but NOT status.
      // Status is owned by the frontend (user changes it via the dashboard).
      db.runUpdate(
        `UPDATE applications SET score = ?, report_path = ?, notes = ?
         WHERE company = ? AND role = ?`,
        [
          row.score,
          row.reportPath || null,
          row.notes,
          row.company,
          row.role,
        ]
      );
      skipped++;
      continue;
    }

    db.runInsert(
      `INSERT INTO applications (company, role, score, status, pdf_path, report_path, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.company,
        row.role,
        row.score,
        row.status || 'Evaluated',
        pdfPath,
        row.reportPath || null,
        row.notes,
        row.date || new Date().toISOString().split('T')[0]
      ]
    );
    imported++;
  }

  if (imported > 0) {
    console.log(`[importer] Imported ${imported} new applications from applications.md`);
  }
  return { imported, skipped };
}

/**
 * Imports data/pipeline.md (markdown checklist) into pipeline_urls table.
 * Line format: - [ ] URL | Company | Title
 * Safe to run multiple times — skips duplicates by URL.
 */
export async function importPipelineMd() {
  const mdPath = projectPath('data', 'pipeline.md');
  if (!existsSync(mdPath)) {
    console.log('[importer] pipeline.md not found, skipping');
    return { imported: 0, skipped: 0 };
  }

  const content = readFileSync(mdPath, 'utf-8');
  const lines = content.split('\n');

  let imported = 0;
  let skipped = 0;

  for (const line of lines) {
    // Match both pending [ ] and done [x] checkboxes
    const match = line.match(/^\s*-\s*\[[ x]\]\s+(.+)/i);
    if (!match) continue;

    const parts = match[1].split('|').map(s => s.trim());
    if (parts.length < 1) continue;

    const url = parts[0];
    if (!url || !url.startsWith('http')) continue;

    const company = parts[1] || null;
    // Remove star ratings (⭐) from role title
    const role = parts[2] ? parts[2].replace(/⭐+/g, '').trim() : null;

    // Check duplicate
    const existing = db.runQuery('SELECT id FROM pipeline_urls WHERE url = ?', [url]);
    if (existing.length > 0) { skipped++; continue; }

    try {
      db.runInsert(
        'INSERT INTO pipeline_urls (url, company, role, status, source) VALUES (?, ?, ?, ?, ?)',
        [url, company, role, 'pending', 'pipeline.md']
      );
      imported++;
    } catch (e) {
      // Skip on unique constraint violations or other errors
      skipped++;
    }
  }

  console.log(`[importer] Pipeline: imported ${imported} URLs, skipped ${skipped} duplicates`);
  return { imported, skipped };
}
