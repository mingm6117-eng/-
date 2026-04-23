const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, execFileSync } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PROVIDERS = {
  openai: { defaultBaseUrl: 'https://api.openai.com', defaultModel: 'gpt-4.1-mini' },
  deepseek: { defaultBaseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-chat' },
  anthropic: { defaultBaseUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-4-20250514' },
  openclaw: { defaultBaseUrl: '', defaultModel: 'openclaw' },
};

function isPlaceholderKey(value) {
  const normalized = (value || '').trim().toLowerCase();
  return !normalized || normalized === 'your_provider_key_here' || normalized === 'your_openai_key_here' || normalized.includes('你的key');
}

function inferProviderFromModel(model) {
  const normalized = (model || '').toLowerCase();
  if (normalized.startsWith('deepseek')) return 'deepseek';
  if (normalized.startsWith('claude')) return 'anthropic';
  if (normalized === 'openclaw') return 'openclaw';
  return 'openai';
}

function resolveProviderConfig() {
  const requestedProvider = (process.env.LLM_PROVIDER || '').trim().toLowerCase() || 'auto';
  const configuredModel = process.env.LLM_MODEL || process.env.OPENAI_MODEL || '';
  const rawApiKey = process.env.LLM_API_KEY || (requestedProvider === 'openai' || requestedProvider === 'auto' ? process.env.OPENAI_API_KEY : '');
  const apiKey = isPlaceholderKey(rawApiKey) ? '' : rawApiKey;
  const provider =
    requestedProvider === 'auto'
      ? apiKey
        ? inferProviderFromModel(configuredModel)
        : 'openclaw'
      : requestedProvider;
  const providerDefaults = PROVIDERS[provider] || PROVIDERS.openai;
  const model = configuredModel || providerDefaults.defaultModel;
  const baseUrl = process.env.LLM_BASE_URL || providerDefaults.defaultBaseUrl;
  return { provider, requestedProvider, apiKey, model, baseUrl: baseUrl.replace(/\/+$/, '') };
}

async function openaiResponsesRequest(config, prompt, options) {
  const upstream = await fetch(`${config.baseUrl}/v1/responses`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], max_output_tokens: options.maxTokens, temperature: options.temperature }),
  });
  const json = await upstream.json();
  if (!upstream.ok) throw new Error(json.error?.message || 'OpenAI request failed');
  return (json.output_text || '').trim();
}

async function deepseekChatRequest(config, prompt, options) {
  const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: prompt }], temperature: options.temperature, max_tokens: options.maxTokens, response_format: options.jsonMode ? { type: 'json_object' } : undefined }),
  });
  const json = await upstream.json();
  if (!upstream.ok) throw new Error(json.error?.message || 'DeepSeek request failed');
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('DeepSeek returned empty content');
  return content.trim();
}

async function anthropicMessagesRequest(config, prompt, options) {
  const upstream = await fetch(`${config.baseUrl}/v1/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: config.model, max_tokens: options.maxTokens, temperature: options.temperature, messages: [{ role: 'user', content: prompt }] }),
  });
  const json = await upstream.json();
  if (!upstream.ok) throw new Error(json.error?.message || 'Anthropic request failed');
  const text = (Array.isArray(json.content) ? json.content : []).filter((p) => p?.type === 'text').map((p) => p.text).join('').trim();
  if (!text) throw new Error('Anthropic returned empty content');
  return text;
}

function commandExists(command) {
  try {
    execFileSync('which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function renderOpenClawCommand(template, promptFile, prompt) {
  if (template.includes('{promptFile}') || template.includes('{prompt}')) {
    return template
      .replaceAll('{promptFile}', shellQuote(promptFile))
      .replaceAll('{prompt}', shellQuote(prompt));
  }
  return `${template} < ${shellQuote(promptFile)}`;
}

async function runOpenClawCommand(command, promptFile, prompt, timeoutMs) {
  const rendered = renderOpenClawCommand(command, promptFile, prompt);
  const { stdout, stderr } = await execAsync(rendered, {
    cwd: process.cwd(),
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });

  const output = `${stdout || ''}${stderr ? `\n${stderr}` : ''}`.trim();
  if (!output) {
    throw new Error('OpenClaw returned empty output');
  }
  return output;
}

async function openclawRequest(_config, prompt, options) {
  if (!commandExists('openclaw')) {
    throw new Error('OpenClaw CLI not found');
  }

  const timeoutMs = Number(process.env.OPENCLAW_LLM_TIMEOUT_MS || 120000);
  const promptFile = path.join(os.tmpdir(), `industry-brief-openclaw-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(promptFile, prompt, 'utf8');

  const customCommand = (process.env.OPENCLAW_LLM_COMMAND || '').trim();
  const commands = customCommand
    ? [customCommand]
    : [
        'openclaw infer --prompt-file {promptFile}',
        'openclaw capability infer --prompt-file {promptFile}',
        'openclaw agent --prompt-file {promptFile}',
        'openclaw infer',
        'openclaw capability infer',
      ];

  const errors = [];
  try {
    for (const command of commands) {
      try {
        const text = await runOpenClawCommand(command, promptFile, prompt, timeoutMs);
        if (options.jsonMode && text.includes('```')) {
          const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
          return (match?.[1] || text).trim();
        }
        return text;
      } catch (err) {
        errors.push(`${command}: ${err.message}`);
        if (customCommand) break;
      }
    }
  } finally {
    fs.rmSync(promptFile, { force: true });
  }

  throw new Error(`OpenClaw generation failed: ${errors.join(' | ')}`);
}

async function generateText(prompt, options = {}) {
  const config = resolveProviderConfig();
  const requestOptions = { maxTokens: options.maxTokens ?? 400, temperature: options.temperature ?? 0.7, jsonMode: options.jsonMode ?? false };
  if (config.provider === 'openclaw') return openclawRequest(config, prompt, requestOptions);
  if (!config.apiKey) {
    if (commandExists('openclaw')) {
      return openclawRequest({ ...config, provider: 'openclaw' }, prompt, requestOptions);
    }
    throw new Error(`Missing LLM_API_KEY for provider "${config.provider}"`);
  }
  if (config.provider === 'deepseek') return deepseekChatRequest(config, prompt, requestOptions);
  if (config.provider === 'anthropic') return anthropicMessagesRequest(config, prompt, requestOptions);
  if (config.provider === 'openai') return openaiResponsesRequest(config, prompt, requestOptions);
  throw new Error(`Unsupported LLM provider: ${config.provider}`);
}

module.exports = { PROVIDERS, resolveProviderConfig, generateText };
