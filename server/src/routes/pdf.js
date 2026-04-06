import express from 'express';
import { existsSync, createReadStream } from 'fs';
import { startPdfJob, getJobStatus, getPdfPath } from '../services/pdf.js';
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

export default router;
