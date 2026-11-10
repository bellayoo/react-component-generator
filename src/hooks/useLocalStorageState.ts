import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';

// localStorage 접근은 비공개 모드·용량 초과·손상된 값으로 언제든 실패할 수 있다.
// 어떤 경우에도 앱이 깨지지 않도록 읽기는 초기값, 쓰기는 무시로 폴백한다.
export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
  parse?: (raw: unknown) => T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initialValue;
      const value = JSON.parse(raw);
      return parse ? parse(value) : (value as T);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // 저장 실패 시 메모리 상태만 유지한다.
    }
  }, [key, state]);

  return [state, setState];
}
