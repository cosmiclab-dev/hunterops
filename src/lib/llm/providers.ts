// The pluggable provider registry. Every provider is one of two wire formats:
//   "openai"    : POST {baseUrl}/chat/completions, Bearer key (OpenCode Go, OpenAI,
//                 Gemini's OpenAI endpoint, OpenRouter, Groq, Together, Ollama, ...)
//   "anthropic" : POST {baseUrl}/v1/messages, x-api-key header
// Adding a provider is one entry here; nothing else in the app changes.

export type WireFormat = 'openai' | 'anthropic';

export type ProviderDef = {
  label: string;
  format: WireFormat;
  baseUrl: string;          // default; the "custom" provider takes it from Settings
  defaultModel: string;     // empty = the person must pick one in Settings
  models: string[];         // suggestions shown in Settings; any id can be typed
  envKey: string;           // env var fallback for the key
  keyOptional?: boolean;    // local servers such as Ollama need no key
  docs: string;
};

export const PROVIDERS = {
  opencode: {
    label: 'OpenCode Go',
    format: 'openai',
    baseUrl: 'https://opencode.ai/inference/go/openai/v1',
    defaultModel: 'deepseek-v4.1-flash',
    models: ['deepseek-v4.1-flash', 'deepseek-v4-pro', 'glm-5.3', 'kimi-k3', 'mimo-v2.6-pro'],
    envKey: 'OPENCODE_API_KEY',
    docs: 'https://opencode.ai/docs/go',
  },
  openai: {
    label: 'OpenAI',
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: '',
    models: [],
    envKey: 'OPENAI_API_KEY',
    docs: 'https://platform.openai.com/docs/models',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-5-5',
    models: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
    envKey: 'ANTHROPIC_API_KEY',
    docs: 'https://docs.claude.com/en/docs/about-claude/models',
  },
  gemini: {
    label: 'Google Gemini',
    format: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: '',
    models: [],
    envKey: 'GEMINI_API_KEY',
    docs: 'https://ai.google.dev/gemini-api/docs/openai',
  },
  openrouter: {
    label: 'OpenRouter',
    format: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: '',
    models: [],
    envKey: 'OPENROUTER_API_KEY',
    docs: 'https://openrouter.ai/models',
  },
  groq: {
    label: 'Groq',
    format: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: '',
    models: [],
    envKey: 'GROQ_API_KEY',
    docs: 'https://console.groq.com/docs/models',
  },
  custom: {
    label: 'Custom (any OpenAI-compatible API)',
    format: 'openai',
    baseUrl: '',
    defaultModel: '',
    models: [],
    envKey: 'CUSTOM_LLM_API_KEY',
    keyOptional: true,
    docs: 'Any server that speaks POST /chat/completions: Together, Fireworks, DeepSeek, Mistral, vLLM, Ollama (http://localhost:11434/v1)...',
  },
} satisfies Record<string, ProviderDef>;

export type ProviderId = keyof typeof PROVIDERS;

export const isProviderId = (v: unknown): v is ProviderId => typeof v === 'string' && v in PROVIDERS;

// Letters, digits and . - _ / : only (covers "openai/gpt-x", "models/gemini-x", "llama3:8b").
export const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._\/:-]{0,99}$/;
