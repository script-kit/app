import { kitPath } from '@johnlindquist/kit/core/utils';
import type { Choice } from '@johnlindquist/kit/types';
import { remove } from 'lodash-es';
import { createLogger } from './log-utils';
import { kitClipboard, kitState, kitStore } from './state';

const log = createLogger('clipboard.ts');

export interface ClipboardItem extends Choice {
  type: string;
  timestamp: string;
  maybeSecret: boolean;
  value: any;
  /** Source application that copied this item */
  sourceApp?: string;
  /** Whether this item is pinned/favorite (won't be evicted by LRU) */
  pinned?: boolean;
  /** Secret risk level: 'none' | 'low' | 'medium' | 'high' */
  secretRisk?: 'none' | 'low' | 'medium' | 'high';
  /** Content hash for deduplication */
  contentHash?: string;
}

// ============================================================================
// Shannon Entropy for Secret Detection
// ============================================================================

/**
 * Calculate Shannon entropy of a string.
 * Higher entropy (> 4.5) often indicates random/secret data like API keys.
 */
export function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;

  const len = str.length;
  const frequencies: Record<string, number> = {};

  for (const char of str) {
    frequencies[char] = (frequencies[char] || 0) + 1;
  }

  let entropy = 0;
  for (const count of Object.values(frequencies)) {
    const probability = count / len;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

// ============================================================================
// Secret Detection Patterns
// ============================================================================

/** Known secret patterns for various services */
const SECRET_PATTERNS = {
  // API Keys & Tokens
  jwt: /^eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]+$/,
  awsAccessKey: /^AKIA[0-9A-Z]{16}$/,
  awsSecretKey: /^[A-Za-z0-9/+=]{40}$/,
  githubPat: /^(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}$/,
  githubOldToken: /^[a-f0-9]{40}$/,
  openaiKey: /^sk-[A-Za-z0-9]{20,}$/,
  openaiProjectKey: /^sk-proj-[A-Za-z0-9_-]{40,}$/,
  stripeKey: /^(sk|pk)_(test|live)_[A-Za-z0-9]{24,}$/,
  slackToken: /^xox[baprs]-[A-Za-z0-9-]+$/,
  npmToken: /^npm_[A-Za-z0-9]{36}$/,
  herokuKey: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
  twilioSid: /^AC[a-f0-9]{32}$/,
  twilioToken: /^[a-f0-9]{32}$/,
  sendgridKey: /^SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/,
  mailgunKey: /^key-[a-f0-9]{32}$/,
  firebaseKey: /^AIza[A-Za-z0-9_-]{35}$/,
  googleApiKey: /^AIza[A-Za-z0-9_-]{35}$/,
  azureKey: /^[a-f0-9]{32}$/,
  discordToken: /^[MN][A-Za-z0-9]{23,}\.[A-Za-z0-9-_]{6}\.[A-Za-z0-9-_]{27,}$/,
  anthropicKey: /^sk-ant-[A-Za-z0-9-_]{90,}$/,

  // NVIDIA API keys (nvapi-...)
  nvidiaApiKey: /^nvapi-[A-Za-z0-9_-]{40,}$/,

  // Hugging Face tokens
  huggingFaceToken: /^hf_[A-Za-z0-9]{30,}$/,

  // Replicate API tokens
  replicateToken: /^r8_[A-Za-z0-9]{30,}$/,

  // Groq API keys
  groqApiKey: /^gsk_[A-Za-z0-9]{40,}$/,

  // Cohere API keys
  cohereApiKey: /^[A-Za-z0-9]{40}$/,

  // Together AI keys
  togetherAiKey: /^[a-f0-9]{64}$/,

  // Vercel tokens
  vercelToken: /^[A-Za-z0-9]{24}$/,

  // Supabase keys
  supabaseKey: /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,

  // Cloudflare API tokens
  cloudflareToken: /^[A-Za-z0-9_-]{40}$/,

  // Private Keys & Certificates
  privateKey: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
  certificate: /-----BEGIN\s+CERTIFICATE-----/,

  // Database Connection Strings
  dbConnection: /^(mongodb|mysql|postgres|postgresql|redis):\/\/[^\s]+$/i,

  // Generic patterns
  bearerToken: /^Bearer\s+[A-Za-z0-9._-]+$/i,
  basicAuth: /^Basic\s+[A-Za-z0-9+/]+=*$/i,

  // Generic API key patterns with common prefixes
  genericApiKey:
    /^(api[_-]?key|apikey|api[_-]?token|access[_-]?token|auth[_-]?token|secret[_-]?key)[_-]?[A-Za-z0-9_-]{20,}$/i,
  prefixedToken: /^[a-z]{2,8}[_-][A-Za-z0-9_-]{30,}$/,
};

