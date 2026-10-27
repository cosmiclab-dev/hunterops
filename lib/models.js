// Model selection shared by ai-brain (enforcement) and db health (UI model list).
export const DEFAULT_MODEL = 'deepseek-v4.1-flash';
export const DEFAULT_API_URL = 'https://opencode.ai/inference/go/openai/v1';

// OpenCode Go models served on the OpenAI-compatible chat completions endpoint
// (opencode.ai/docs/go, checked 2026-10-27). Models on Go's Anthropic, Responses
// or Google endpoints are left out: this app only speaks chat completions.
export const OPENCODE_GO_CHAT_MODELS = [
  'deepseek-v4.1-flash', 'deepseek-v4-pro',
  'glm-5.3-flash', 'glm-5.3', 'glm-5.2',
  'kimi-k3.1-pro', 'kimi-k3', 'kimi-k2.7-code',
  'mimo-v2.6-flash', 'mimo-v2.6-pro', 'mimo-v2.5', 'mimo-v2.5-pro',
  'minimax-m3.1-flash', 'longcat-2.0', 'hy4-preview', 'hy3', 'step-5-preview',
];

// A model id typed by the user: letters, digits and . - _ / only.
export const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,79}$/;

export function modelConfig() {
  const defaultModel = process.env.OPENCODE_MODEL || DEFAULT_MODEL;
  const allowed = (process.env.OPENCODE_ALLOWED_MODELS || `${defaultModel},deepseek-v4-pro`)
    .split(',').map((m) => m.trim()).filter(Boolean);
  if (!allowed.includes(defaultModel)) allowed.unshift(defaultModel);
  return { defaultModel, allowed };
}
