/**
 * CV & Cover Letter Generator
 * Clean professional design matching reference style (Jon Peciña SumUp PDF)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';
import { chat } from './llm.js';
import { projectPath } from '../utils/paths.js';
import db from '../db/index.js';

function loadFile(rel) {
  try { return readFileSync(projectPath(rel), 'utf-8'); } catch { return ''; }
}

function ensureOutputDir() {
  const dir = projectPath('output');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function slugify(str) {
  return (str || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 35);
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Render **bold** markdown inside bullet text
function renderBold(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// ── LLM: generate tailored content ───────────────────────────────────────────

async function generateTailoredContent(company, role, reportContent) {
  const cv = loadFile('cv.md');
  const profile = loadFile('config/profile.yml');

  const systemPrompt = `You are an expert CV writer specializing in senior finance roles in Europe.
Your task: tailor the candidate's CV and write a cover letter for a specific job application.

CRITICAL RULES:
- NEVER invent experience, metrics, or skills not present in the CV
- Include ALL 3 work experiences: SurExport Peru Berries (CFO), Dufry Group (Financial Accountant), BEXIFLON (General Accountant Team Leader)
- For each bullet point, wrap 2-3 key phrases in **double asterisks** so they render bold — these should be the most relevant keywords for the JD
- Professional Summary: 3 short paragraphs (not one long block), each 1-2 sentences, highlighting different dimensions
- Core Skills: exactly 10 bullet points, tailored to the JD keywords
- 6 bullets per job minimum, specific and results-oriented
- Output ONLY valid JSON — no markdown fences, no extra text

Candidate CV:
${cv}

Candidate Profile:
${profile}

Job Evaluation Report:
${reportContent || `Company: ${company}\nRole: ${role}`}
`;

  const userMsg = `Generate a tailored CV and cover letter for the role of "${role}" at "${company}".

The experience array MUST include all 3 jobs from the CV. Use **double asterisks** around key phrases in bullets.

Return EXACTLY this JSON (no other text):
{
  "summary_paragraphs": [
    "First paragraph: years of experience + main specialization tailored to this JD. 1-2 sentences.",
    "Second paragraph: key technical strengths relevant to this specific role. 1-2 sentences. Use **bold** on 2-3 key phrases.",
    "Third paragraph: environment fit (SSC/multinational/startup) + value proposition. 1-2 sentences. Use **bold** on 1-2 key phrases."
  ],
  "core_skills": [
    "Skill 1 — tailored to JD",
    "Skill 2",
    "Skill 3",
    "Skill 4",
    "Skill 5",
    "Skill 6",
    "Skill 7",
    "Skill 8",
    "Skill 9",
    "Skill 10"
  ],
  "experience": [
    {
      "title": "Chief Financial Officer (CFO)",
      "company": "SurExport Peru Berries SAC",
      "location": "Lima, Peru",
      "dates": "Nov 2023 – Dec 2025",
      "bullets": [
        "Bullet with **bold key phrase** and detail",
        "Second bullet with **bold keyword**",
        "Third bullet",
        "Fourth bullet",
        "Fifth bullet",
        "Sixth bullet"
      ]
    },
    {
      "title": "Financial Accountant (SSC Environment)",
      "company": "Dufry Group",
      "location": "Eindhoven, Netherlands",
      "dates": "Apr 2021 – Sep 2024",
      "bullets": [
        "Bullet 1",
        "Bullet 2",
        "Bullet 3",
        "Bullet 4",
        "Bullet 5",
        "Bullet 6"
      ]
    },
    {
      "title": "General Accountant Team Leader",
      "company": "BEXIFLON",
      "location": "Logroño, Spain",
      "dates": "Jan 2014 – Apr 2021",
      "bullets": [
        "Bullet 1",
        "Bullet 2",
        "Bullet 3",
        "Bullet 4",
        "Bullet 5"
      ]
    }
  ],
  "education": [
    "MBA – Master of Business Administration",
    "Bachelor's Degree in Business / Finance"
  ],
  "technical_skills": [
    "ERP: SAP (FICO), Oracle, NetSuite",
    "Excel: Advanced (Pivot Tables, VLOOKUP, SUMIF, data analysis)",
    "Financial Systems & Data Tools",
    "Process Automation (continuous improvement mindset)"
  ],
  "languages": [
    "Spanish – Native",
    "English – Professional Working Proficiency"
  ],
  "cover_letter": {
    "opening": "Opening paragraph: strong hook + specific reason why THIS company and THIS role. Mention company by name. 3-4 sentences.",
    "body": "Body: map your 2-3 most relevant experiences to the key JD requirements. Specific and concrete. 4-5 sentences.",
    "impact": "Impact: one standout achievement that differentiates you. Include a real detail from the CV. 3-4 sentences.",
    "closing": "Closing: enthusiasm, call to action, availability. 2-3 sentences."
  }
}`;

  const result = await chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMsg },
  ], { maxTokens: 8000 });

  const raw = result.choices[0].message.content;
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

// ── CV HTML (clean reference style) ──────────────────────────────────────────

function buildCvHtml(data, profile, company, role) {
  const name    = profile.match(/full_name:\s*"([^"]+)"/)?.[1] || 'Candidate';
  const email   = profile.match(/email:\s*"([^"]+)"/)?.[1] || '';
  const phone   = profile.match(/phone:\s*"([^"]+)"/)?.[1] || '';
  const location = profile.match(/location:\s*"([^"]+)"/)?.[1] || '';
  const linkedin = profile.match(/linkedin:\s*"([^"]+)"/)?.[1] || '';

  const summaryHtml = (data.summary_paragraphs || [])
    .map(p => `<p>${renderBold(p)}</p>`)
    .join('\n    ');

  const skillsHtml = (data.core_skills || [])
    .map(s => `<li>${esc(s)}</li>`)
    .join('\n        ');

  const experienceHtml = (data.experience || []).map(job => `
    <div class="job">
      <div class="job-title">${esc(job.title)}</div>
      <div class="job-company"><strong>${esc(job.company)}</strong> – ${esc(job.location)}</div>
      <div class="job-dates">${esc(job.dates)}</div>
      <ul>
        ${(job.bullets || []).map(b => `<li>${renderBold(b)}</li>`).join('\n        ')}
      </ul>
    </div>`).join('\n');

  const educationHtml = (data.education || [])
    .map(e => `<li>${esc(e)}</li>`)
    .join('\n        ');

  const techSkillsHtml = (data.technical_skills || [])
    .map(s => `<li>${esc(s)}</li>`)
    .join('\n        ');

  const langHtml = (data.languages || [])
    .map(l => `<li>${esc(l)}</li>`)
    .join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(name)} — CV — ${esc(company)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 13.5px;
    line-height: 1.65;
    color: #1a1a1a;
    background: #fff;
    padding: 44px 52px;
    max-width: 800px;
    margin: 0 auto;
  }

  /* ── HEADER ── */
  .cv-name {
    font-size: 28px;
    font-weight: 700;
    color: #111;
    margin-bottom: 8px;
    font-family: Georgia, serif;
  }
  .cv-contact {
    font-size: 13px;
    line-height: 1.9;
    color: #333;
    margin-bottom: 20px;
  }
  .cv-contact a { color: #333; text-decoration: none; }
  .header-rule {
    border: none;
    border-top: 1px solid #ccc;
    margin-bottom: 28px;
  }

  /* ── SECTIONS ── */
  .section { margin-bottom: 28px; }
  .section-header-anchor { break-inside: avoid; page-break-inside: avoid; }

  .section-title {
    font-size: 17px;
    font-weight: 700;
    color: #111;
    text-transform: uppercase;
    letter-spacing: 0.01em;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid #ccc;
    break-after: avoid;
    page-break-after: avoid;
  }

  /* ── SUMMARY ── */
  .summary p {
    margin-bottom: 10px;
    font-size: 13.5px;
    line-height: 1.7;
    color: #222;
  }
  .summary p:last-child { margin-bottom: 0; }

  /* ── SKILLS ── */
  .skills-list {
    columns: 2;
    column-gap: 32px;
    padding-left: 20px;
    list-style: disc;
  }
  .skills-list li {
    font-size: 13px;
    line-height: 1.7;
    color: #222;
    break-inside: avoid;
  }

  /* ── EXPERIENCE ── */
  .job { margin-bottom: 22px; break-inside: avoid; page-break-inside: avoid; }
  .job:first-child { break-before: avoid; page-break-before: avoid; }
  .job-title {
    font-size: 15px;
    font-weight: 700;
    color: #111;
    margin-bottom: 2px;
  }
  .job-company {
    font-size: 13.5px;
    color: #222;
    margin-bottom: 2px;
  }
  .job-dates {
    font-size: 12.5px;
    color: #555;
    margin-bottom: 8px;
  }
  .job ul {
    padding-left: 20px;
    list-style: disc;
  }
  .job li {
    font-size: 13px;
    line-height: 1.65;
    color: #222;
    margin-bottom: 4px;
  }

  /* ── EDUCATION / SKILLS / LANG ── */
  .simple-list {
    padding-left: 20px;
    list-style: disc;
  }
  .simple-list li {
    font-size: 13px;
    line-height: 1.7;
    color: #222;
    margin-bottom: 2px;
  }

  /* ── PRINT ── */
  @media print {
    body { padding: 24px 32px; }
    .job { break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- HEADER -->
<div class="cv-name">${esc(name)}</div>
<div class="cv-contact">
  ${esc(location)}<br>
  ${esc(email)} | ${esc(phone)}<br>
  <a href="${linkedin}">${linkedin}</a>
</div>
<hr class="header-rule">

<!-- PROFESSIONAL SUMMARY -->
<div class="section">
  <div class="section-title">Professional Summary</div>
  <div class="summary">
    ${summaryHtml}
  </div>
</div>

<!-- CORE SKILLS -->
<div class="section">
  <div class="section-title">Core Skills</div>
  <ul class="skills-list">
    ${skillsHtml}
  </ul>
</div>

<!-- PROFESSIONAL EXPERIENCE -->
<div class="section">
  <div class="section-header-anchor">
    <div class="section-title">Professional Experience</div>
    ${(data.experience || []).slice(0, 1).map(job => `
    <div class="job">
      <div class="job-title">${esc(job.title)}</div>
      <div class="job-company"><strong>${esc(job.company)}</strong> – ${esc(job.location)}</div>
      <div class="job-dates">${esc(job.dates)}</div>
      <ul>
        ${(job.bullets || []).map(b => `<li>${renderBold(b)}</li>`).join('\n        ')}
      </ul>
    </div>`).join('')}
  </div>
  ${(data.experience || []).slice(1).map(job => `
    <div class="job">
      <div class="job-title">${esc(job.title)}</div>
      <div class="job-company"><strong>${esc(job.company)}</strong> – ${esc(job.location)}</div>
      <div class="job-dates">${esc(job.dates)}</div>
      <ul>
        ${(job.bullets || []).map(b => `<li>${renderBold(b)}</li>`).join('\n        ')}
      </ul>
    </div>`).join('')}
</div>

<!-- EDUCATION -->
<div class="section">
  <div class="section-title">Education</div>
  <ul class="simple-list">
    ${educationHtml}
  </ul>
</div>

<!-- TECHNICAL SKILLS -->
<div class="section">
  <div class="section-title">Technical Skills</div>
  <ul class="simple-list">
    ${techSkillsHtml}
  </ul>
</div>

<!-- LANGUAGES -->
<div class="section">
  <div class="section-title">Languages</div>
  <ul class="simple-list">
    ${langHtml}
  </ul>
</div>

</body>
</html>`;
}

// ── Cover Letter HTML ─────────────────────────────────────────────────────────

function buildCoverLetterHtml(cl, company, role, profile) {
  const name     = profile.match(/full_name:\s*"([^"]+)"/)?.[1] || 'Candidate';
  const email    = profile.match(/email:\s*"([^"]+)"/)?.[1] || '';
  const phone    = profile.match(/phone:\s*"([^"]+)"/)?.[1] || '';
  const location = profile.match(/location:\s*"([^"]+)"/)?.[1] || '';
  const linkedin = profile.match(/linkedin:\s*"([^"]+)"/)?.[1] || '';
  const today    = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Cover Letter — ${esc(name)} — ${esc(company)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 13.5px;
    line-height: 1.75;
    color: #1a1a1a;
    background: #fff;
    padding: 52px 60px;
    max-width: 800px;
    margin: 0 auto;
  }
  .cl-name {
    font-size: 26px;
    font-weight: 700;
    color: #111;
    margin-bottom: 8px;
  }
  .cl-contact {
    font-size: 13px;
    line-height: 1.9;
    color: #333;
    margin-bottom: 20px;
  }
  .cl-contact a { color: #333; text-decoration: none; }
  hr { border: none; border-top: 1px solid #ccc; margin-bottom: 32px; }
  .date { font-size: 13px; color: #555; margin-bottom: 28px; }
  .recipient-label { font-size: 11px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
  .recipient-company { font-size: 16px; font-weight: 700; color: #111; margin-bottom: 2px; }
  .recipient-role { font-size: 13.5px; color: #444; margin-bottom: 28px; }
  .salutation { font-size: 13.5px; font-weight: 600; margin-bottom: 20px; }
  .body-text p { font-size: 13.5px; line-height: 1.8; color: #222; margin-bottom: 18px; text-align: justify; }
  .closing { margin-top: 36px; }
  .sign-off { font-size: 13.5px; margin-bottom: 36px; }
  .sig-name { font-size: 17px; font-weight: 700; color: #111; margin-bottom: 4px; }
  .sig-contact { font-size: 12.5px; color: #666; }
  @media print { body { padding: 28px 36px; } }
</style>
</head>
<body>

<div class="cl-name">${esc(name)}</div>
<div class="cl-contact">
  ${esc(location)}<br>
  ${esc(email)} | ${esc(phone)}<br>
  <a href="${linkedin}">${linkedin}</a>
</div>
<hr>

<div class="date">${today}</div>

<div class="recipient-label">Application for</div>
<div class="recipient-company">${esc(company)}</div>
<div class="recipient-role">${esc(role)}</div>

<div class="salutation">Dear Hiring Manager,</div>

<div class="body-text">
  <p>${renderBold(cl.opening || '')}</p>
  <p>${renderBold(cl.body || '')}</p>
  <p>${renderBold(cl.impact || '')}</p>
  <p>${renderBold(cl.closing || '')}</p>
</div>

<div class="closing">
  <div class="sign-off">Warm regards,</div>
  <div class="sig-name">${esc(name)}</div>
  <div class="sig-contact">${esc(email)} · ${esc(phone)}</div>
</div>

</body>
</html>`;
}

// ── PDF renderer ──────────────────────────────────────────────────────────────

async function htmlToPdf(html, pdfPath) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: { top: '10mm', bottom: '10mm', left: '0', right: '0' },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateCvAndCoverLetter(applicationId, emit) {
  const rows = db.runQuery('SELECT * FROM applications WHERE id = ?', [applicationId]);
  if (!rows.length) throw new Error('Application not found');
  const app = rows[0];

  const { company, role, report_path } = app;
  const date = new Date().toISOString().split('T')[0];
  const slug = slugify(company);
  const outputDir = ensureOutputDir();

  let reportContent = '';
  if (report_path) {
    try { reportContent = readFileSync(projectPath(report_path), 'utf-8'); } catch {}
  }

  emit({ type: 'log', msg: '🤖 Generating tailored content with AI...' });
  const data = await generateTailoredContent(company, role, reportContent);

  const expCount = (data.experience || []).length;
  emit({ type: 'log', msg: `✅ ${expCount} experience(s) included` });

  const profile = loadFile('config/profile.yml');

  // CV PDF
  emit({ type: 'log', msg: '📄 Building CV PDF...' });
  const cvHtml = buildCvHtml(data, profile, company, role);
  const cvHtmlPath = join(outputDir, `cv-${slug}-${date}.html`);
  const cvPdfPath  = join(outputDir, `cv-${slug}-${date}.pdf`);
  writeFileSync(cvHtmlPath, cvHtml, 'utf-8');
  await htmlToPdf(cvHtml, cvPdfPath);

  // Cover Letter PDF
  emit({ type: 'log', msg: '✉️ Building Cover Letter PDF...' });
  const clHtml = buildCoverLetterHtml(data.cover_letter, company, role, profile);
  const clHtmlPath = join(outputDir, `cover-${slug}-${date}.html`);
  const clPdfPath  = join(outputDir, `cover-${slug}-${date}.pdf`);
  writeFileSync(clHtmlPath, clHtml, 'utf-8');
  await htmlToPdf(clHtml, clPdfPath);

  // Save paths to DB
  db.runUpdate(
    'UPDATE applications SET cv_path = ?, cover_letter_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [cvPdfPath, clPdfPath, applicationId]
  );

  emit({ type: 'done', cvPath: cvPdfPath, clPath: clPdfPath });
  return { cvPath: cvPdfPath, clPath: clPdfPath };
}
