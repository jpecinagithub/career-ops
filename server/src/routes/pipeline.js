import express from 'express';
import db from '../db/index.js';

const router = express.Router();

// GET /api/pipeline — list pipeline URLs
router.get('/', (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM pipeline_urls';
    const params = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY added_at DESC';
    res.json(db.runQuery(sql, params));
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
