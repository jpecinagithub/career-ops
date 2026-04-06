import express from 'express';
import { runScan } from '../services/scanner.js';
import db from '../db/index.js';

const router = express.Router();

// POST /api/scan — run full portal scan with SSE streaming
router.post('/', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx: disable buffering

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    await runScan((event) => {
      send(event);
    });
    send({ type: 'complete' });
  } catch (err) {
    console.error('[scan] Error:', err);
    send({ type: 'error', msg: err.message });
  }

  res.end();
});

// GET /api/scan/history — last N scan history entries
router.get('/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const rows = db.runQuery(
      'SELECT * FROM scan_history ORDER BY id DESC LIMIT ?',
      [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
