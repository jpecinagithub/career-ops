/**
 * Auto-Applier Service — fully automatic, no confirmation step
 *
 * applyApplication(appId, emit):
 *   1. Opens browser (headless), navigates to URL
 *   2. Fills all personal fields + uploads CV + cover letter
 *   3. Clicks Submit automatically
 *   4. Takes post-submit screenshot
 *   5. Updates status → "Applied"
 *   6. Closes browser
 */

import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'fs';
import { projectPath } from '../utils/paths.js';
import db from '../db/index.js';

// ── ATS detection ─────────────────────────────────────────────────────────────
function detectAts(url = '') {
  if (url.includes('greenhouse.io'))   return 'greenhouse';
  if (url.includes('ashbyhq.com'))     return 'ashby';
  if (url.includes('lever.co'))        return 'lever';
  if (url.includes('workable.com'))    return 'workable';
  if (url.includes('workday.com'))     return 'workday';
  if (url.includes('linkedin.com'))    return 'linkedin';
  if (url.includes('successfactors')) return 'successfactors';
  if (url.includes('personio.com'))    return 'personio';
  return 'generic';
}

// ── Candidate data builder ────────────────────────────────────────────────────
function buildCandidate() {
  const profile = readFileSync(projectPath('config/profile.yml'), 'utf-8');
  const get = (key) => profile.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1] || '';
  const nameParts = get('full_name').split(' ');
  return {
    firstName:  nameParts[0] || '',
    lastName:   nameParts.slice(1).join(' ') || '',
    fullName:   get('full_name'),
    email:      get('email'),
    phone:      get('phone'),
    location:   get('location').split(',')[0].trim(),
    country:    'Spain',
    linkedin:   get('linkedin'),
    portfolio:  get('portfolio_url'),
  };
}

// ── Safe fill helper ──────────────────────────────────────────────────────────
async function tryFill(page, selector, value, label, filled, errors) {
  if (!value) return;
  try {
    const el = await page.$(selector);
    if (!el) return;
    const visible = await el.isVisible().catch(() => false);
    if (!visible) return;
    await el.click({ force: true });
    await el.fill(value);
    filled.push(label);
  } catch (e) {
    errors.push(`${label}: ${e.message.split('\n')[0]}`);
  }
}

async function tryUpload(page, selector, filePath, label, filled, errors) {
  if (!filePath || !existsSync(filePath)) {
    errors.push(`${label}: file not found at ${filePath}`);
    return;
  }
  try {
    const el = await page.$(selector);
    if (!el) return;
    await el.setInputFiles(filePath);
    filled.push(label);
  } catch (e) {
    errors.push(`${label}: ${e.message.split('\n')[0]}`);
  }
}

// ── ATS-specific fillers ──────────────────────────────────────────────────────

async function fillGreenhouse(page, c, cvPath, clPath, filled, errors) {
  await tryFill(page, '#first_name', c.firstName, 'First name', filled, errors);
  await tryFill(page, '#last_name',  c.lastName,  'Last name',  filled, errors);
  await tryFill(page, '#email',      c.email,     'Email',      filled, errors);
  await tryFill(page, '#phone',      c.phone,     'Phone',      filled, errors);

  for (const sel of ['#LinkedIn', 'input[name="job_application[answers_attributes][0][text_value]"]',
                     'input[placeholder*="LinkedIn" i]', 'input[id*="linkedin" i]']) {
    await tryFill(page, sel, c.linkedin, 'LinkedIn', filled, errors);
    if (filled.includes('LinkedIn')) break;
  }

  for (const sel of ['#location', 'input[name*="location" i]', 'input[placeholder*="city" i]',
                     'input[placeholder*="location" i]']) {
    await tryFill(page, sel, c.location, 'Location', filled, errors);
    if (filled.includes('Location')) break;
  }

  await tryUpload(page, '#resume',       cvPath, 'CV/Resume',    filled, errors);
  await tryUpload(page, '#cover_letter', clPath, 'Cover Letter', filled, errors);

  if (!filled.includes('CV/Resume')) {
    await tryUpload(page, 'input[type="file"][id*="resume" i]', cvPath, 'CV/Resume', filled, errors);
  }
}

