import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { chat, chatStream } from './llm.js';
import db from '../db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Project root is 3 levels up from server/src/services/
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

function loadFile(relativePath) {
  const fullPath = join(PROJECT_ROOT, relativePath);
  try {
    return readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function loadSharedContext() {
  return loadFile('modes/_shared.md') || '';
}

function loadCV() {
  return loadFile('cv.md') || '';
}

function loadProfile() {
  return loadFile('config/profile.yml') || '';
}

export async function evaluate(jdText, options = {}) {
  const sharedContext = loadSharedContext();
  const cv = loadCV();
  const profile = loadProfile();

  const systemPrompt = `
Eres Career-Ops, un asistente de búsqueda de empleo especializado en evaluación de ofertas.

${sharedContext}

## Tu tarea: Evaluar esta oferta

Recibes la descripción del puesto (JD). Debes entregar SIEMPRE los 6 bloques descritos en modes/oferta.md:

## Bloque A — Resumen del Rol
- Arquetipo detectado (Finance Leader, Financial Controller, FP&A Manager, Accounting Manager, Finance & Admin Officer)
- Domain, Function, Seniority, Remote, Team size
- TL;DR en 1 frase

## Bloque B — Match con CV
- Tabla con cada requisito del JD mapeado a líneas exactas del CV
- Gaps identificados con estrategia de mitigación
- Score: 1-5 (promedio de match)

## Bloque C — Nivel y Estrategia
- Nivel detectado vs nivel del candidato
- Plan para vender senior sin mentir
- Estrategia de negociación

## Bloque D — Comp y Demanda
- Rango salarial del rol (usa datos de mercado si es posible)
- Reputación de compensación de la empresa

## Bloque E — Plan de Personalización
- Top cambios al CV para maximizar match
- Top cambios a LinkedIn

## Bloque F — Plan de Entrevistas
- Historias STAR+R mapeadas a requisitos del JD
- Case study recomendado
- Preguntas red-flag

---

## IMPORTANTE: 
- Lee el CV antes de evaluar: ${cv}
- Lee el perfil: ${profile}
- Genera el report en inglés (language: EN)
- Da un score de 1-5 basado en match general
- El score debe incluirse en formato: **Score: X/5**
- El report debe incluir la sección "Keywords extraídas" con 15-20 keywords del JD

## JD a evaluar:
---
${jdText}
---
`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Evalúa esta oferta y entrega los 6 bloques A-F.' }
  ];

  const result = await chat(messages);
  const content = result.choices[0].message.content;

  const scoreMatch = content.match(/\*\*Score:\s*(\d+\.?\d*)\/5\*\*/i);
  const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;

  return {
    content,
    score,
    raw: content
  };
}

export async function evaluateStream(jdText, onChunk) {
  const sharedContext = loadSharedContext();
  const cv = loadCV();
  const profile = loadProfile();

  const systemPrompt = `
Eres Career-Ops, un asistente de búsqueda de empleo especializado en evaluación de ofertas.

${sharedContext}

## Tu tarea: Evaluar esta oferta

Recibes la descripción del puesto (JD). Debes entregar SIEMPRE los 6 bloques descritos en modes/oferta.md:

## Bloque A — Resumen del Rol
## Bloque B — Match con CV  
## Bloque C — Nivel y Estrategia
## Bloque D — Comp y Demanda
## Bloque E — Plan de Personalización
## Bloque F — Plan de Entrevistas

## IMPORTANTE: 
- Lee el CV antes de evaluar: ${cv}
- Lee el perfil: ${profile}
- Genera el report en inglés
- Da un score de 1-5 basado en match general
- El score debe incluirse en formato: **Score: X/5**
- El report debe incluir la sección "Keywords extraídas"

## JD a evaluar:
---
${jdText}
---
`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Evalúa esta oferta y entrega los 6 bloques A-F.' }
  ];

  await chatStream(messages, onChunk);
}

export function saveApplication(data) {
  const sql = `
    INSERT INTO applications (company, role, url, score, status, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  const result = db.runInsert(sql, [
    data.company,
    data.role,
    data.url || null,
    data.score,
    data.status || 'Evaluated',
    data.notes || null
  ]);

  return { id: result.lastInsertRowid, ...data };
}

export function getApplications(filters = {}) {
  let sql = 'SELECT * FROM applications';
  const params = [];
  const conditions = [];

  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.minScore) {
    conditions.push('score >= ?');
    params.push(filters.minScore);
  }
  if (filters.company) {
    conditions.push('company LIKE ?');
    params.push(`%${filters.company}%`);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY created_at DESC';

  if (filters.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }

  return db.runQuery(sql, params);
}

export function getApplicationById(id) {
  const results = db.runQuery('SELECT * FROM applications WHERE id = ?', [id]);
  return results[0] || null;
}

export function updateApplication(id, data) {
  const fields = [];
  const params = [];

  if (data.status !== undefined) {
    fields.push('status = ?');
    params.push(data.status);
  }
  if (data.notes !== undefined) {
    fields.push('notes = ?');
    params.push(data.notes);
  }
  if (data.score !== undefined) {
    fields.push('score = ?');
    params.push(data.score);
  }

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  const sql = `UPDATE applications SET ${fields.join(', ')} WHERE id = ?`;
  return db.runUpdate(sql, params);
}

export function getStats() {
  const totalResult = db.runQuery('SELECT COUNT(*) as count FROM applications');
  const total = totalResult[0]?.count || 0;
  
  const byStatus = db.runQuery(`
    SELECT status, COUNT(*) as count 
    FROM applications 
    GROUP BY status
  `);
  
  const avgResult = db.runQuery(`
    SELECT AVG(score) as avg 
    FROM applications 
    WHERE score IS NOT NULL
  `);
  const avgScore = avgResult[0]?.avg || null;

  return {
    total,
    byStatus,
    avgScore: avgScore ? parseFloat(avgScore.toFixed(2)) : null
  };
}
