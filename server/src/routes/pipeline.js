import express from 'express';
import { writeFileSync, existsSync } from 'fs';
import { projectPath } from '../utils/paths.js';
import db from '../db/index.js';

const router = express.Router();

// GET /api/pipeline/debug — verify DB is reachable and shows row count
router.get('/debug', (req, res) => {
  try {
    const count = db.runQuery('SELECT COUNT(*) as n FROM pipeline_urls')[0];
    const sample = db.runQuery('SELECT id, company, role, status FROM pipeline_urls ORDER BY id DESC LIMIT 5');
    res.json({ ok: true, totalRows: count?.n, sample });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/pipeline — list pipeline URLs with optional search + filter + pagination
router.get('/', (req, res) => {
  try {
    const { status, search, limit = 500, offset = 0 } = req.query;
    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(company LIKE ? OR role LIKE ? OR url LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const sql = `SELECT * FROM pipeline_urls${where} ORDER BY added_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const rows = db.runQuery(sql, params);

    // Count total for pagination
    const countSql = `SELECT COUNT(*) as total FROM pipeline_urls${where}`;
    const countParams = params.slice(0, -2); // remove limit/offset
    const total = db.runQuery(countSql, countParams)[0]?.total || 0;

    res.json({ items: rows, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pipeline — add URL(s)
router.post('/', (req, res) => {
  try {
    const { url, company, role, source } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    const existing = db.runQuery('SELECT id FROM pipeline_urls WHERE url = ?', [url]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'URL already in pipeline', id: existing[0].id });
    }

    const result = db.runInsert(
      'INSERT INTO pipeline_urls (url, company, role, source) VALUES (?, ?, ?, ?)',
      [url, company || null, role || null, source || 'manual']
    );
    res.status(201).json({ id: result.lastInsertRowid, url, company, role, status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pipeline/batch — add multiple URLs
router.post('/batch', (req, res) => {
  try {
    const { urls } = req.body;
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'urls array is required' });
    }

    const results = { added: 0, skipped: 0, ids: [] };
    for (const item of urls) {
      const url = typeof item === 'string' ? item : item.url;
      if (!url) continue;
      const existing = db.runQuery('SELECT id FROM pipeline_urls WHERE url = ?', [url]);
      if (existing.length > 0) { results.skipped++; continue; }
      const r = db.runInsert(
        'INSERT INTO pipeline_urls (url, company, role, source) VALUES (?, ?, ?, ?)',
        [url, item.company || null, item.role || null, item.source || 'batch']
      );
      results.ids.push(r.lastInsertRowid);
      results.added++;
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/pipeline/:id — update status
router.patch('/:id', (req, res) => {
  try {
    const { status, company, role } = req.body;
    const fields = [];
    const params = [];
    if (status) { fields.push('status = ?'); params.push(status); }
    if (company) { fields.push('company = ?'); params.push(company); }
    if (role) { fields.push('role = ?'); params.push(role); }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    db.runUpdate(`UPDATE pipeline_urls SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/pipeline/all — wipe entire pipeline + scan history (reset for fresh scan)
router.delete('/all', (req, res) => {
  try {
    const count = db.runQuery('SELECT COUNT(*) as n FROM pipeline_urls')[0]?.n || 0;
    db.runUpdate('DELETE FROM pipeline_urls');

    // Reset pipeline.md
    const pipelinePath = projectPath('data', 'pipeline.md');
    writeFileSync(pipelinePath,
      '# Pipeline — Pending URLs\n\n' +
      '<!-- Add job URLs here, one per line, to process with /career-ops pipeline -->\n' +
      '<!-- Format: - [ ] URL | Company | Title -->\n\n',
      'utf-8'
    );

    // Reset scan-history.tsv (keep header only)
    const histPath = projectPath('data', 'scan-history.tsv');
    writeFileSync(histPath, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');

    res.json({ success: true, deleted: count, message: `Pipeline limpiado: ${count} URLs eliminadas` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/pipeline/:id
router.delete('/:id', (req, res) => {
  try {
    db.runUpdate('DELETE FROM pipeline_urls WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
