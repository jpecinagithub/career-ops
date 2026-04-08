import express from 'express';
import { applyApplication } from '../services/applier.js';
import db from '../db/index.js';

const router = express.Router();

// POST /api/apply/all — apply to all Selected applications (SSE)
router.post('/all', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const selected = db.runQuery(
      "SELECT id, company, role FROM applications WHERE status = 'Selected' AND cv_path IS NOT NULL AND cover_letter_path IS NOT NULL ORDER BY id ASC"
    );

    if (selected.length === 0) {
      send({ type: 'complete', done: 0, errors: 0, total: 0, msg: 'No hay aplicaciones Seleccionadas con CV y Cover Letter listos.' });
      return res.end();
    }

    send({ type: 'start', total: selected.length, msg: `Aplicando a ${selected.length} ofertas...` });

    let done = 0, errors = 0;

    for (let i = 0; i < selected.length; i++) {
      const app = selected[i];
      send({ type: 'item_start', id: app.id, company: app.company, role: app.role, current: i + 1, total: selected.length });

      try {
        await applyApplication(app.id, send);
        done++;
      } catch (err) {
        errors++;
        send({ type: 'item_error', id: app.id, company: app.company, error: err.message });
      }

      send({ type: 'progress', done, errors, total: selected.length });

      // Small delay between applications to avoid hammering servers
      if (i < selected.length - 1) await new Promise(r => setTimeout(r, 2000));
    }

    send({ type: 'complete', done, errors, total: selected.length });
  } catch (err) {
    send({ type: 'error', msg: err.message });
  }

  res.end();
});

// POST /api/apply/:appId — apply to a single application (SSE)
router.post('/:appId', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    await applyApplication(parseInt(req.params.appId), send);
  } catch (err) {
    send({ type: 'error', msg: err.message });
  }

  res.end();
});

export default router;
