import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '..', '.env') });

const openai = new OpenAI({
  baseURL: 'https://dashscope.aliyuncs.com/api/v1',
  apiKey: process.env.QWEN_API_KEY || 'test-key',
});

console.log('[LLM] API Key loaded:', (process.env.QWEN_API_KEY || 'test-key').substring(0, 10) + '...');

export async function chat(messages, options = {}) {
  const response = await openai.chat.completions.create({
    model: options.model || 'qwen-plus',
    messages,
    temperature: options.temperature || 0.3,
    max_tokens: options.maxTokens || 4000,
    stream: options.stream || false,
  });
  return response;
}

export async function chatStream(messages, onChunk) {
  const stream = await openai.chat.completions.create({
    model: 'qwen-plus',
    messages,
    temperature: 0.3,
    max_tokens: 4000,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content && onChunk) {
      onChunk(content);
    }
  }
}

export default openai;
