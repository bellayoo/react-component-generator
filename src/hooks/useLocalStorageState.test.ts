import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorageState } from './useLocalStorageState';

describe('useLocalStorageState', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('저장된 값이 없으면 초기값을 반환한다', () => {
    const { result } = renderHook(() => useLocalStorageState('k', 'init'));
    expect(result.current[0]).toBe('init');
  });

  it('값을 바꾸면 localStorage에 JSON으로 저장한다', () => {
    const { result } = renderHook(() => useLocalStorageState('k', 'init'));
    act(() => result.current[1]('changed'));
    expect(localStorage.getItem('k')).toBe(JSON.stringify('changed'));
  });

  it('마운트 시 저장된 값을 복원한다', () => {
    localStorage.setItem('k', JSON.stringify('saved'));
    const { result } = renderHook(() => useLocalStorageState('k', 'init'));
    expect(result.current[0]).toBe('saved');
  });

  it('저장된 JSON이 깨져 있으면 초기값으로 폴백한다', () => {
    localStorage.setItem('k', '{broken');
    const { result } = renderHook(() => useLocalStorageState('k', 'init'));
    expect(result.current[0]).toBe('init');
  });

  it('parse 함수가 있으면 복원한 값을 변환한다', () => {
    localStorage.setItem('k', JSON.stringify('2026-01-01T00:00:00.000Z'));
    const { result } = renderHook(() =>
      useLocalStorageState<Date>('k', new Date(0), (raw) => new Date(raw as string)),
    );
    expect(result.current[0].toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('parse 함수가 던지면 초기값으로 폴백한다', () => {
    localStorage.setItem('k', JSON.stringify('x'));
    const { result } = renderHook(() =>
      useLocalStorageState('k', 'init', () => {
        throw new Error('invalid');
      }),
    );
    expect(result.current[0]).toBe('init');
  });

  it('저장소 쓰기가 실패해도 상태 변경은 유지한다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = renderHook(() => useLocalStorageState('k', 'init'));
    act(() => result.current[1]('changed'));
    expect(result.current[0]).toBe('changed');
  });
});
