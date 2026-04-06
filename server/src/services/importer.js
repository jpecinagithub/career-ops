/**
 * Imports data/applications.md (markdown table) into SQLite
 * Run once to migrate existing data. Safe to run multiple times (upsert by company+role).
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
    if (existing.length > 0) {
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
        row.pdfDone ? (row.reportPath?.replace('reports/', 'output/').replace('.md', '.pdf') || null) : null,
        row.reportPath || null,
        row.notes,
        row.date || new Date().toISOString().split('T')[0]
      ]
    );
    imported++;
  }

  console.log(`[importer] Imported ${imported} applications, skipped ${skipped} duplicates`);
  return { imported, skipped };
}