async function fillAshby(page, c, cvPath, clPath, filled, errors) {
  await tryFill(page, 'input[name="firstName"]',   c.firstName, 'First name', filled, errors);
  await tryFill(page, 'input[name="lastName"]',    c.lastName,  'Last name',  filled, errors);
  await tryFill(page, 'input[name="email"]',       c.email,     'Email',      filled, errors);
  await tryFill(page, 'input[name="phone"]',       c.phone,     'Phone',      filled, errors);
  await tryFill(page, 'input[name="linkedinUrl"]', c.linkedin,  'LinkedIn',   filled, errors);

  await tryUpload(page, 'input[name="resume"]',      cvPath, 'CV/Resume',    filled, errors);
  await tryUpload(page, 'input[name="coverLetter"]', clPath, 'Cover Letter', filled, errors);
}

async function fillLever(page, c, cvPath, clPath, filled, errors) {
  const hasFullName = await page.$('input[name="name"]');
  if (hasFullName) {
    await tryFill(page, 'input[name="name"]', c.fullName, 'Full name', filled, errors);
  } else {
    await tryFill(page, 'input[name="first_name"]', c.firstName, 'First name', filled, errors);
    await tryFill(page, 'input[name="last_name"]',  c.lastName,  'Last name',  filled, errors);
  }
  await tryFill(page, 'input[name="email"]',    c.email,    'Email',    filled, errors);
  await tryFill(page, 'input[name="phone"]',    c.phone,    'Phone',    filled, errors);
  await tryFill(page, 'input[name="linkedin"]', c.linkedin, 'LinkedIn', filled, errors);
  await tryFill(page, 'input[name="location"]', c.location, 'Location', filled, errors);

  await tryUpload(page, 'input[type="file"][name="resume"]',       cvPath, 'CV/Resume',    filled, errors);
  await tryUpload(page, 'input[type="file"][name="cover_letter"]', clPath, 'Cover Letter', filled, errors);
}

async function fillGeneric(page, c, cvPath, clPath, filled, errors) {
  const fieldMap = [
    { selectors: ['#first_name','input[name="first_name"]','input[name="firstName"]','input[placeholder*="First name" i]','input[placeholder*="Nombre" i]'], value: c.firstName, label: 'First name' },
    { selectors: ['#last_name', 'input[name="last_name"]', 'input[name="lastName"]', 'input[placeholder*="Last name" i]', 'input[placeholder*="Apellido" i]'], value: c.lastName,  label: 'Last name' },
    { selectors: ['input[name="name"]','input[id="name"]','input[placeholder*="Full name" i]'], value: c.fullName,  label: 'Full name' },
    { selectors: ['#email','input[name="email"]','input[type="email"]'], value: c.email,    label: 'Email' },
    { selectors: ['#phone','input[name="phone"]','input[type="tel"]'],   value: c.phone,    label: 'Phone' },
    { selectors: ['input[name*="linkedin" i]','input[placeholder*="LinkedIn" i]','input[id*="linkedin" i]'], value: c.linkedin, label: 'LinkedIn' },
    { selectors: ['input[name*="location" i]','input[placeholder*="city" i]','input[placeholder*="location" i]'], value: c.location, label: 'Location' },
  ];

  for (const field of fieldMap) {
    if (filled.includes(field.label)) continue;
    for (const sel of field.selectors) {
      await tryFill(page, sel, field.value, field.label, filled, errors);
      if (filled.includes(field.label)) break;
    }
  }

  const cvSelectors = ['#resume','input[type="file"][name*="resume" i]','input[type="file"][name*="cv" i]','input[type="file"][id*="resume" i]'];
  for (const sel of cvSelectors) {
    await tryUpload(page, sel, cvPath, 'CV/Resume', filled, errors);
    if (filled.includes('CV/Resume')) break;
  }
  const clSelectors = ['#cover_letter','input[type="file"][name*="cover" i]','input[type="file"][id*="cover" i]'];
  for (const sel of clSelectors) {
    await tryUpload(page, sel, clPath, 'Cover Letter', filled, errors);
    if (filled.includes('Cover Letter')) break;
  }
}

