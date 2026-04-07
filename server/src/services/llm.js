import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '..', '.env') });

// DashScope compatible-mode endpoint (OpenAI SDK compatible)
// Use dashscope-intl for international accounts, dashscope for China accounts
const baseURL = process.env.DASHSCOPE_INTL === 'false'
  ? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  : 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

const openai = new OpenAI({
  baseURL,
  apiKey: process.env.QWEN_API_KEY || 'test-key',
});

console.log('[LLM] API Key loaded:', (process.env.QWEN_API_KEY || 'test-key').substring(0, 10) + '...');

export async function chat(messages, options = {}) {
  // When enableSearch is requested, use native fetch because the OpenAI SDK
  // strips DashScope extension params (enable_search) from the request body.
  if (options.enableSearch) {
    const body = {
      model: options.model || 'qwen-plus',
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens || 4000,
      enable_search: true,
      search_options: { forced_search: true },
    };
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.QWEN_API_KEY || 'test-key'}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e = new Error(err.error?.message || `HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }
    return res.json();
  }

  const response = await openai.chat.completions.create({
    model: options.model || 'qwen-plus',
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens || 4000,
    stream: options.stream || false,
  });
  return response;
}

export async function chatStream(messages, onChunk) {
  const stream = await openai.chat.completions.create({
    model: 'qwen3.5-plus',
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
