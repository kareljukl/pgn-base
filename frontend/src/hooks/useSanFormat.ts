import { useSyncExternalStore } from 'react';
import type { SanMode } from '../lib/sanFormat';

const STORAGE_KEY = 'pgn-base-san-format';

let current: SanMode = readInitial();
const listeners = new Set<() => void>();

function readInitial(): SanMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'cs' || v === 'fig' || v === 'en') return v;
  } catch {
    // ignore
  }
  return 'en';
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): SanMode {
  return current;
}

export function setSanMode(mode: SanMode): void {
  if (current === mode) return;
  current = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore quota / disabled storage
  }
  listeners.forEach((l) => l());
}

export function useSanFormat(): SanMode {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