/**
 * Detect if a string is likely a secret using multiple heuristics:
 * 1. Pattern matching for known secret formats
 * 2. Shannon entropy analysis
 * 3. Character composition analysis
 */
export function detectSecret(text: string): {
  maybeSecret: boolean;
  risk: 'none' | 'low' | 'medium' | 'high';
  matchedPattern?: string;
  entropy?: number;
} {
  if (!text || text.length < 8 || text.length > 500) {
    return { maybeSecret: false, risk: 'none' };
  }

  // Skip multiline text (usually not secrets)
  if (text.includes('\n')) {
    return { maybeSecret: false, risk: 'none' };
  }

  // Check known patterns first (highest confidence)
  for (const [patternName, pattern] of Object.entries(SECRET_PATTERNS)) {
    if (pattern.test(text)) {
      log.info(`🔐 Detected ${patternName} pattern`);
      return {
        maybeSecret: true,
        risk: 'high',
        matchedPattern: patternName,
      };
    }
  }

  // Entropy-based detection
  const entropy = calculateShannonEntropy(text);

  // High entropy with no spaces often indicates secrets
  if (entropy > 4.5 && !text.includes(' ')) {
    // Additional checks to reduce false positives
    const hasDigits = /\d/.test(text);
    const hasLetters = /[a-zA-Z]/.test(text);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(text);
    const isMixedCase = /[a-z]/.test(text) && /[A-Z]/.test(text);

    // Likely a secret if has mixed character types
    if (hasDigits && hasLetters && (hasSpecial || isMixedCase)) {
      return {
        maybeSecret: true,
        risk: entropy > 5 ? 'high' : 'medium',
        entropy,
      };
    }
  }

  // Medium entropy with specific patterns
  if (entropy > 3.5 && entropy <= 4.5) {
    // Check for API key-like patterns (prefix + alphanumeric)
    if (/^[a-z]{2,10}[_-][A-Za-z0-9]{20,}$/i.test(text)) {
      return {
        maybeSecret: true,
        risk: 'medium',
        entropy,
      };
    }
  }

  // Legacy regex check (fallback)
  const legacySecretRegex = /^(?=.*[0-9])(?=.*[a-zA-Z])[a-zA-Z0-9!@#$%^&*()\-_=+{}[\]<>;:,.|~]{5,}$/i;
  if (legacySecretRegex.test(text) && !text.includes(' ')) {
    return {
      maybeSecret: true,
      risk: 'low',
      entropy,
    };
  }

  return { maybeSecret: false, risk: 'none', entropy };
}

// ============================================================================
// Content Hashing for Deduplication
// ============================================================================

/**
 * Simple hash function for deduplication (not cryptographic, just fast)
 */
export function hashContent(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

export const getClipboardHistory = async () => {
  const history = await kitClipboard.store.get('history');
  if (kitState.isMac && kitStore.get('accessibilityAuthorized')) {
    const choice = {
      name: 'Clipboard history requires accessibility access',
      description: 'Unable to read clipboard history',
      value: '__not-authorized__',
    };
    log.info(choice);

    await kitClipboard.store.set('history', [choice, ...history]);
  }

  return [];
};

export const removeFromClipboardHistory = async (itemId: string) => {
  const clipboardHistory = await kitClipboard.store.get('history');
  const index = clipboardHistory.findIndex(({ id }) => itemId === id);
  if (index > -1) {
    clipboardHistory.splice(index, 1);
  } else {
    log.info(`😅 Could not find ${itemId} in clipboard history`);
  }

  await kitClipboard.store.set('history', clipboardHistory);
};

export const clearClipboardHistory = () => {
  kitClipboard.store.set('history', []);
};

export const addToClipboardHistory = async (clipboardItem: ClipboardItem) => {
  const clipboardHistory = await kitClipboard.store.get('history');

  // Generate content hash for efficient deduplication
  if (clipboardItem.type === 'text' && typeof clipboardItem.value === 'string') {
    clipboardItem.contentHash = hashContent(clipboardItem.value);
  }

  // Remove duplicates (by value or hash)
  remove(clipboardHistory, (item: ClipboardItem) => {
    if (item.pinned) return false; // Never remove pinned items via dedup
    return item.value === clipboardItem?.value || (item.contentHash && item.contentHash === clipboardItem.contentHash);
  });

  log.silly('📋 Clipboard', clipboardItem);

  clipboardHistory.unshift(clipboardItem);
  const maxHistory = kitState?.kenvEnv?.KIT_CLIPBOARD_HISTORY_LIMIT
    ? Number.parseInt(kitState?.kenvEnv?.KIT_CLIPBOARD_HISTORY_LIMIT, 10)
    : 256;

  // Evict oldest non-pinned items when over limit
  while (clipboardHistory.length > maxHistory) {
    // Find the oldest non-pinned item from the end
    let evicted = false;
    for (let i = clipboardHistory.length - 1; i >= 0; i--) {
      if (!clipboardHistory[i].pinned) {
        clipboardHistory.splice(i, 1);
        evicted = true;
        break;
      }
    }
    // If all items are pinned, stop trying to evict
    if (!evicted) break;
  }

  log.info(`📋 Clipboard history: ${clipboardHistory.length}/${maxHistory}`);

  await kitClipboard.store.set('history', clipboardHistory);
};

/**
 * Toggle pinned status for a clipboard item
 */
export const togglePinClipboardItem = async (itemId: string): Promise<boolean> => {
  const clipboardHistory = await kitClipboard.store.get('history');
  const item = clipboardHistory.find(({ id }: ClipboardItem) => id === itemId);

  if (!item) {
    log.info(`😅 Could not find ${itemId} to toggle pin`);
    return false;
  }

  item.pinned = !item.pinned;
  log.info(`📌 ${item.pinned ? 'Pinned' : 'Unpinned'} clipboard item: ${itemId}`);

  await kitClipboard.store.set('history', clipboardHistory);
  return item.pinned;
};

/**
 * Get only pinned clipboard items
 */
export const getPinnedClipboardHistory = async (): Promise<ClipboardItem[]> => {
  const clipboardHistory = await kitClipboard.store.get('history');
  return clipboardHistory.filter((item: ClipboardItem) => item.pinned);
};

/**
 * Search clipboard history by text content
 */
export const searchClipboardHistory = async (query: string): Promise<ClipboardItem[]> => {
  if (!query || query.trim().length === 0) {
    return kitClipboard.store.get('history');
  }

  const clipboardHistory = await kitClipboard.store.get('history');
  const lowerQuery = query.toLowerCase();

  return clipboardHistory.filter((item: ClipboardItem) => {
    // Search in name
    if (item.name?.toLowerCase().includes(lowerQuery)) return true;
    // Search in description
    if (item.description?.toLowerCase().includes(lowerQuery)) return true;
    // Search in value (text only, skip secrets)
    if (item.type === 'text' && !item.maybeSecret && typeof item.value === 'string') {
      if (item.value.toLowerCase().includes(lowerQuery)) return true;
    }
    // Search in source app
    if (item.sourceApp?.toLowerCase().includes(lowerQuery)) return true;
    return false;
  });
};

/**
 * Filter clipboard history by type or other criteria
 */
export const filterClipboardHistory = async (options: {
  type?: 'text' | 'image';
  sourceApp?: string;
  excludeSecrets?: boolean;
  pinnedOnly?: boolean;
  limit?: number;
}): Promise<ClipboardItem[]> => {
  let history = await kitClipboard.store.get('history');

  if (options.type) {
    history = history.filter((item: ClipboardItem) => item.type === options.type);
  }

  if (options.sourceApp) {
    const app = options.sourceApp.toLowerCase();
    history = history.filter((item: ClipboardItem) => item.sourceApp?.toLowerCase().includes(app));
  }

  if (options.excludeSecrets) {
    history = history.filter((item: ClipboardItem) => !item.maybeSecret);
  }

  if (options.pinnedOnly) {
    history = history.filter((item: ClipboardItem) => item.pinned);
  }

  if (options.limit && options.limit > 0) {
    history = history.slice(0, options.limit);
  }

  return history;
};

export const syncClipboardStore = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 200);
  });
  store(kitPath('db', 'clipboard.json'), {
    history: [],
  })
    .then((s) => {
      log.info(`📋 Clipboard store initialized: ${typeof s}`);
      kitClipboard.store = s;
      return s;
    })
    .catch((error) => {
      log.error(error);
    });
};
