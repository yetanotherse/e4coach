import { describe, it, expect, vi } from 'vitest';
import { DeepSeekProvider } from './deepseekProvider.js';

function deepseekResponse(text: string): Response {
  return Response.json({
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 120, completion_tokens: 45 },
  });
}

describe('DeepSeekProvider', () => {
  it('maps messages and parses JSON output with usage', async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} };
      return deepseekResponse('{"headline":"hi"}');
    }) as unknown as typeof fetch;
    const provider = new DeepSeekProvider({ apiKey: 'k', model: 'deepseek-v4-flash', fetchImpl });

    const result = await provider.generate(
      [
        { role: 'system', content: 'You are a coach.' },
        { role: 'user', content: 'go' },
      ],
      { responseFormat: 'json', jsonSchema: { type: 'object' } },
    );
    expect(result.provider).toBe('deepseek');
    expect(result.parsed).toEqual({ headline: 'hi' });
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 45 });

    const body = JSON.parse(String(captured?.init.body));
    expect(captured?.url).toContain('https://api.deepseek.com/chat/completions');
    expect(captured?.init.headers).toMatchObject({ Authorization: 'Bearer k' });
    expect(body.model).toBe('deepseek-v4-flash');
    expect(body.messages[0]).toEqual({ role: 'system', content: expect.stringContaining('coach') });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'go' });
    expect(body.response_format).toEqual({ type: 'json_object' });
    // Schema embedded in system prompt since DeepSeek has no schema enforcement.
    expect(body.messages[0].content).toContain('"type":"object"');
  });

  it('sends thinking disabled by default and enabled when configured', async () => {
    const bodies: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return deepseekResponse('ok');
    }) as unknown as typeof fetch;

    const off = new DeepSeekProvider({ apiKey: 'k', model: 'm', fetchImpl });
    await off.generate([{ role: 'user', content: 'hi' }]);
    expect((bodies[0] as { thinking: { type: string } }).thinking).toEqual({ type: 'disabled' });

    const on = new DeepSeekProvider({ apiKey: 'k', model: 'm', fetchImpl, thinking: true });
    await on.generate([{ role: 'user', content: 'hi' }]);
    expect((bodies[1] as { thinking: { type: string } }).thinking).toEqual({ type: 'enabled' });
  });

  it('does not set response_format for plain text calls', async () => {
    let captured: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      captured = init ?? {};
      return deepseekResponse('plain');
    }) as unknown as typeof fetch;
    const provider = new DeepSeekProvider({ apiKey: 'k', model: 'm', fetchImpl });
    const result = await provider.generate([{ role: 'user', content: 'hi' }]);
    const body = JSON.parse(String(captured?.body));
    expect(body.response_format).toBeUndefined();
    expect(result.text).toBe('plain');
    expect(result.parsed).toBeUndefined();
  });

  it('reports usage to the cost sink', async () => {
    const onUsage = vi.fn();
    const fetchImpl = vi.fn(async () => deepseekResponse('ok')) as unknown as typeof fetch;
    const provider = new DeepSeekProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl,
      onUsage,
    });
    await provider.generate([{ role: 'user', content: 'hi' }]);
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'deepseek', inputTokens: 120, outputTokens: 45 }),
    );
  });

  it('retries on a transient error then succeeds', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response('rate limited', { status: 429 });
      return deepseekResponse('done');
    }) as unknown as typeof fetch;
    const provider = new DeepSeekProvider({ apiKey: 'k', model: 'm', fetchImpl, maxRetries: 2 });
    const result = await provider.generate([{ role: 'user', content: 'hi' }]);
    expect(calls).toBe(2);
    expect(result.text).toBe('done');
  });

  it('does NOT retry a 404 (permanent error)', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      return new Response('model not found', { status: 404 });
    }) as unknown as typeof fetch;
    const provider = new DeepSeekProvider({ apiKey: 'k', model: 'm', fetchImpl, maxRetries: 3 });
    await expect(provider.generate([{ role: 'user', content: 'hi' }])).rejects.toThrow(/404/);
    expect(calls).toBe(1); // failed fast, no retries
  });
});
