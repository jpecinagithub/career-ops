import express from 'express';
import { processAllPending } from '../services/processor.js';
import db from '../db/index.js';

const router = express.Router();

// POST /api/process — start auto-evaluation of all pending pipeline items (SSE)
router.post('/', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    await processAllPending(send);
  } catch (err) {
    console.error('[process] Error:', err);
    send({ type: 'error', msg: err.message });
  }

  res.end();
});

// GET /api/process/status — count pending / processing / evaluated / error
router.get('/status', (req, res) => {
  try {
    const rows = db.runQuery(`
      SELECT status, COUNT(*) as count
      FROM pipeline_urls
      GROUP BY status
    `);
    const counts = {};
    rows.forEach(r => { counts[r.status] = r.count; });
    res.json({
      pending: counts.pending || 0,
      processing: counts.processing || 0,
      evaluated: counts.evaluated || 0,
      error: counts.error || 0,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
