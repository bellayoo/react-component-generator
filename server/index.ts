import { stripCodeFences, ensureRenderCall } from './generator';
import { withModelFallback } from './fallback';
import { streamText, parseAnthropicEvent, parseGoogleEvent } from './stream';

// 우선순위 순서. 앞 모델이 실패하면 다음 모델로 폴백한다.
const GOOGLE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

const SYSTEM_PROMPT = `You are a React component generator. Generate a single React component based on the user's description.

Rules:
- Use inline styles only (no CSS imports, no CSS modules)
- Do NOT use import statements — React is already available in scope as a global
- Define the component as a function, then call render(<ComponentName />) at the end
- Make the component visually appealing with proper styling
- Use React hooks if needed (e.g., React.useState, React.useEffect)
- The component must be completely self-contained
- Respond with ONLY the code block — no explanations, no markdown fences
- Use descriptive variable names and clean formatting
- For colors, prefer modern palettes (gradients, shadows, etc.)
- Ensure the component is interactive where appropriate (hover states, click handlers, etc.)
- Do NOT use TypeScript syntax — no type annotations, no interfaces, no generics, no "as" casts. Write plain JavaScript only.

Example output format:
const GradientButton = () => {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      style={{
        background: hovered
          ? 'linear-gradient(135deg, #667eea, #764ba2)'
          : 'linear-gradient(135deg, #764ba2, #667eea)',
        color: 'white',
        border: 'none',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '16px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Click me
    </button>
  );
};

render(<GradientButton />);`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Provider = 'anthropic' | 'google';

const ENV_KEYS: Record<Provider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
};

function resolveApiKey(provider: Provider, clientKey?: string): string | null {
  return clientKey || ENV_KEYS[provider] || null;
}

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

async function callGoogleModel(prompt: string, apiKey: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates: Array<{
      content: { parts: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
  }

  return (
    candidate?.content?.parts
      ?.map((part) => part.text)
      ?.join('') ?? ''
  );
}

async function callGoogle(prompt: string, apiKey: string): Promise<string> {
  return withModelFallback(GOOGLE_MODELS, (model) => callGoogleModel(prompt, apiKey, model));
}

async function openAnthropicStream(prompt: string, apiKey: string): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  return response.body;
}

async function openGoogleStream(prompt: string, apiKey: string, model: string): Promise<ReadableStream<Uint8Array>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  return response.body;
}

// 연결 단계에서만 폴백한다. 스트림이 시작된 뒤의 실패는 다른 모델로 이어갈 수 없다.
function openGoogleStreamWithFallback(prompt: string, apiKey: string) {
  return withModelFallback(GOOGLE_MODELS, (model) => openGoogleStream(prompt, apiKey, model));
}

function errorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : 'Unknown error';

  if (message.includes('503')) {
    return Response.json(
      { error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.' },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  if (message.includes('429')) {
    return Response.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429, headers: CORS_HEADERS }
    );
  }

  return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS });
}

// 텍스트 델타를 NDJSON(delta → done | error)으로 내보낸다. 최종 코드는 서버에서 정규화한다.
function ndjsonStream(deltas: AsyncGenerator<string>): Response {
  const encoder = new TextEncoder();
  let cancelled = false;

  // 클라이언트가 끊긴 뒤의 enqueue/close는 throw하므로 무시한다.
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, message: object) => {
    if (cancelled) return;
    try {
      controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
    } catch {
      cancelled = true;
    }
  };

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = '';
      try {
        for await (const text of deltas) {
          if (cancelled) break;
          full += text;
          send(controller, { type: 'delta', text });
        }
        send(controller, { type: 'done', code: ensureRenderCall(stripCodeFences(full)) });
      } catch (err) {
        send(controller, { type: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
      } finally {
        try {
          controller.close();
        } catch {
          // 이미 닫힌 스트림
        }
      }
    },
    // 클라이언트 연결이 끊기면 루프를 멈춰 업스트림 읽기를 취소(streamText의 finally)한다.
    cancel() {
      cancelled = true;
      void deltas.return(undefined);
    },
  });

  return new Response(body, {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
  });
}

const server = Bun.serve({
  port: 3002,
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return Response.json(
        {
          envKeys: {
            anthropic: !!ENV_KEYS.anthropic,
            google: !!ENV_KEYS.google,
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/generate/stream') {
      try {
        const { prompt, apiKey, provider = 'anthropic' } = (await req.json()) as {
          prompt: string;
          apiKey?: string;
          provider?: Provider;
        };

        const resolvedKey = resolveApiKey(provider, apiKey);

        if (!resolvedKey) {
          return Response.json(
            { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        if (!prompt) {
          return Response.json(
            { error: 'Prompt is required' },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        const upstream =
          provider === 'google'
            ? streamText(await openGoogleStreamWithFallback(prompt, resolvedKey), parseGoogleEvent)
            : streamText(await openAnthropicStream(prompt, resolvedKey), parseAnthropicEvent);

        return ndjsonStream(upstream);
      } catch (err) {
        return errorResponse(err);
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      try {
        const { prompt, apiKey, provider = 'anthropic' } = (await req.json()) as {
          prompt: string;
          apiKey?: string;
          provider?: Provider;
        };

        const resolvedKey = resolveApiKey(provider, apiKey);

        if (!resolvedKey) {
          return Response.json(
            { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        if (!prompt) {
          return Response.json(
            { error: 'Prompt is required' },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        const text =
          provider === 'google'
            ? await callGoogle(prompt, resolvedKey)
            : await callAnthropic(prompt, resolvedKey);

        const code = ensureRenderCall(stripCodeFences(text));

        return Response.json({ code }, { headers: CORS_HEADERS });
      } catch (err) {
        return errorResponse(err);
      }
    }

    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS }
    );
  },
});

console.log(`API server running at http://localhost:${server.port}`);
