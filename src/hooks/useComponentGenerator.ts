import { useState, useCallback } from 'react';
import type { GeneratedComponent, Provider } from '../types';
import { parseStoredComponents } from '../utils/storage';
import { createNdjsonParser } from '../utils/ndjson';
import { useLocalStorageState } from './useLocalStorageState';

type StreamMessage =
  | { type: 'delta'; text: string }
  | { type: 'done'; code: string }
  | { type: 'error'; error: string };

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  isLoading: boolean;
  streamingCode: string;
  error: string | null;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<void>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

export function useComponentGenerator(): UseComponentGeneratorReturn {
  const [components, setComponents] = useLocalStorageState<GeneratedComponent[]>(
    'rcg:components',
    [],
    parseStoredComponents,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [streamingCode, setStreamingCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider) => {
    setIsLoading(true);
    setError(null);

    setStreamingCode('');

    try {
      const res = await fetch('/api/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate component');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parse = createNdjsonParser();
      let accumulated = '';
      let finalCode: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        for (const event of parse(decoder.decode(value, { stream: true })) as StreamMessage[]) {
          if (event.type === 'delta') {
            accumulated += event.text;
            setStreamingCode(accumulated);
          } else if (event.type === 'done') {
            finalCode = event.code;
          } else if (event.type === 'error') {
            throw new Error(event.error);
          }
        }
      }

      if (finalCode === null) {
        throw new Error('응답이 중간에 끊겼습니다. 다시 시도해주세요.');
      }

      const newComponent: GeneratedComponent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt,
        code: finalCode,
        createdAt: new Date(),
      };

      setComponents((prev) => [newComponent, ...prev]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setStreamingCode('');
      setIsLoading(false);
    }
  }, [setComponents]);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, [setComponents]);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, [setComponents]);

  return { components, isLoading, streamingCode, error, generate, removeComponent, clearAll };
}
