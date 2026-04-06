import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Absolute path to project root (career-ops/)
export const PROJECT_ROOT = join(__dirname, '..', '..', '..');

export function projectPath(...segments) {
  return join(PROJECT_ROOT, ...segments);
}
