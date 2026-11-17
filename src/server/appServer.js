import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REGIONS } from '../catalog/regions.js';
import { TARGETS, getTargetById } from '../catalog/targets.js';
import { evaluateScan, OPERATIONAL_NOTES } from '../engine/assessment.js';
import { probeNetwork } from '../probes/networkProbe.js';
import { probeSystem } from '../probes/systemProbe.js';
import { applyBasicVpnFix, openVpnSettings, probeVpn } from '../probes/vpnProbe.js';
import { alignOsToTarget, getSwitcherStatus, revertOsFromBackup } from '../switcher/osSwitcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function normalizeCustomDomains(input) {
  if (Array.isArray(input)) {
    return input.map((d) => String(d || '').trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/[,\s;]+/)
      .map((d) => d.trim())
      .filter(Boolean);
  }
  return [];
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readJsonBody(req, maxBytes = 256 * 1024) {
  if (req.body !== undefined) {
    if (req.body === null || req.body === '') {
      return {};
    }
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return req.body;
    }
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8').trim() : String(req.body).trim();
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('Invalid JSON payload');
    }
  }

  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

async function serveStatic(reqPath, res) {
  const cleanPath = reqPath === '/' ? '/index.html' : reqPath;
  const rel = cleanPath.replace(/^\/+/, '');
  const resolved = path.resolve(PUBLIC_DIR, rel);

  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== PUBLIC_DIR) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const stat = await fsp.stat(resolved);
    if (!stat.isFile()) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = await fsp.readFile(resolved);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    sendJson(res, 500, { error: 'Failed to read static asset' });
  }
}

async function runFullScanPipeline({
  expectedRegion = '',
  targetId = 'claude',
  customDomains = [],
  autoFixOnVpn = true,
  forceFix = false,
  ipHistory = [],
} = {}) {
  const domains = normalizeCustomDomains(customDomains);
  const targetSpec = getTargetById(targetId);

  const [system, initialVpn] = await Promise.all([probeSystem(), probeVpn()]);
  let vpn = initialVpn;
  let network = await probeNetwork({
    targetSpec,
    customDomains: domains,
    systemProxy: vpn.systemProxy,
    vpnActive: vpn.active,
  });

  let fixResult = null;
  if (forceFix || (autoFixOnVpn && vpn.active)) {
    fixResult = await applyBasicVpnFix(vpn);
    vpn = await probeVpn();
    network = await probeNetwork({
      targetSpec,
      customDomains: domains,
      systemProxy: vpn.systemProxy,
      vpnActive: vpn.active,
    });
  }

  return evaluateScan({
    system,
    vpn,
    network,
    expectedRegion: String(expectedRegion || '').trim().toLowerCase(),
    targetId: targetSpec.id,
    fixResult,
    ipHistory,
  });
}

function trySpawnDetached(command, args) {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

async function launchAppWindow(url) {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const edgeCandidates = [
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      'msedge',
    ];
    for (const exe of edgeCandidates) {
      if (exe.includes('\\') && !fs.existsSync(exe)) continue;
      if (await trySpawnDetached(exe, [`--app=${url}`, '--window-size=1220,880'])) {
        return;
      }
    }

    const chromeCandidates = [
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      localAppData ? path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
      'chrome',
    ].filter(Boolean);
    for (const exe of chromeCandidates) {
      if (exe.includes('\\') && !fs.existsSync(exe)) continue;
      if (await trySpawnDetached(exe, [`--app=${url}`, '--window-size=1220,880'])) {
        return;
      }
    }

    await trySpawnDetached('cmd', ['/c', 'start', '', url]);
    return;
  }

  if (process.platform === 'darwin') {
    await trySpawnDetached('open', [url]);
    return;
  }

  await trySpawnDetached('xdg-open', [url]);
}

/**
 * Creates the HTTP request handler for WilsonGeoGuard API endpoints and static UI.
 */
