/**
 * PDF generation service — wraps generate-pdf.mjs via Playwright
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { projectPath } from '../utils/paths.js';

const execFileAsync = promisify(execFile);

// In-memory job store (good enough for single-user use)
const jobs = new Map();

function generateJobId() {
  return `pdf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureOutputDir() {
  const dir = projectPath('output');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function slugify(str) {
  return (str || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

export function startPdfJob(applicationId, company, role, customHtml = null) {
  const jobId = generateJobId();
  const date = new Date().toISOString().split('T')[0];
  const slug = slugify(company);
  const outputDir = ensureOutputDir();
  const htmlPath = join(outputDir, `cv-${slug}-${date}.html`);
  const pdfPath = join(outputDir, `cv-${slug}-${date}.pdf`);

  jobs.set(jobId, { status: 'pending', pdfPath: null, error: null, applicationId });

  // Run async
  (async () => {
    try {
      jobs.set(jobId, { ...jobs.get(jobId), status: 'processing' });

      let html;
      if (customHtml) {
        html = customHtml;
      } else {
        // Read template and fill basic placeholders
        const templatePath = projectPath('templates', 'cv-template.html');
        if (!existsSync(templatePath)) throw new Error('cv-template.html not found');
        html = readFileSync(templatePath, 'utf-8');
      }

      writeFileSync(htmlPath, html, 'utf-8');

      // Call generate-pdf.mjs
      const scriptPath = projectPath('generate-pdf.mjs');
      await execFileAsync('node', [scriptPath, htmlPath, pdfPath, '--format=a4'], {
        cwd: projectPath(),
        timeout: 30000
      });

      jobs.set(jobId, { ...jobs.get(jobId), status: 'done', pdfPath });
      console.log(`[pdf] Job ${jobId} completed: ${pdfPath}`);
    } catch (err) {
      console.error(`[pdf] Job ${jobId} failed:`, err.message);
      jobs.set(jobId, { ...jobs.get(jobId), status: 'error', error: err.message });
    }
  })();

  return jobId;
}

export function getJobStatus(jobId) {
  return jobs.get(jobId) || null;
}

export function getPdfPath(jobId) {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'done') return null;
  return job.pdfPath;
}
