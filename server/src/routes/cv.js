import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { projectPath } from '../utils/paths.js';

const router = express.Router();

// GET /api/cv — read cv.md
router.get('/', (req, res) => {
  try {
    const cvPath = projectPath('cv.md');
    if (!existsSync(cvPath)) return res.status(404).json({ error: 'cv.md not found' });
    const content = readFileSync(cvPath, 'utf-8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cv — write cv.md
router.put('/', (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });
    writeFileSync(projectPath('cv.md'), content, 'utf-8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cv/profile — read config/profile.yml
router.get('/profile', (req, res) => {
  try {
    const profilePath = projectPath('config', 'profile.yml');
    if (!existsSync(profilePath)) return res.status(404).json({ error: 'profile.yml not found' });
    const content = readFileSync(profilePath, 'utf-8');
    const parsed = yamlLoad(content);
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cv/profile — update config/profile.yml
router.put('/profile', (req, res) => {
  try {
    const profilePath = projectPath('config', 'profile.yml');
    const yaml = yamlDump(req.body, { lineWidth: 120 });
    writeFileSync(profilePath, yaml, 'utf-8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
