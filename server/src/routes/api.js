import express from 'express';
import { evaluate, saveApplication, getApplications, getApplicationById, updateApplication, getStats } from '../services/evaluator.js';
import { importApplicationsMd } from '../services/importer.js';

const router = express.Router();

router.post('/evaluate', async (req, res) => {
  try {
    const { jdText, url } = req.body;
    
    if (!jdText) {
      return res.status(400).json({ error: 'jdText es requerido' });
    }

    const result = await evaluate(jdText, { url });

    if (result.score) {
      const companyMatch = result.content.match(/#{1,2}\s*Evaluación:\s*([^\n—]+)/i) || 
                          result.content.match(/Company:\s*([^\n]+)/i);
      const roleMatch = result.content.match(/—\s*([^\n]+)/i) || 
                        result.content.match(/Role:\s*([^\n]+)/i);
      
      const company = companyMatch ? companyMatch[1].trim() : 'Unknown';
      const role = roleMatch ? roleMatch[1].trim() : 'Unknown';

      saveApplication({
        company,
        role,
        url,
        score: result.score,
        status: 'Evaluated',
        notes: `Score: ${result.score}/5`
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Error evaluating:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/evaluate/stream', async (req, res) => {
  try {
    const { jdText } = req.body;
    
    if (!jdText) {
      return res.status(400).json({ error: 'jdText es requerido' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const { evaluateStream } = await import('../services/evaluator.js');
    
    await evaluateStream(jdText, (chunk) => {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    });

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Error in stream:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

router.get('/applications', async (req, res) => {
  try {
    // Re-sync from applications.md on every request so CLI evaluations
    // (written by Claude Code) appear immediately without server restart.
    await importApplicationsMd();

    const filters = {
      status: req.query.status,
      minScore: req.query.minScore ? parseFloat(req.query.minScore) : null,
      company: req.query.company,
      limit: req.query.limit ? parseInt(req.query.limit) : null
    };

    const apps = getApplications(filters);
    res.json(apps);
  } catch (error) {
    console.error('Error getting applications:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/applications/:id', (req, res) => {
  try {
    const app = getApplicationById(req.params.id);
    if (!app) {
      return res.status(404).json({ error: 'Aplicación no encontrada' });
    }
    res.json(app);
  } catch (error) {
    console.error('Error getting application:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/applications', async (req, res) => {
  try {
    const { company, role, url, score, status, notes } = req.body;
    if (!company || !role) return res.status(400).json({ error: 'company y role son obligatorios' });
    const result = saveApplication({ company, role, url: url || null, score: score || null, status: status || 'Evaluated', notes: notes || null });
    res.status(201).json({ id: result.lastInsertRowid, company, role, score, status: status || 'Evaluated' });
  } catch (error) {
    console.error('Error saving application:', error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/applications/:id', (req, res) => {
  try {
    const result = updateApplication(req.params.id, req.body);
    res.json({ success: true, changes: result.changes });
  } catch (error) {
    console.error('Error updating application:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    await importApplicationsMd();
    const stats = getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
