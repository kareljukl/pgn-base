import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'pgn-base-variant-arrows';

let enabled = readInitial();
const listeners = new Set<() => void>();

function readInitial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): boolean {
  return enabled;
}

function setEnabled(v: boolean): void {
  if (enabled === v) return;
  enabled = v;
  try {
    localStorage.setItem(STORAGE_KEY, v ? 'on' : 'off');
  } catch {
    // ignore quota / disabled storage
  }
  listeners.forEach((l) => l());
}

export function useVariantArrowsToggle(): readonly [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return [value, setEnabled];
}
