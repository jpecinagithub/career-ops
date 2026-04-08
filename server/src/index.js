import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '.env') });

import apiRouter from './routes/api.js';
import pipelineRouter from './routes/pipeline.js';
import cvRouter from './routes/cv.js';
import pdfRouter from './routes/pdf.js';
import scanRouter from './routes/scan.js';
import processRouter from './routes/process.js';
import cvgenRouter from './routes/cvgen.js';
import { initDb } from './db/index.js';
import { importApplicationsMd, importPipelineMd } from './services/importer.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api', apiRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/cv', cvRouter);
app.use('/api/pdf', pdfRouter);
app.use('/api/scan', scanRouter);
app.use('/api/process', processRouter);
app.use('/api/cvgen', cvgenRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      hasQwenKey: !!process.env.QWEN_API_KEY,
      nodeEnv: process.env.NODE_ENV || 'development'
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

async function start() {
  try {
    await initDb();
    console.log('[db] Database initialized');

    // Import existing markdown data on first run
    await importApplicationsMd();
    await importPipelineMd();

    app.listen(PORT, () => {
      console.log(`\n🚀 Career-Ops API running on http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/health`);
      console.log(`   API:    http://localhost:${PORT}/api\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
