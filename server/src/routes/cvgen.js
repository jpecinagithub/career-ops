import express from 'express';
import { existsSync, createReadStream } from 'fs';
import { generateCvAndCoverLetter } from '../services/cvGenerator.js';
import { projectPath } from '../utils/paths.js';
import db from '../db/index.js';

const router = express.Router();

// POST /api/cvgen/bulk — generate CV + cover letter for all apps without cv_path (SSE)
router.post('/bulk', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const pending = db.runQuery(
      'SELECT id, company, role FROM applications WHERE cv_path IS NULL ORDER BY id ASC'
    );

    if (pending.length === 0) {
      send({ type: 'complete', done: 0, errors: 0, total: 0, msg: 'Todos los CVs ya están generados.' });
      return res.end();
    }

    send({ type: 'start', total: pending.length, msg: `Generando CV para ${pending.length} aplicaciones...` });

    let done = 0, errors = 0;
    for (let i = 0; i < pending.length; i++) {
      const app = pending[i];
      send({ type: 'item_start', id: app.id, company: app.company, role: app.role, current: i + 1, total: pending.length });
      try {
        await generateCvAndCoverLetter(app.id, send);
        done++;
      } catch (err) {
        errors++;
        send({ type: 'item_error', id: app.id, error: err.message });
      }
      send({ type: 'progress', done, errors, total: pending.length });
      if (i < pending.length - 1) await new Promise(r => setTimeout(r, 1000));
    }

    send({ type: 'complete', done, errors, total: pending.length });
  } catch (err) {
    send({ type: 'error', msg: err.message });
  }
  res.end();
});

// POST /api/cvgen/:appId — generate CV + cover letter (SSE progress)
router.post('/:appId', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    await generateCvAndCoverLetter(parseInt(req.params.appId), send);
  } catch (err) {
    console.error('[cvgen] Error:', err.message);
    send({ type: 'error', msg: err.message });
  }

  res.end();
});

// Helper to serve a PDF file inline
function servePdf(res, storedPath, fallbackFilename) {
  const isAbsolute = storedPath && (storedPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(storedPath));
  const pdfPath = isAbsolute ? storedPath : projectPath(storedPath);
  if (!existsSync(pdfPath)) {
    return res.status(404).json({ error: 'PDF not found on disk', path: pdfPath });
  }
  const filename = pdfPath.split(/[\\/]/).pop() || fallbackFilename;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  createReadStream(pdfPath).pipe(res);
}

// GET /api/cvgen/cv/:appId — open CV PDF inline
router.get('/cv/:appId', (req, res) => {
  try {
    const rows = db.runQuery('SELECT cv_path FROM applications WHERE id = ?', [req.params.appId]);
    if (!rows.length || !rows[0].cv_path) return res.status(404).json({ error: 'CV not generated yet' });
    servePdf(res, rows[0].cv_path, 'cv.pdf');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cvgen/cover/:appId — open Cover Letter PDF inline
router.get('/cover/:appId', (req, res) => {
  try {
    const rows = db.runQuery('SELECT cover_letter_path FROM applications WHERE id = ?', [req.params.appId]);
    if (!rows.length || !rows[0].cover_letter_path) return res.status(404).json({ error: 'Cover letter not generated yet' });
    servePdf(res, rows[0].cover_letter_path, 'cover-letter.pdf');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
