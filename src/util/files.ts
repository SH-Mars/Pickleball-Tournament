type ClaudeUse = (name: string) => Promise<unknown>;
interface DownloadsApi {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}
declare global {
  interface Window {
    claude?: { use?: ClaudeUse };
  }
}

async function downloadsCapability(): Promise<DownloadsApi | null> {
  const use = window.claude?.use;
  if (typeof use !== 'function') return null;
  try {
    const api = await Promise.race([use('downloads'), new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
    return (api as DownloadsApi | null) ?? null;
  } catch {
    return null;
  }
}

export type SaveOutcome = 'saved' | 'declined' | 'failed';

/**
 * Save a file for the user. Inside a sandboxed viewer this goes through the
 * host's download capability (which only accepts certain extensions, so .pbt is
 * offered as .pbt.json there); on a normal web page it is a plain download.
 */
export async function saveFile(filename: string, data: string | Blob): Promise<SaveOutcome> {
  const api = await downloadsCapability();
  if (api) {
    try {
      const name = filename.endsWith('.pbt') ? `${filename}.json` : filename;
      await api.save({ filename: name, data });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') return 'declined';
      // fall through to the plain download for any other failure
    }
  }
  try {
    const blob = typeof data === 'string' ? new Blob([data], { type: 'application/json' }) : data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'saved';
  } catch {
    return 'failed';
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function slug(s: string): string {
  return (s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tournament').slice(0, 60);
}

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the app works without it */
  }
}
