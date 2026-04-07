/**
 * Auto-processor: fetches JD text from URL, evaluates, saves application + PDF.
 * Used by POST /api/process to batch-process all pending pipeline items.
 */
import { chromium } from 'playwright';
import { evaluate } from './evaluator.js';
import { saveApplication } from './evaluator.js';
import { generateReportPdf } from './pdf.js';
import db from '../db/index.js';

// ── JD Fetching ──────────────────────────────────────────────────────────────

export async function fetchJdText(url) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // Block images/fonts/css to speed up load
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    // Give JS a moment to render
    await page.waitForTimeout(1500);

    // Try to extract the main job content area first
    const text = await page.evaluate(() => {
      // Remove nav, header, footer, sidebar noise
      const remove = ['nav', 'header', 'footer', '.nav', '.sidebar', '.cookie', '[role="navigation"]'];
      remove.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => el.remove());
      });
      return document.body.innerText;
    });

    return (text || '').slice(0, 10000).trim();
  } finally {
    await browser.close();
  }
}

// ── Meta extraction from evaluation report ───────────────────────────────────

function extractMetaFromReport(content) {
  // Pattern: # Evaluación: Empresa — Rol
  const header = content.match(/^#\s*Evaluaci[oó]n:\s*([^—\n]+?)(?:\s*[—–-]\s*([^\n]+))?$/m);
  if (header) {
    return { company: header[1]?.trim() || '', role: header[2]?.trim() || '' };
  }
  // Fallback: **Empresa:** and **Rol:**
  const company = content.match(/\*\*(?:Empresa|Company):\*\*\s*([^\n*]+)/i)?.[1]?.trim() || '';
  const role = content.match(/\*\*(?:Rol|Role|Puesto|Position):\*\*\s*([^\n*]+)/i)?.[1]?.trim() || '';
  return { company, role };
}

// ── Process a single pipeline item ───────────────────────────────────────────

export async function processItem(item, emit) {
  const { id, url, company: scanCompany, role: scanRole } = item;

  try {
    // Mark as processing
    db.runUpdate('UPDATE pipeline_urls SET status = ? WHERE id = ?', ['processing', id]);
    emit({ type: 'item_start', id, company: scanCompany, role: scanRole, url });

    // 1. Fetch JD text from URL
    emit({ type: 'log', id, msg: `🌐 Fetching JD...` });
    let jdText;
    try {
      jdText = await fetchJdText(url);
    } catch (fetchErr) {
      throw new Error(`No se pudo cargar la oferta: ${fetchErr.message}`);
    }

    if (!jdText || jdText.length < 150) {
      throw new Error('Contenido de la oferta demasiado corto o vacío');
    }

    // 2. Evaluate with LLM
    emit({ type: 'log', id, msg: `🤖 Evaluando con IA...` });
    const result = await evaluate(jdText, { url });
    const score = result.score;

    // 3. Determine company/role: report extraction > scan data > fallback
    const meta = extractMetaFromReport(result.content);
    const finalCompany = meta.company || scanCompany || 'Empresa desconocida';
    const finalRole = meta.role || scanRole || 'Puesto desconocido';

    emit({ type: 'log', id, msg: `💾 Guardando aplicación — ${finalCompany} | Score: ${score ?? '?'}/5` });

    // 4. Save application
    const saved = saveApplication({
      company: finalCompany,
      role: finalRole,
      url,
      score,
      status: 'Evaluated',
      notes: `Score: ${score}/5 — auto-evaluada`,
    });

    // 5. Generate PDF
    emit({ type: 'log', id, msg: `📄 Generando PDF...` });
    await generateReportPdf(result.content, finalCompany, finalRole, score, saved.id);

    // 6. Mark pipeline item as evaluated
    db.runUpdate('UPDATE pipeline_urls SET status = ? WHERE id = ?', ['evaluated', id]);

    emit({ type: 'item_done', id, company: finalCompany, role: finalRole, score, appId: saved.id });
    return { success: true, score, company: finalCompany, role: finalRole };

  } catch (err) {
    db.runUpdate('UPDATE pipeline_urls SET status = ? WHERE id = ?', ['error', id]);
    emit({ type: 'item_error', id, error: err.message, company: scanCompany, role: scanRole });
    return { success: false, error: err.message };
  }
}

// ── Process all pending items sequentially ───────────────────────────────────

export async function processAllPending(emit) {
  const pending = db.runQuery(
    'SELECT * FROM pipeline_urls WHERE status = ? ORDER BY added_at ASC',
    ['pending']
  );

  if (pending.length === 0) {
    emit({ type: 'complete', done: 0, errors: 0, total: 0, msg: 'No hay ofertas pendientes en el pipeline.' });
    return;
  }

  emit({ type: 'start', total: pending.length, msg: `Iniciando evaluación automática de ${pending.length} ofertas...` });

  let done = 0;
  let errors = 0;

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    emit({ type: 'progress', done, errors, total: pending.length, current: i + 1, company: item.company, role: item.role });

    const result = await processItem(item, emit);
    if (result.success) done++;
    else errors++;

    // Brief pause between LLM calls to avoid rate limiting
    if (i < pending.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  emit({ type: 'complete', done, errors, total: pending.length });
}
