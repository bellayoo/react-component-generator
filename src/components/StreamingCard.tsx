import { useEffect, useRef } from 'react';

interface StreamingCardProps {
  prompt: string;
  code: string;
}

export function StreamingCard({ prompt, code }: StreamingCardProps) {
  const codeRef = useRef<HTMLPreElement>(null);
  const lineCount = code ? code.split('\n').length : 0;

  useEffect(() => {
    const el = codeRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [code]);

  return (
    <div className="window component-card" role="status" aria-live="polite">
      <div className="titlebar">
        <span className="titlebar-title">생성 중</span>
      </div>
      <div className="card-header">
        <p className="card-prompt" title={prompt}>
          {prompt}
        </p>
      </div>
      <div className="card-tabs" role="tablist">
        <button role="tab" aria-selected={false} className="tab" disabled>
          미리보기
        </button>
        <button role="tab" aria-selected={true} className="tab tab--active">
          코드
        </button>
      </div>
      <div className="card-content">
        {code ? (
          <div className="code-panel">
            <pre className="code-block" ref={codeRef}>
              <code>{code}</code>
            </pre>
          </div>
        ) : (
          <div className="loading-card-body">
            <p>컴포넌트를 생성하고 있습니다...</p>
            <div className="progress" aria-hidden="true">
              <div className="progress-chunks" />
            </div>
          </div>
        )}
      </div>
      <div className="statusbar">
        <span>{lineCount}줄</span>
        <span>코드 생성 중...</span>
      </div>
    </div>
  );
}
