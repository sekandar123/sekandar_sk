export interface LaptopBridgeResult {
  ok: boolean;
  bridgeConnected: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:3847';
const HEALTH_TIMEOUT_MS = 3000;

type LoopbackRequestInit = RequestInit & {
  targetAddressSpace?: 'loopback' | 'local' | 'public';
};

async function fetchLoopback(
  endpoint: string,
  init: RequestInit
): Promise<Response> {
  const baseInit: LoopbackRequestInit = {
    ...init,
    mode: 'cors',
    credentials: 'omit',
    targetAddressSpace: 'loopback',
  };

  try {
    return await fetch(endpoint, baseInit);
  } catch (err) {
    // Fallback for browsers or environments that reject non-standard RequestInit fields
    if (err instanceof TypeError && !/failed to fetch|networkerror/i.test(err.message)) {
      const { targetAddressSpace: _ignored, ...standardInit } = baseInit;
      return fetch(endpoint, standardInit);
    }
    throw err;
  }
}

function formatFetchError(err: unknown, endpoint: string): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return `Request timed out after 3s connecting to ${endpoint}. Ensure node myra-laptop-agent.mjs is running on Windows and not blocked by firewall.`;
  }
  const raw = err instanceof Error ? err.message : String(err);
  const inIframe =
    typeof window !== 'undefined' && window.self !== window.top;
  const isHttps =
    typeof window !== 'undefined' && window.location.protocol === 'https:';

  if (err instanceof TypeError || /failed to fetch|networkerror/i.test(raw)) {
    if (inIframe) {
      return `Cannot reach ${endpoint} from inside an embedded preview iframe (browser Private/Local Network Access blocks 127.0.0.1 inside iframes). Start the agent on Windows, open MYRA in a Standalone Tab, and click Allow if Chrome/Edge asks for local network access.`;
    }
    if (isHttps) {
      return `Cannot reach ${endpoint}. Make sure myra-laptop-agent.mjs is running on Windows, allow "Local network access" (or Insecure content) in Chrome/Edge site permissions for this URL, and verify http://127.0.0.1:3847/health loads.`;
    }
    return `Cannot reach ${endpoint}. Start the agent on Windows with "node myra-laptop-agent.mjs" (or myra-start-windows.bat).`;
  }
  return raw || `Unable to reach ${endpoint}.`;
}

export class LaptopBridge {
  private baseUrl: string;
  private connected = false;
  private info: { hostname: string; platform: string } | null = null;
  private lastError: string | null = null;

  constructor(baseUrl = DEFAULT_BRIDGE_URL) {
    this.baseUrl = baseUrl;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getInfo(): { hostname: string; platform: string } | null {
    return this.info;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  async checkHealth(): Promise<{
    connected: boolean;
    info: { hostname: string; platform: string } | null;
    error: string | null;
  }> {
    const endpoint = `${this.baseUrl}/health`;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      HEALTH_TIMEOUT_MS
    );

    try {
      const res = await fetchLoopback(endpoint, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) {
        const error = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''} from ${endpoint}.`;
        this.connected = false;
        this.info = null;
        this.lastError = error;
        return { connected: false, info: null, error };
      }
      let json: {
        ok?: unknown;
        hostname?: string;
        platform?: string;
        error?: string;
      };
      try {
        json = (await res.json()) as {
          ok?: unknown;
          hostname?: string;
          platform?: string;
          error?: string;
        };
      } catch {
        const error = `Invalid JSON response from ${endpoint}.`;
        this.connected = false;
        this.info = null;
        this.lastError = error;
        return { connected: false, info: null, error };
      }

      if (json.ok === true) {
        this.connected = true;
        this.info = {
          hostname: json.hostname ?? 'Laptop',
          platform: json.platform ?? 'unknown',
        };
        this.lastError = null;
        return { connected: true, info: this.info, error: null };
      }

      const error =
        typeof json.error === 'string'
          ? json.error
          : `Unexpected response from ${endpoint} (missing {"ok": true}).`;
      this.connected = false;
      this.info = null;
      this.lastError = error;
      return { connected: false, info: null, error };
    } catch (err) {
      const error = formatFetchError(err, endpoint);
      this.connected = false;
      this.info = null;
      this.lastError = error;
      return { connected: false, info: null, error };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async execute(
    action: string,
    payload: Record<string, unknown> = {}
  ): Promise<LaptopBridgeResult> {
    const endpoint = `${this.baseUrl}/action`;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4500);

    try {
      const res = await fetchLoopback(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, payload }),
        signal: controller.signal,
      });

      let json: {
        ok?: unknown;
        error?: string;
        [key: string]: unknown;
      };
      try {
        json = (await res.json()) as {
          ok?: unknown;
          error?: string;
          [key: string]: unknown;
        };
      } catch {
        return {
          ok: false,
          bridgeConnected: true,
          error: `Invalid JSON response from ${endpoint} (HTTP ${res.status}).`,
        };
      }

      if (!res.ok || json.ok !== true) {
        return {
          ok: false,
          bridgeConnected: true,
          error:
            typeof json.error === 'string'
              ? json.error
              : `Laptop action "${action}" did not return {"ok": true} (HTTP ${res.status}).`,
        };
      }

      this.connected = true;
      this.lastError = null;
      return {
        ok: true,
        bridgeConnected: true,
        data: json,
      };
    } catch (err) {
      const detail = formatFetchError(err, endpoint);
      this.connected = false;
      this.info = null;
      this.lastError = detail;
      return {
        ok: false,
        bridgeConnected: false,
        error: detail,
      };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
}
