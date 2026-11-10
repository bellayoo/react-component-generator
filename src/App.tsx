import { useState, useEffect } from 'react';
import { PromptInput } from './components/PromptInput';
import { ComponentCard } from './components/ComponentCard';
import { StreamingCard } from './components/StreamingCard';
import { useComponentGenerator } from './hooks/useComponentGenerator';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import { addToHistory } from './utils/storage';
import type { Provider } from './types';
import './App.css';

const PROVIDER_CONFIG = {
  anthropic: { label: 'Anthropic', placeholder: 'sk-ant-...' },
  google: { label: 'Google', placeholder: 'AIza...' },
} as const;

function App() {
  const [apiKey, setApiKey] = useLocalStorageState('rcg:apiKey', '', (raw) =>
    typeof raw === 'string' ? raw : '',
  );
  const [showKey, setShowKey] = useState(false);
  const [provider, setProvider] = useLocalStorageState<Provider>('rcg:provider', 'google', (raw) =>
    typeof raw === 'string' && Object.hasOwn(PROVIDER_CONFIG, raw) ? (raw as Provider) : 'google',
  );
  const [history, setHistory] = useLocalStorageState<string[]>('rcg:history', [], (raw) =>
    Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : [],
  );
  const [envKeys, setEnvKeys] = useState<Record<Provider, boolean>>({
    anthropic: false,
    google: false,
  });
  const [pendingPrompt, setPendingPrompt] = useState('');
  const { components, isLoading, streamingCode, error, generate, removeComponent, clearAll } =
    useComponentGenerator();

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => setEnvKeys(data.envKeys))
      .catch(() => {});
  }, []);

  const hasEnvKey = envKeys[provider];

  const handleGenerate = (prompt: string) => {
    if (!apiKey.trim() && !hasEnvKey) {
      alert(`${PROVIDER_CONFIG[provider].label} API 키를 입력하거나 .env에 설정해주세요.`);
      return;
    }
    setPendingPrompt(prompt);
    setHistory((prev) => addToHistory(prev, prompt));
    generate(prompt, apiKey || undefined, provider);
  };

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    setApiKey('');
  };

  const activeProvider = PROVIDER_CONFIG[provider].label;

  return (
    <div className="app">
      <header className="taskbar">
        <div className="taskbar-brand">
          <span className="brand-mark" aria-hidden="true">
            RC
          </span>
          <span>React 컴포넌트 생성기</span>
        </div>
        <div className="tray" aria-label="현재 작업 상태">
          <span className="tray-cell">
            모델 <strong>{activeProvider}</strong>
          </span>
          <span className="tray-cell">
            컴포넌트 <strong>{components.length}개</strong>
          </span>
        </div>
      </header>

      <div className="desktop">
      <main className="workspace">
        <section className="window composer-panel" aria-label="컴포넌트 생성">
          <div className="titlebar">
            <span className="titlebar-title">새 컴포넌트</span>
          </div>
          <div className="window-body">
            <PromptInput onGenerate={handleGenerate} isLoading={isLoading} history={history} />
          </div>
        </section>

        <aside className="window settings-panel" aria-label="실행 설정">
          <div className="titlebar">
            <h2 className="titlebar-title">실행 설정</h2>
          </div>
          <div className="window-body">
            <div className="provider-select">
              <label htmlFor="provider">AI 모델 제공사</label>
              <select
                id="provider"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as Provider)}
              >
                {Object.entries(PROVIDER_CONFIG).map(([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="api-key-input">
              <label htmlFor="api-key">API 키</label>
              <div className="api-key-field">
                <input
                  id="api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    hasEnvKey
                      ? '서버 키 사용 중 (직접 입력으로 덮어쓰기 가능)'
                      : PROVIDER_CONFIG[provider].placeholder
                  }
                />
                <button
                  className="btn-toggle-key"
                  onClick={() => setShowKey(!showKey)}
                  type="button"
                >
                  {showKey ? '숨기기' : '보기'}
                </button>
              </div>
              <p className={`key-status ${hasEnvKey ? 'key-status--ready' : ''}`}>
                {hasEnvKey
                  ? '.env 키가 연결되어 있습니다.'
                  : '직접 입력하거나 서버 환경변수를 설정하세요.'}
              </p>
            </div>
          </div>
        </aside>
      </main>

      {error && (
        <div className="window error-banner" role="alert">
          <div className="titlebar titlebar--error">
            <span className="titlebar-title">오류</span>
          </div>
          <div className="window-body">
            <p>{error}</p>
          </div>
        </div>
      )}

      <section className="results-section">
        {(components.length > 0 || isLoading) && (
          <div className="results-header">
            <h2>생성된 컴포넌트</h2>
            <button className="btn-clear" onClick={clearAll} disabled={isLoading}>
              전체 삭제
            </button>
          </div>
        )}

        {components.length === 0 && !isLoading && (
          <div className="window empty-state">
            <div className="titlebar">
              <span className="titlebar-title">결과</span>
            </div>
            <div className="window-body">
              <div className="empty-screen">
                <p>
                  아직 만든 컴포넌트가 없습니다
                  <span className="cursor" aria-hidden="true" />
                </p>
              </div>
              <h2>새 컴포넌트를 생성해보세요.</h2>
              <p className="empty-hint">
                만들고 싶은 UI를 설명하고 <strong>컴포넌트 생성</strong>을 누르면, 이곳에
                미리보기와 코드가 창으로 열립니다.
              </p>
            </div>
          </div>
        )}

        <div className="results-grid">
          {isLoading && <StreamingCard prompt={pendingPrompt} code={streamingCode} />}
          {components.map((component) => (
            <ComponentCard
              key={component.id}
              component={component}
              onRemove={removeComponent}
              onRegenerate={handleGenerate}
              isLoading={isLoading}
            />
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}

export default App;
