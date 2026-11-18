export const WINDOWS_BAT_LAUNCHER = `@echo off
title MYRA Local Laptop Companion Agent (127.0.0.1:3847)
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo Download Node.js LTS from https://nodejs.org/ and restart this window.
  pause
  exit /b 1
)
if not exist "myra-laptop-agent.mjs" (
  echo [ERROR] myra-laptop-agent.mjs was not found in "%~dp0".
  echo Keep myra-start-windows.bat and myra-laptop-agent.mjs in the same folder.
  pause
  exit /b 1
)
echo Starting MYRA Local Laptop Companion Agent on http://127.0.0.1:3847 ...
node "%~dp0myra-laptop-agent.mjs"
pause
`;

export const LAPTOP_AGENT_SCRIPT = `#!/usr/bin/env node
/**
 * MYRA Local Laptop Companion Agent
 * Runs strictly on 127.0.0.1:3847 with zero external dependencies.
 * Allows MYRA (browser) to execute authorized actions on your laptop.
 */
import http from 'node:http';
import os from 'node:os';
import { execFile } from 'node:child_process';

const PORT = 3847;
const HOST = '127.0.0.1';
const PLATFORM = os.platform();

const APP_MAP = {
  win32: {
    chrome: ['cmd', ['/c', 'start', '', 'chrome']],
    edge: ['cmd', ['/c', 'start', '', 'msedge']],
    firefox: ['cmd', ['/c', 'start', '', 'firefox']],
    vscode: ['cmd', ['/c', 'start', '', 'code']],
    code: ['cmd', ['/c', 'start', '', 'code']],
    notepad: ['notepad.exe', []],
    calculator: ['calc.exe', []],
    calc: ['calc.exe', []],
    terminal: ['cmd', ['/c', 'start', '', 'wt']],
    powershell: ['cmd', ['/c', 'start', '', 'powershell']],
    explorer: ['explorer.exe', []],
    spotify: ['cmd', ['/c', 'start', '', 'spotify:']],
    whatsapp: ['cmd', ['/c', 'start', '', 'whatsapp:']],
    settings: ['cmd', ['/c', 'start', '', 'ms-settings:']],
    vlc: ['cmd', ['/c', 'start', '', 'vlc']],
  },
  darwin: {
    chrome: ['open', ['-a', 'Google Chrome']],
    safari: ['open', ['-a', 'Safari']],
    firefox: ['open', ['-a', 'Firefox']],
    vscode: ['open', ['-a', 'Visual Studio Code']],
    code: ['open', ['-a', 'Visual Studio Code']],
    notes: ['open', ['-a', 'Notes']],
    calculator: ['open', ['-a', 'Calculator']],
    calc: ['open', ['-a', 'Calculator']],
    terminal: ['open', ['-a', 'Terminal']],
    finder: ['open', ['-a', 'Finder']],
    spotify: ['open', ['-a', 'Spotify']],
    whatsapp: ['open', ['-a', 'WhatsApp']],
    settings: ['open', ['-a', 'System Settings']],
    vlc: ['open', ['-a', 'VLC']],
  },
  linux: {
    chrome: ['google-chrome', []],
    firefox: ['firefox', []],
    vscode: ['code', []],
    code: ['code', []],
    calculator: ['gnome-calculator', []],
    calc: ['gnome-calculator', []],
    terminal: ['x-terminal-emulator', []],
    files: ['xdg-open', [os.homedir()]],
    spotify: ['spotify', []],
    vlc: ['vlc', []],
  },
};

function runExec(cmd, args, extraEnv = undefined) {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        windowsHide: true,
        ...(extraEnv ? { env: { ...process.env, ...extraEnv } } : {}),
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr?.trim() || err.message));
        } else {
          resolve(stdout?.trim() || '');
        }
      }
    );
  });
}

async function openUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL provided.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http and https URLs are permitted.');
  }
  const safeUrl = parsed.toString();
  if (PLATFORM === 'win32') {
    // Pass URL via env var so query strings containing '&' (WhatsApp / YouTube) are never split by cmd.exe
    await runExec(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process $env:MYRA_TARGET_URL'],
      { MYRA_TARGET_URL: safeUrl }
    );
  } else if (PLATFORM === 'darwin') {
    await runExec('open', [safeUrl]);
  } else {
    await runExec('xdg-open', [safeUrl]);
  }
  return { openedUrl: safeUrl };
}

async function openApp(rawName) {
  const key = String(rawName || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '');
  if (!key) throw new Error('Application name is required.');

  const platformApps = APP_MAP[PLATFORM] || {};
  const mapped = platformApps[key];
  if (!mapped) {
    const supported = Object.keys(platformApps).join(', ');
    throw new Error(
      \`App "\${rawName}" is not in the safe allowlist. Supported apps: \${supported}\`
    );
  }
  await runExec(mapped[0], mapped[1]);
  return { openedApp: key };
}

async function mediaControl(action) {
  const clean = String(action || '').toLowerCase().trim();
  if (PLATFORM === 'win32') {
    const keyMap = {
      volume_down: 174,
      volume_up: 175,
      mute: 173,
      next_track: 176,
      prev_track: 177,
      play_pause: 179,
    };
    const vk = keyMap[clean];
    if (!vk) throw new Error(\`Unsupported media action: \${clean}\`);
    const ps = \`$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]\${vk})\`;
    await runExec('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    return { action: clean };
  }

  if (PLATFORM === 'darwin') {
    const scriptMap = {
      volume_up: 'set volume output volume ((output volume of (get volume settings)) + 10)',
      volume_down: 'set volume output volume ((output volume of (get volume settings)) - 10)',
      mute: 'set volume output muted (not (output muted of (get volume settings)))',
      play_pause: 'tell application "System Events" to key code 16 using {command down}',
    };
    const script = scriptMap[clean];
    if (!script) throw new Error(\`Unsupported macOS media action: \${clean}\`);
    await runExec('osascript', ['-e', script]);
    return { action: clean };
  }

  const linuxMap = {
    volume_up: ['pactl', ['set-sink-volume', '@DEFAULT_SINK@', '+10%']],
    volume_down: ['pactl', ['set-sink-volume', '@DEFAULT_SINK@', '-10%']],
    mute: ['pactl', ['set-sink-mute', '@DEFAULT_SINK@', 'toggle']],
    play_pause: ['playerctl', ['play-pause']],
    next_track: ['playerctl', ['next']],
    prev_track: ['playerctl', ['previous']],
  };
  const cmd = linuxMap[clean];
  if (!cmd) throw new Error(\`Unsupported Linux media action: \${clean}\`);
  await runExec(cmd[0], cmd[1]);
  return { action: clean };
}

function getSystemInfo() {
  const totalGb = (os.totalmem() / 1024 ** 3).toFixed(1);
  const freeGb = (os.freemem() / 1024 ** 3).toFixed(1);
  return {
    hostname: os.hostname(),
    platform: PLATFORM,
    release: os.release(),
    arch: os.arch(),
    cpuCount: os.cpus().length,
    totalRamGb: Number(totalGb),
    freeRamGb: Number(freeGb),
    uptimeMinutes: Math.round(os.uptime() / 60),
  };
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === 'https:') return true;
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  const requestedHeaders = req.headers['access-control-request-headers'];
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    typeof requestedHeaders === 'string' && requestedHeaders.trim()
      ? requestedHeaders
      : 'Content-Type, Access-Control-Request-Private-Network'
  );
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(req, res, statusCode, data) {
  setCorsHeaders(req, res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(req, res);

  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    sendJson(req, res, 403, {
      ok: false,
      error: 'Origin rejected: only HTTPS or localhost origins may connect.',
    });
    return;
  }

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Content-Length': '0' });
      res.end();
      return;
    }

    const pathname = (req.url || '/').split('?')[0];

    if (req.method === 'GET' && (pathname === '/' || pathname === '/health')) {
      sendJson(req, res, 200, {
        ok: true,
        service: 'myra-laptop-companion',
        host: HOST,
        port: PORT,
        hostname: os.hostname(),
        platform: PLATFORM,
        nodeVersion: process.version,
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/action') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 64 * 1024) req.destroy();
      });
      req.on('end', async () => {
        try {
          const { action, payload = {} } = JSON.parse(body || '{}');
          let result;
          if (action === 'open_app') {
            result = await openApp(payload.appName);
          } else if (action === 'open_url') {
            result = await openUrl(payload.url);
          } else if (action === 'media_control') {
            result = await mediaControl(payload.action);
          } else if (action === 'system_info') {
            result = getSystemInfo();
          } else {
            throw new Error(\`Unknown action: \${action}\`);
          }

          sendJson(req, res, 200, { ok: true, ...result });
        } catch (err) {
          sendJson(req, res, 400, {
            ok: false,
            error: err instanceof Error ? err.message : 'Action failed',
          });
        }
      });
      return;
    }

    sendJson(req, res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    sendJson(req, res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : 'Internal agent error',
    });
  }
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      \`[MYRA Agent] Port \${PORT} on \${HOST} is already in use. The agent may already be running in another terminal.\`
    );
  } else if (err && err.code === 'EACCES') {
    console.error(
      \`[MYRA Agent] Permission denied binding \${HOST}:\${PORT}. Check Windows Firewall or security software.\`
    );
  } else {
    console.error('[MYRA Agent] Server error:', err?.message || err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(\`MYRA Laptop Companion listening on http://\${HOST}:\${PORT}\`);
  console.log(\`Health check: http://\${HOST}:\${PORT}/health\`);
  console.log(\`Host: \${os.hostname()} (\${PLATFORM}) · Node \${process.version}\`);
  console.log('Press Ctrl+C to stop.');
});
`;
