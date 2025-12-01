export interface GeminiConfig {
  baseurl: string;
  key: string;
}

const STORAGE_KEY = 'aistudioformove.gemini';

export function getStoredGeminiConfig(): GeminiConfig {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    const winAny = window as any;
    if (winAny.GEMINI_CONFIG) {
      return {
        baseurl: winAny.GEMINI_CONFIG.baseurl || 'https://generativelanguage.googleapis.com',
        key: winAny.GEMINI_CONFIG.key || '',
      };
    }
  }
  return {
    baseurl: 'https://generativelanguage.googleapis.com',
    key: '',
  };
}

export function setStoredGeminiConfig(config: GeminiConfig) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
}
