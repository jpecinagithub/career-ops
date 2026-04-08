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
import { randomUUID } from 'crypto';
import { projectPath } from '../utils/paths.js';
import db from '../db/index.js';
import { waitForSecurityCode } from './codeRelay.js';

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
    firstName:            nameParts[0] || '',
    lastName:             nameParts.slice(1).join(' ') || '',
    fullName:             get('full_name'),
    email:                get('email'),
    phone:                get('phone'),
    location:             get('location').split(',')[0].trim(),
    country:              'Spain',
    linkedin:             get('linkedin'),
    portfolio:            get('portfolio_url'),
    // application_answers fields
    noticePeriod:         get('notice_period'),
    salaryExpectation:    get('salary_expectation'),
    salaryRange:          get('salary_expectation_range'),
    workPermit:           get('work_permit'),
    euPassport:           get('eu_passport'),
    hybridAvailable:      get('hybrid_available'),
    remoteAvailable:      get('remote_available'),
    relocation:           get('relocation'),
    languages:            get('languages'),
    referral:             get('referral'),
    heardAbout:           get('heard_about'),
    startDate:            get('start_date'),
    currentlyEmployed:    get('currently_employed'),
    yearsExperience:      get('years_experience'),
  };
}

// ── Custom question answerer ──────────────────────────────────────────────────
// Reads all visible custom question fields on a Greenhouse form,
// matches label text to known answers from profile, fills them in.
async function fillCustomQuestions(page, c, filled, errors) {
  // Keyword → answer mapping (order matters — most specific first)
  const ANSWER_MAP = [
    { keywords: ['eu passport', 'work permit', 'right to work', 'authorized to work', 'visa', 'sponsorship'], answer: c.workPermit || 'Yes' },
    { keywords: ['notice period', 'notice'],                                          answer: c.noticePeriod || '1 month' },
    { keywords: ['salary expectation', 'salary expect', 'expected salary', 'compensation', 'gross annual', 'annual salary'], answer: c.salaryExpectation || '65000' },
    { keywords: ['hybrid', 'days in office', 'office per week', 'on-site', 'onsite'], answer: c.hybridAvailable || 'Yes' },
    { keywords: ['relocat'],                                                           answer: c.relocation || 'Yes' },
    { keywords: ['remote'],                                                            answer: c.remoteAvailable || 'Yes' },
    { keywords: ['linkedin'],                                                          answer: c.linkedin },
    { keywords: ['language', 'english', 'spanish'],                                   answer: c.languages },
    { keywords: ['hear about', 'heard about', 'how did you find', 'source', 'referral'], answer: c.heardAbout || 'Job board' },
    { keywords: ['start date', 'available to start', 'when can you start'],           answer: c.startDate || '1 month notice period' },
    { keywords: ['currently employed', 'currently working'],                          answer: c.currentlyEmployed || 'Yes' },
    { keywords: ['years of experience', 'years experience'],                          answer: c.yearsExperience || '15' },
    { keywords: ['website', 'portfolio', 'personal site'],                            answer: c.portfolio || c.linkedin },
    { keywords: ['city', 'where are you based', 'current location', 'currently based'], answer: 'Logroño, Spain' },
    { keywords: ['country'],                                                           answer: 'Spain' },
    // Consent / GDPR / data privacy — always Yes
    { keywords: ['protect your data', 'data privacy', 'privacy notice', 'gdpr', 'personal data', 'data protection', 'give you full control'], answer: 'Yes' },
    // DEI / inclusion / safe environment — always Yes
    { keywords: ['inclusive', 'inclusion', 'diversity', 'safe environment', 'equal opportunity', 'priority number one', 'provide a safe'], answer: 'Yes' },
    // Generic consent / agreement catch-all (must be last)
    { keywords: ['i agree', 'i confirm', 'i consent', 'i acknowledge', 'i understand', 'i accept'], answer: 'Yes' },
  ];

  // Collect all visible custom question inputs (Greenhouse uses question_{id})
  const customFields = await page.evaluate(() => {
    const results = [];
    // Text inputs and textareas with id starting with "question_"
    const els = [...document.querySelectorAll(
      'input[id^="question_"], textarea[id^="question_"], input[data-field^="question"]'
    )];
    for (const el of els) {
      if (!el.offsetParent) continue; // skip hidden
      // Try to find label: aria-label, then associated <label>, then closest label-like element
      const labelEl = document.querySelector(`label[for="${el.id}"]`);
      const labelText = el.getAttribute('aria-label') || labelEl?.textContent?.trim() || '';
      results.push({ id: el.id, tag: el.tagName.toLowerCase(), labelText });
    }
    return results;
  });

  // Collect all visible question_ elements: text inputs + comboboxes (react-select)
  const allQuestionFields = await page.evaluate(() => {
    const results = [];
    const els = [...document.querySelectorAll('[id^="question_"]')];
    for (const el of els) {
      if (!el.offsetParent) continue; // skip hidden
      if (el.id.endsWith('-label') || el.id.endsWith('-description')) continue; // skip label/desc
      const labelEl = document.querySelector(`label[for="${el.id}"]`);
      const labelText = el.getAttribute('aria-label') || labelEl?.textContent?.trim() || '';
      const isCombobox = el.getAttribute('role') === 'combobox' || el.className?.includes('select__input');
      const isTextInput = (el.tagName === 'INPUT' && el.type === 'text' && !isCombobox) || el.tagName === 'TEXTAREA';
      results.push({ id: el.id, tag: el.tagName.toLowerCase(), isCombobox, isTextInput, labelText });
    }
    return results;
  });

  for (const field of allQuestionFields) {
    const label = field.labelText.toLowerCase();
    let matched = false;

    for (const rule of ANSWER_MAP) {
      if (!rule.answer) continue;
      if (rule.keywords.some(k => label.includes(k))) {

        if (field.isTextInput) {
          // Standard text input / textarea
          try {
            const el = await page.$(`#${field.id}`);
            if (el && await el.isVisible().catch(() => false)) {
              await el.click({ force: true });
              await el.fill(String(rule.answer));
              filled.push(`Q: ${field.labelText.slice(0, 40)}`);
              matched = true;
            }
          } catch (e) {
            errors.push(`Q(${field.id}): ${e.message.split('\n')[0]}`);
          }

        } else if (field.isCombobox) {
          // React-select combobox: click input → wait for menu → click option
          try {
            const el = await page.$(`#${field.id}`);
            if (el && await el.isVisible().catch(() => false)) {
              await el.click({ force: true });
              await page.waitForTimeout(600);

              const answerLower = String(rule.answer).toLowerCase();

              // React-select renders menu as sibling of the container.
              // The container has id = field.id minus "__input" or just the base id.
              // Options have id like "react-select-{field.id}-option-0"
              const baseId = field.id.replace(/__input$/, '');
              const optionIdPrefix = `react-select-${baseId}-option-`;

              // Try to find options by id prefix first (most reliable)
              let clicked = false;
              const optionEls = await page.$$(`[id^="${optionIdPrefix}"]`);

              if (optionEls.length > 0) {
                for (const opt of optionEls) {
                  const text = (await opt.textContent().catch(() => '')).toLowerCase().trim();
                  if (answerLower.includes('yes') && text === 'yes') {
                    await opt.click();
                    filled.push(`Q(select): ${field.labelText.slice(0, 40)}`);
                    clicked = true;
                    break;
                  }
                  if (answerLower.includes('no') && text === 'no') {
                    await opt.click();
                    filled.push(`Q(select): ${field.labelText.slice(0, 40)}`);
                    clicked = true;
                    break;
                  }
                }
                // Fallback: first option
                if (!clicked) {
                  const text = (await optionEls[0].textContent().catch(() => '')).trim();
                  if (text && text !== 'Select...') {
                    await optionEls[0].click();
                    filled.push(`Q(select-first): ${field.labelText.slice(0, 40)}`);
                    clicked = true;
                  }
                }
              }

              if (!clicked) {
                await page.keyboard.press('Escape');
                errors.push(`Q(combobox) no options: ${field.id}`);
              }
              matched = true;
            }
          } catch (e) {
            errors.push(`Q(combobox)(${field.id}): ${e.message.split('\n')[0]}`);
          }
        }
        break;
      }
    }

    if (!matched && field.labelText) {
      errors.push(`Q unanswered: "${field.labelText.slice(0, 60)}"`);
    }
  }
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

  // Fill all custom questions (notice period, salary, work permit, hybrid, etc.)
  await fillCustomQuestions(page, c, filled, errors);
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

  // gh_jid= in URL = Greenhouse form embedded in company's own site as an iframe.
  // We must navigate to the company URL (not job-boards.greenhouse.io), then click Apply,
  // which loads the Greenhouse iframe. The form fields live inside that iframe.
  const hasGhJid = /[?&]gh_jid=\d+/.test(app.url) && !app.url.includes('greenhouse.io');

  const ats = detectAts(app.url);
  emit({ type: 'log', msg: `🌐 [${app.company}] Navigating to ${app.url}` });
  if (hasGhJid) emit({ type: 'log', msg: `🖼️ [${app.company}] Greenhouse embed — buscando iframe tras click en Apply` });
  else emit({ type: 'log', msg: `🔍 [${app.company}] ATS: ${ats}` });

  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto(app.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // For embedded Greenhouse (gh_jid): click Apply to load the form iframe
    if (hasGhJid) {
      const applySelectors = [
        'a[href*="/apply"]', 'a:has-text("Apply now")', 'a:has-text("Apply for this job")',
        'button:has-text("Apply now")', 'button:has-text("Apply for this job")',
        'a:has-text("Apply")', 'button:has-text("Apply")',
      ];
      for (const sel of applySelectors) {
        try {
          const el = await page.$(sel);
          if (el && await el.isVisible()) {
            await el.click();
            emit({ type: 'log', msg: `  → Clicked Apply button` });
            break;
          }
        } catch {}
      }
      // Wait for iframe to load
      await page.waitForTimeout(4000);
    }

    // Check for login wall
    const pageText = (await page.innerText('body').catch(() => '')).toLowerCase();
    const loginKeywords = ['sign in to apply', 'login to apply', 'create an account to apply', 'log in to continue'];
    if (loginKeywords.some(k => pageText.includes(k))) {
      db.runUpdate(
        'UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['Failed', appId]
      );
      emit({ type: 'failed', appId, company: app.company, reason: 'login_required', msg: `⚠️ [${app.company}] Requiere login — marcada como fallida` });
      return { success: false, reason: 'login_required' };
      // browser closed in finally
    }

    // Detect Greenhouse iframe (embedded on company site)
    // Pattern: greenhouse.io/embed/job_app — form is inside an iframe, not the main page
    let fillTarget = page;
    const ghEmbedFrame = page.frames().find(f => f.url().includes('greenhouse.io/embed'));
    if (ghEmbedFrame) {
      emit({ type: 'log', msg: `  → Greenhouse iframe encontrado: ${ghEmbedFrame.url().slice(0, 60)}...` });
      fillTarget = ghEmbedFrame;
    }

    // Fill form
    emit({ type: 'log', msg: `✏️ [${app.company}] Filling form fields...` });
    const c = buildCandidate();
    const filled = [];
    const errors = [];

    const effectiveAts = ghEmbedFrame ? 'greenhouse' : ats;
    if (effectiveAts === 'greenhouse')  await fillGreenhouse(fillTarget, c, app.cv_path, app.cover_letter_path, filled, errors);
    else if (effectiveAts === 'ashby')  await fillAshby(fillTarget, c, app.cv_path, app.cover_letter_path, filled, errors);
    else if (effectiveAts === 'lever')  await fillLever(fillTarget, c, app.cv_path, app.cover_letter_path, filled, errors);
    else                                await fillGeneric(fillTarget, c, app.cv_path, app.cover_letter_path, filled, errors);

    emit({ type: 'log', msg: `✅ [${app.company}] Filled: ${filled.join(', ') || 'none detected'}` });
    if (errors.length) {
      emit({ type: 'log', msg: `⚠️ [${app.company}] Could not fill: ${errors.map(e => e.split(':')[0]).join(', ')}` });
    }

    // Find submit button (check iframe first, then main page)
    const submitSel = await findSubmitButton(fillTarget) || await findSubmitButton(page);
    if (!submitSel) {
      db.runUpdate(
        'UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['Failed', appId]
      );
      emit({ type: 'failed', appId, company: app.company, reason: 'no_submit_button', msg: `⚠️ [${app.company}] Botón de submit no encontrado — marcada como fallida` });
      return { success: false, reason: 'no_submit_button', filled, errors };
      // browser closed in finally
    }

    emit({ type: 'log', msg: `🎯 [${app.company}] Clicking submit: "${submitSel}"` });

    // Click submit (use fillTarget if it's an iframe, otherwise main page)
    await fillTarget.click(submitSel, { timeout: 10000 });

    // Wait for navigation or confirmation
    await Promise.race([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.waitForTimeout(6000),
    ]);

    // ── Security code check (Greenhouse email verification) ───────────────────
    // Greenhouse sometimes requires an 8-char code sent to candidate's email.
    // Detect the field, pause, let Claude read the email and inject the code.
    const securityCodeField = await page.$('input[name*="security" i], input[placeholder*="security code" i], input[id*="security" i], input[placeholder*="code" i][maxlength="8"]')
      .catch(() => null);

    if (securityCodeField && await securityCodeField.isVisible().catch(() => false)) {
      const requestId = randomUUID();
      emit({
        type: 'security_code_needed',
        requestId,
        appId,
        company: app.company,
        email: app.email || 'jpecina@gmail.com',
        msg: `📧 [${app.company}] Greenhouse pide código de verificación por email. Leyendo Gmail... (requestId: ${requestId})`,
      });

      // Wait up to 2 minutes for the code to be injected
      const code = await waitForSecurityCode(requestId, 120000);
      emit({ type: 'log', msg: `🔑 [${app.company}] Código recibido: ${code} — introduciendo...` });

      // The security code field is on the main page (not the iframe)
      await securityCodeField.click({ force: true });
      await securityCodeField.fill(code);
      await page.waitForTimeout(1000);

      // Wait for submit button to become enabled after code entry
      // The button may be in the main page (outside the iframe)
      const submitSelectors = [
        'button[type="submit"]:not([disabled])',
        'input[type="submit"]:not([disabled])',
        'button:has-text("Submit"):not([disabled])',
        'button:has-text("Apply"):not([disabled])',
      ];

      let submitted = false;
      for (const sel of submitSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 5000 });
          await page.click(sel, { timeout: 8000 });
          submitted = true;
          break;
        } catch {}
      }

      if (!submitted) {
        // Try iframe submit as fallback
        const submitSel2 = await findSubmitButton(fillTarget);
        if (submitSel2) {
          try { await fillTarget.click(submitSel2, { force: true, timeout: 8000 }); submitted = true; } catch {}
        }
      }

      if (submitted) {
        await Promise.race([
          page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
          page.waitForTimeout(6000),
        ]);
      }
    }

    // ── Verify submission was accepted ────────────────────────────────────────
    // Check both the main page and the iframe for confirmation text.
    // If none found, mark as Unconfirmed — do NOT silently mark as Applied.
    const CONFIRMATION_KEYWORDS = [
      'thank you', 'thanks for applying', 'application received', 'application submitted',
      'we received your application', 'successfully submitted', 'your application has been',
      'we will be in touch', 'we\'ll be in touch', 'gracias', 'solicitud recibida',
      'application complete', 'you\'re all set', 'we got your application',
      // Greenhouse post-submission: shows blank form again with "Create a Job Alert"
      'create a job alert', 'job alert',
    ];

    const pageBodyText = (await page.innerText('body').catch(() => '')).toLowerCase();
    const frameBodyText = ghEmbedFrame
      ? (await ghEmbedFrame.innerText('body').catch(() => '')).toLowerCase()
      : '';
    const combinedText = pageBodyText + ' ' + frameBodyText;

    const confirmed = CONFIRMATION_KEYWORDS.some(k => combinedText.includes(k));

    // Take a screenshot for audit — save to output/
    const outputDir = projectPath('output');
    const slug = app.company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const date = new Date().toISOString().split('T')[0];
    const screenshotPath = `${outputDir}/screenshot-${slug}-${date}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

    if (confirmed) {
      db.runUpdate(
        'UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['Applied', appId]
      );
      emit({ type: 'applied', appId, company: app.company, role: app.role, filled, errors });
      emit({ type: 'log', msg: `✅ [${app.company}] Confirmación detectada — marcada como Applied` });
      return { success: true, filled, errors };
    } else {
      // Submit clicked but no confirmation text found — could be CAPTCHA, validation error, etc.
      db.runUpdate(
        'UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['Unconfirmed', appId]
      );
      emit({
        type: 'unconfirmed',
        appId,
        company: app.company,
        role: app.role,
        msg: `⚠️ [${app.company}] Submit clickado pero sin confirmación en pantalla — marcada como Unconfirmed. Revisa manualmente. Screenshot: ${screenshotPath}`,
      });
      return { success: false, reason: 'no_confirmation', filled, errors };
    }

  } catch (err) {
    // Mark as Failed in DB on any unexpected error
    try {
      db.runUpdate(
        'UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['Failed', appId]
      );
    } catch {}
    emit({ type: 'failed', appId, company: app.company, reason: 'error', msg: `❌ [${app.company}] Error: ${err.message} — marcada como fallida` });
    throw err;
  } finally {
    try { await browser.close(); } catch {}
  }
}
