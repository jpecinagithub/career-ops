import express from 'express';
import { existsSync, createReadStream } from 'fs';
import { resolve } from 'path';
import { startPdfJob, getJobStatus, getPdfPath, generateReportPdf } from '../services/pdf.js';
import { projectPath } from '../utils/paths.js';
import db from '../db/index.js';

const router = express.Router();

// POST /api/pdf/generate — start PDF generation job
router.post('/generate', (req, res) => {
  try {
    const { applicationId, customHtml } = req.body;

    let company = 'candidate';
    let role = 'role';

    if (applicationId) {
      const app = db.runQuery('SELECT company, role FROM applications WHERE id = ?', [applicationId]);
      if (app[0]) { company = app[0].company; role = app[0].role; }
    }

    const jobId = startPdfJob(applicationId, company, role, customHtml || null);
    res.json({ jobId, status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pdf/status/:jobId — check job status
router.get('/status/:jobId', (req, res) => {
  const job = getJobStatus(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ status: job.status, error: job.error || null });
});

// GET /api/pdf/download/:jobId — download the generated PDF
router.get('/download/:jobId', (req, res) => {
  const job = getJobStatus(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'done') return res.status(400).json({ error: `Job status: ${job.status}` });
  if (!existsSync(job.pdfPath)) return res.status(404).json({ error: 'PDF file not found' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${job.pdfPath.split('/').pop().split('\\').pop()}"`);
  createReadStream(job.pdfPath).pipe(res);
});

// POST /api/pdf/report — generate PDF from evaluation markdown, update application
router.post('/report', async (req, res) => {
  try {
    const { markdown, company, role, score, applicationId } = req.body;
    if (!markdown) return res.status(400).json({ error: 'markdown es requerido' });

    const pdfPath = await generateReportPdf(
      markdown,
      company || 'Empresa',
      role || 'Puesto',
      score ?? null,
      applicationId || null
    );

    res.json({ ok: true, pdfPath });
  } catch (err) {
    console.error('[pdf/report] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pdf/open/:appId — serve the report PDF for a given application inline
router.get('/open/:appId', (req, res) => {
  try {
    const row = db.runQuery('SELECT pdf_path FROM applications WHERE id = ?', [req.params.appId]);
    if (!row.length || !row[0].pdf_path) return res.status(404).json({ error: 'PDF no encontrado' });

    // Resolve stored path — may be absolute or relative to project root
    const stored = row[0].pdf_path;
    const isAbsolute = stored.startsWith('/') || /^[A-Za-z]:[\\/]/.test(stored);
    const pdfPath = isAbsolute ? stored : projectPath(stored);

    if (!existsSync(pdfPath)) return res.status(404).json({ error: 'Archivo no encontrado en disco', path: pdfPath });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdfPath.split(/[\\/]/).pop()}"`);
    createReadStream(pdfPath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
