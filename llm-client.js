const PROVIDERS = {
  openai: { defaultBaseUrl: 'https://api.openai.com', defaultModel: 'gpt-4.1-mini' },
  deepseek: { defaultBaseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-chat' },
  anthropic: { defaultBaseUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-4-20250514' },
};

function resolveProviderConfig() {
  const provider = (process.env.LLM_PROVIDER || '').trim().toLowerCase() || 'openai';
  const providerDefaults = PROVIDERS[provider] || PROVIDERS.openai;
  const apiKey = process.env.LLM_API_KEY || (provider === 'openai' ? process.env.OPENAI_API_KEY : '');
  const model = process.env.LLM_MODEL || (provider === 'openai' ? process.env.OPENAI_MODEL || providerDefaults.defaultModel : providerDefaults.defaultModel);
  const baseUrl = process.env.LLM_BASE_URL || providerDefaults.defaultBaseUrl;
  return { provider, apiKey, model, baseUrl: baseUrl.replace(/\/+$/, '') };
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

async function generateText(prompt, options = {}) {
  const config = resolveProviderConfig();
  if (!config.apiKey) throw new Error(`Missing LLM_API_KEY for provider "${config.provider}"`);
  const requestOptions = { maxTokens: options.maxTokens ?? 400, temperature: options.temperature ?? 0.7, jsonMode: options.jsonMode ?? false };
  if (config.provider === 'deepseek') return deepseekChatRequest(config, prompt, requestOptions);
  if (config.provider === 'anthropic') return anthropicMessagesRequest(config, prompt, requestOptions);
  if (config.provider === 'openai') return openaiResponsesRequest(config, prompt, requestOptions);
  throw new Error(`Unsupported LLM provider: ${config.provider}`);
}

module.exports = { PROVIDERS, resolveProviderConfig, generateText };