// ── Find submit button ────────────────────────────────────────────────────────
async function findSubmitButton(page) {
  const candidates = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit application")',
    'button:has-text("Apply")',
    'button:has-text("Send application")',
    'button:has-text("Submit")',
    'button:has-text("Enviar")',
    'button:has-text("Aplicar")',
  ];
  for (const sel of candidates) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) return sel;
    } catch {}
  }
  return null;
}

// ── Main apply function (fully automatic) ────────────────────────────────────
export async function applyApplication(appId, emit) {
  const rows = db.runQuery('SELECT * FROM applications WHERE id = ?', [appId]);
  if (!rows.length) throw new Error('Application not found');
  const app = rows[0];

  if (!app.url) throw new Error('This application has no URL to navigate to');
  if (!app.cv_path || !existsSync(app.cv_path)) throw new Error('CV not generated yet — generate CV first');
  if (!app.cover_letter_path || !existsSync(app.cover_letter_path)) throw new Error('Cover letter not generated yet');

  const ats = detectAts(app.url);
  emit({ type: 'log', msg: `🌐 [${app.company}] Navigating to ${app.url}` });
  emit({ type: 'log', msg: `🔍 [${app.company}] ATS: ${ats}` });

  const browser = await chromium.launch({ headless: true, slowMo: 100 });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto(app.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check for login wall
    const pageText = (await page.innerText('body').catch(() => '')).toLowerCase();
    const loginKeywords = ['sign in to apply', 'login to apply', 'create an account to apply', 'log in to continue'];
    if (loginKeywords.some(k => pageText.includes(k))) {
      emit({ type: 'login_required', appId, company: app.company, msg: `⚠️ [${app.company}] Requires login — skipping` });
      await browser.close();
      return { success: false, reason: 'login_required' };
    }

    // Fill form
    emit({ type: 'log', msg: `✏️ [${app.company}] Filling form fields...` });
    const c = buildCandidate();
    const filled = [];
    const errors = [];

    if (ats === 'greenhouse')  await fillGreenhouse(page, c, app.cv_path, app.cover_letter_path, filled, errors);
    else if (ats === 'ashby')  await fillAshby(page, c, app.cv_path, app.cover_letter_path, filled, errors);
    else if (ats === 'lever')  await fillLever(page, c, app.cv_path, app.cover_letter_path, filled, errors);
    else                       await fillGeneric(page, c, app.cv_path, app.cover_letter_path, filled, errors);

    emit({ type: 'log', msg: `✅ [${app.company}] Filled: ${filled.join(', ') || 'none detected'}` });
    if (errors.length) {
      emit({ type: 'log', msg: `⚠️ [${app.company}] Could not fill: ${errors.map(e => e.split(':')[0]).join(', ')}` });
    }

    // Find submit button
    const submitSel = await findSubmitButton(page);
    if (!submitSel) {
      emit({ type: 'log', msg: `⚠️ [${app.company}] Submit button not found — marking as skipped` });
      await browser.close();
      return { success: false, reason: 'no_submit_button', filled, errors };
    }

    emit({ type: 'log', msg: `🎯 [${app.company}] Clicking submit: "${submitSel}"` });

    // Click submit
    await page.click(submitSel, { timeout: 10000 });

    // Wait for navigation or confirmation
    await Promise.race([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.waitForTimeout(5000),
    ]);

    // Screenshot of result
    const ss = await page.screenshot({ encoding: 'base64', type: 'png', fullPage: false });

    // Update DB status to Applied
    db.runUpdate(
      'UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['Applied', appId]
    );

    emit({
      type: 'applied',
      appId,
      company: app.company,
      role: app.role,
      filled,
      errors,
      screenshot: ss,
    });

    emit({ type: 'log', msg: `🚀 [${app.company}] Applied successfully!` });

    return { success: true, filled, errors, screenshot: ss };

  } catch (err) {
    emit({ type: 'log', msg: `❌ [${app.company}] Error: ${err.message}` });
    throw err;
  } finally {
    try { await browser.close(); } catch {}
  }
}
