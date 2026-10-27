import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat, extractJson, llmConfig } from '@/lib/llm/client';
import type { Settings } from '@/lib/settings';

const settings = (values: Record<string, string>): Settings => ({
  get: (k) => values[k] ?? null,
  source: (k) => (values[k] ? 'app' : null),
});

afterEach(() => vi.restoreAllMocks());

describe('provider layer', () => {
  it('defaults to OpenCode Go with DeepSeek', () => {
    const cfg = llmConfig(settings({ llm_key_opencode: 'sk-test' }));
    expect(cfg).toMatchObject({
      provider: 'opencode',
      format: 'openai',
      model: 'deepseek-v4.1-flash',
      endpoint: 'https://opencode.ai/inference/go/openai/v1/chat/completions',
    });
  });

  it('needs a key, a base URL for custom, and a model where there is no default', () => {
    expect(() => llmConfig(settings({}))).toThrow(/OpenCode Go API key/);
    expect(() => llmConfig(settings({ llm_provider: 'custom' }))).toThrow(/base URL/);
    expect(() => llmConfig(settings({ llm_provider: 'openai', llm_key_openai: 'k' }))).toThrow(/Pick a model/);
    const custom = llmConfig(settings({ llm_provider: 'custom', llm_base_url: 'http://localhost:11434/v1/', llm_model: 'llama3:8b' }));
    expect(custom.endpoint).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('speaks OpenAI chat completions', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ model: 'deepseek-v4.1-flash', choices: [{ message: { content: 'ready' } }] })));
    const cfg = llmConfig(settings({ llm_key_opencode: 'sk-test' }));
    const out = await chat(cfg, [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }], { json: true });
    expect(out.content).toBe('ready');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(cfg.endpoint);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'deepseek-v4.1-flash', response_format: { type: 'json_object' }, messages: [{ role: 'system' }, { role: 'user' }] });
  });

  it('speaks the Anthropic Messages API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'ready' }] })));
    const cfg = llmConfig(settings({ llm_provider: 'anthropic', llm_key_anthropic: 'ak' }));
    const out = await chat(cfg, [{ role: 'system', content: 'sys' }, { role: 'user', content: 'u' }]);
    expect(out.content).toBe('ready');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('ak');
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe('sys');
    expect(body.messages).toEqual([{ role: 'user', content: 'u' }]);
  });

  it('retries without response_format when a model rejects it', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"error":"response_format not supported"}', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] })));
    const cfg = llmConfig(settings({ llm_key_opencode: 'k' }));
    await chat(cfg, [{ role: 'user', content: 'u' }], { json: true });
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string).response_format).toBeUndefined();
  });

  it('maps auth errors to a plain message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no', { status: 401 }));
    await expect(chat(llmConfig(settings({ llm_key_opencode: 'k' })), [{ role: 'user', content: 'u' }])).rejects.toThrow(/Check the API key/);
  });

  it('shows the provider\'s own reason when it refuses a request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":{"message":"Model requires the Global region"}}', { status: 400 }));
    await expect(chat(llmConfig(settings({ llm_key_opencode: 'k' })), [{ role: 'user', content: 'u' }]))
      .rejects.toThrow(/HTTP 400.*It said: "Model requires the Global region"/);
  });

  it('sends a stable x-opencode-session to OpenCode Go only', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"error":"response_format not supported"}', { status: 400 }))
      .mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] })));
    await chat(llmConfig(settings({ llm_key_opencode: 'k' })), [{ role: 'user', content: 'u' }], { json: true });
    const h = (i: number) => (fetchMock.mock.calls[i][1] as RequestInit).headers as Record<string, string>;
    expect(h(0)['x-opencode-session']).toMatch(/^[0-9a-f-]{36}$/);
    expect(h(1)['x-opencode-session']).toBe(h(0)['x-opencode-session']);
    await chat(llmConfig(settings({ llm_provider: 'openai', llm_key_openai: 'k', llm_model: 'gpt-x' })), [{ role: 'user', content: 'u' }]);
    expect(h(2)['x-opencode-session']).toBeUndefined();
  });

  it('gives thinking models room, and retries once when the answer is cut off', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '', reasoning_content: 'hmm' }, finish_reason: 'length' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'ready' }, finish_reason: 'stop' }] })));
    const out = await chat(llmConfig(settings({ llm_key_opencode: 'k' })), [{ role: 'user', content: 'u' }], { maxTokens: 20 });
    expect(out.content).toBe('ready');
    const body = (i: number) => JSON.parse((fetchMock.mock.calls[i][1] as RequestInit).body as string);
    expect(body(0).max_tokens).toBe(4096);
    expect(body(1).max_tokens).toBe(12288);
  });

  it('pulls JSON out of fenced or chatty replies', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":2} Hope that helps')).toEqual({ a: 2 });
  });
});
