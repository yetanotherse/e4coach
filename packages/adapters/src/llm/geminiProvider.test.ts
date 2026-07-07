import { describe, it, expect, vi } from 'vitest';
import { GeminiFlashProvider } from './geminiProvider.js';

function geminiResponse(text: string): Response {
  return Response.json({
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 45 },
  });
}

describe('GeminiFlashProvider', () => {
  it('maps messages and parses JSON output with usage', async () => {
    const fetchImpl = vi.fn(async () =>
      geminiResponse('{"headline":"hi"}'),
    ) as unknown as typeof fetch;
    const provider = new GeminiFlashProvider({ apiKey: 'k', model: 'gemini-2.0-flash', fetchImpl });

    const result = await provider.generate([{ role: 'user', content: 'go' }], {
      responseFormat: 'json',
    });
    expect(result.provider).toBe('gemini');
    expect(result.parsed).toEqual({ headline: 'hi' });
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 45 });
  });

  it('reports usage to the cost sink', async () => {
    const onUsage = vi.fn();
    const fetchImpl = vi.fn(async () => geminiResponse('ok')) as unknown as typeof fetch;
    const provider = new GeminiFlashProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl,
      onUsage,
    });
    await provider.generate([{ role: 'user', content: 'hi' }]);
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gemini', inputTokens: 120, outputTokens: 45 }),
    );
  });

  it('retries on a transient error then succeeds', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response('rate limited', { status: 429 });
      return geminiResponse('done');
    }) as unknown as typeof fetch;
    const provider = new GeminiFlashProvider({ apiKey: 'k', model: 'm', fetchImpl, maxRetries: 2 });
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
    const provider = new GeminiFlashProvider({ apiKey: 'k', model: 'm', fetchImpl, maxRetries: 3 });
    await expect(provider.generate([{ role: 'user', content: 'hi' }])).rejects.toThrow(/404/);
    expect(calls).toBe(1); // failed fast, no retries
  });
});