export function createAppRequestHandler() {
  let lastAssessment = null;
  let ipHistory = [];

  return async (req, res) => {
    try {
      const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = urlObj.pathname;
      const method = (req.method || 'GET').toUpperCase();

      if (method === 'GET' && pathname === '/api/bootstrap') {
        const osSwitcher = await getSwitcherStatus();
        sendJson(res, 200, {
          regions: REGIONS,
          targets: TARGETS,
          lastAssessment,
          ipHistory,
          notes: OPERATIONAL_NOTES,
          osSwitcher,
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/os-switcher/status') {
        const backupPath = urlObj.searchParams.get('backupPath');
        const osSwitcher = await getSwitcherStatus(backupPath ? { backupPath } : {});
        sendJson(res, 200, osSwitcher);
        return;
      }

      if (method === 'POST' && pathname === '/api/os-switcher/align') {
        let body;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          sendJson(res, 400, { error: err?.message || 'Bad request' });
          return;
        }
        const backupPath = typeof body.backupPath === 'string' && body.backupPath.trim() ? body.backupPath.trim() : undefined;
        const switcherResult = await alignOsToTarget({
          mode: body.mode,
          region: body.region,
          timezone: body.timezone,
          locale: body.locale,
          egress: body.egress,
          includeSystemLocale: body.includeSystemLocale !== undefined ? Boolean(body.includeSystemLocale) : false,
          forceBackup: body.forceBackup !== undefined ? Boolean(body.forceBackup) : false,
          dryRun: body.dryRun !== undefined ? Boolean(body.dryRun) : false,
          ...(backupPath ? { backupPath } : {}),
        });
        const osSwitcher = await getSwitcherStatus(backupPath ? { backupPath } : {});
        const assessment = await runFullScanPipeline({
          expectedRegion: body.expectedRegion ?? '',
          targetId: body.targetId ?? 'claude',
          customDomains: body.customDomains ?? [],
          autoFixOnVpn: body.autoFixOnVpn !== undefined ? Boolean(body.autoFixOnVpn) : true,
          forceFix: false,
          ipHistory,
        });
        lastAssessment = assessment;
        ipHistory = assessment.ipHistory;
        sendJson(res, 200, { switcherResult, osSwitcher, assessment });
        return;
      }

      if (method === 'POST' && pathname === '/api/os-switcher/revert') {
        let body;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          sendJson(res, 400, { error: err?.message || 'Bad request' });
          return;
        }
        const backupPath = typeof body.backupPath === 'string' && body.backupPath.trim() ? body.backupPath.trim() : undefined;
        const switcherResult = await revertOsFromBackup({
          dryRun: body.dryRun !== undefined ? Boolean(body.dryRun) : false,
          keepBackup: body.keepBackup !== undefined ? Boolean(body.keepBackup) : false,
          ...(backupPath ? { backupPath } : {}),
        });
        const osSwitcher = await getSwitcherStatus(backupPath ? { backupPath } : {});
        const assessment = await runFullScanPipeline({
          expectedRegion: body.expectedRegion ?? '',
          targetId: body.targetId ?? 'claude',
          customDomains: body.customDomains ?? [],
          autoFixOnVpn: body.autoFixOnVpn !== undefined ? Boolean(body.autoFixOnVpn) : true,
          forceFix: false,
          ipHistory,
        });
        lastAssessment = assessment;
        ipHistory = assessment.ipHistory;
        sendJson(res, 200, { switcherResult, osSwitcher, assessment });
        return;
      }

      if (method === 'POST' && pathname === '/api/scan') {
        let body;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          sendJson(res, 400, { error: err?.message || 'Bad request' });
          return;
        }
        const assessment = await runFullScanPipeline({
          expectedRegion: body.expectedRegion ?? '',
          targetId: body.targetId ?? 'claude',
          customDomains: body.customDomains ?? [],
          autoFixOnVpn: body.autoFixOnVpn !== undefined ? Boolean(body.autoFixOnVpn) : true,
          forceFix: false,
          ipHistory,
        });
        lastAssessment = assessment;
        ipHistory = assessment.ipHistory;
        sendJson(res, 200, assessment);
        return;
      }

      if (method === 'POST' && pathname === '/api/fix') {
        let body;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          sendJson(res, 400, { error: err?.message || 'Bad request' });
          return;
        }
        const assessment = await runFullScanPipeline({
          expectedRegion: body.expectedRegion ?? '',
          targetId: body.targetId ?? 'claude',
          customDomains: body.customDomains ?? [],
          autoFixOnVpn: true,
          forceFix: true,
          ipHistory,
        });
        lastAssessment = assessment;
        ipHistory = assessment.ipHistory;
        sendJson(res, 200, assessment);
        return;
      }

      if (method === 'POST' && pathname === '/api/open-vpn-settings') {
        const result = await openVpnSettings();
        sendJson(res, 200, result);
        return;
      }

      if (method === 'GET') {
        await serveStatic(pathname, res);
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      sendJson(res, 500, { error: err?.message || 'Internal server error' });
    }
  };
}

/**
 * Creates the local HTTP server for WilsonGeoGuard API endpoints and static desktop UI.
 */
export function createAppServer() {
  return http.createServer(createAppRequestHandler());
}

function listenWithFallback(server, preferredPort) {
  const attempts = preferredPort === 0 ? [0] : [preferredPort, preferredPort + 1, preferredPort + 2, 0];

  const tryPort = (index) =>
    new Promise((resolve, reject) => {
      const candidate = attempts[index];
      const onError = (err) => {
        server.removeListener('listening', onListening);
        if (err?.code === 'EADDRINUSE' && index + 1 < attempts.length) {
          resolve(tryPort(index + 1));
        } else {
          reject(err);
        }
      };
      const onListening = () => {
        server.removeListener('error', onError);
        const addr = server.address();
        resolve(typeof addr === 'object' && addr ? addr.port : candidate);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(candidate, '127.0.0.1');
    });

  return tryPort(0);
}

/**
 * Starts the WilsonGeoGuard HTTP server on 127.0.0.1 and optionally opens the desktop window.
 */
export async function startServer({ port = 4380, openWindow = true } = {}) {
  const server = createAppServer();
  const actualPort = await listenWithFallback(server, Number(port) || 4380);
  const url = `http://127.0.0.1:${actualPort}`;
  console.log(`WilsonGeoGuard activo en ${url}`);

  if (openWindow) {
    await launchAppWindow(url);
  }

  return { server, port: actualPort, url };
}
