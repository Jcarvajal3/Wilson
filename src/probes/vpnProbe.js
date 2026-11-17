import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const TUNNEL_PREFIX_RE = /(?:^|[\s\-_./()])(tun|tap|wg|utun|ppp)\d*(?:$|[\s\-_./()])/i;
const TUNNEL_BRAND_KEYWORDS = [
  'wintun',
  'wireguard',
  'openvpn',
  'nordlynx',
  'proton',
  'clash',
  'mihomo',
  'sing-box',
  'tailscale',
  'zerotier',
  'warp',
  'cisco',
  'fortinet',
  'mullvad',
  'surfshark',
  'expressvpn',
  'windscribe',
];
const TUNNEL_EXCLUDE_RE = /(?:teredo|isatap|6to4|ip-https|loopback|wan miniport)/i;

const KNOWN_VPN_PROCESSES = [
  'wireguard.exe',
  'wireguard-go.exe',
  'openvpn.exe',
  'openvpn-gui.exe',
  'clash-verge.exe',
  'verge-mihomo.exe',
  'mihomo.exe',
  'clash.exe',
  'sing-box.exe',
  'v2ray.exe',
  'xray.exe',
  'NordVPN.exe',
  'nordvpn-service.exe',
  'ProtonVPN.exe',
  'ProtonVPNService.exe',
  'warp-svc.exe',
  'Cloudflare WARP.exe',
  'tailscaled.exe',
  'tailscale-ipn.exe',
  'mullvad-daemon.exe',
  'ExpressVPN.exe',
  'Surfshark.exe',
  'windscribe.exe',
  'zerotier-one_x64.exe',
  'vpngui.exe',
];

const KNOWN_PROCESS_LABELS = new Map([
  ['wireguard.exe', 'WireGuard'],
  ['wireguard-go.exe', 'WireGuard'],
  ['openvpn.exe', 'OpenVPN'],
  ['openvpn-gui.exe', 'OpenVPN GUI'],
  ['clash-verge.exe', 'Clash Verge'],
  ['verge-mihomo.exe', 'Clash Verge (Mihomo)'],
  ['mihomo.exe', 'Mihomo / Clash'],
  ['clash.exe', 'Clash'],
  ['sing-box.exe', 'sing-box'],
  ['v2ray.exe', 'V2Ray'],
  ['xray.exe', 'Xray'],
  ['nordvpn.exe', 'NordVPN'],
  ['nordvpn-service.exe', 'NordVPN'],
  ['protonvpn.exe', 'Proton VPN'],
  ['protonvpnservice.exe', 'Proton VPN'],
  ['warp-svc.exe', 'Cloudflare WARP'],
  ['cloudflare warp.exe', 'Cloudflare WARP'],
  ['tailscaled.exe', 'Tailscale'],
  ['tailscale-ipn.exe', 'Tailscale'],
  ['mullvad-daemon.exe', 'Mullvad VPN'],
  ['expressvpn.exe', 'ExpressVPN'],
  ['surfshark.exe', 'Surfshark'],
  ['windscribe.exe', 'Windscribe'],
  ['zerotier-one_x64.exe', 'ZeroTier'],
  ['vpngui.exe', 'Cisco AnyConnect / VPN GUI'],
]);

const KNOWN_PROCESS_SET = new Set(
  KNOWN_VPN_PROCESSES.flatMap((name) => {
    const lower = name.toLowerCase();
    return lower.endsWith('.exe') ? [lower, lower.slice(0, -4)] : [lower];
  }),
);

const ALWAYS_ON_NOTE =
  'Always-on VPN debe activarse desde la Configuración de VPN del sistema (en desktop no se fuerza vía settings).';

const INTERNET_SETTINGS_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

async function runCmd(cmd, args = [], timeout = 3000) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, code: 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') };
  } catch (err) {
    return {
      ok: false,
      code: typeof err?.code === 'number' ? err.code : 1,
      stdout: String(err?.stdout ?? ''),
      stderr: String(err?.stderr ?? err?.message ?? ''),
    };
  }
}

function isTunnelText(text) {
  if (!text) return false;
  const s = String(text);
  if (TUNNEL_EXCLUDE_RE.test(s) && !TUNNEL_BRAND_KEYWORDS.some((kw) => s.toLowerCase().includes(kw))) {
    return false;
  }
  if (TUNNEL_PREFIX_RE.test(s)) return true;
  const lower = s.toLowerCase();
  return TUNNEL_BRAND_KEYWORDS.some((kw) => lower.includes(kw));
}

function friendlyProcessLabel(procName) {
  const lower = String(procName || '').toLowerCase();
  return (
    KNOWN_PROCESS_LABELS.get(lower) ||
    KNOWN_PROCESS_LABELS.get(`${lower}.exe`) ||
    procName
  );
}

function parseCsvLine(line) {
  const cols = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cols.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

export function isGlobalIpv6(address) {
  if (!address) return false;
  const clean = String(address).split('%')[0].trim().toLowerCase();
  if (!clean.includes(':')) return false;
  if (clean === '::' || clean === '::1') return false;
  if (/^fe[89ab][0-9a-f]:/i.test(clean)) return false; // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/i.test(clean)) return false; // ULA fc00::/7
  if (/^ff[0-9a-f]{2}:/i.test(clean)) return false; // multicast
  return true;
}

export function listGlobalIpv6Addresses() {
  const ifaces = os.networkInterfaces();
  const list = [];
  for (const [iface, addrs] of Object.entries(ifaces)) {
    if (!Array.isArray(addrs)) continue;
    for (const entry of addrs) {
      if (entry.internal) continue;
      if (entry.family !== 'IPv6' && entry.family !== 6) continue;
      const addr = String(entry.address || '').split('%')[0];
      if (isGlobalIpv6(addr)) {
        list.push({ iface, address: addr });
      }
    }
  }
  return list;
}

async function detectTunnelInterfaces() {
  const found = new Map();
  const osIfaces = os.networkInterfaces();

  for (const [name, addrs] of Object.entries(osIfaces)) {
    if (!Array.isArray(addrs)) continue;
    const nonInternal = addrs.filter((a) => !a.internal);
    if (nonInternal.length === 0) continue;
    if (isTunnelText(name)) {
      found.set(name.toLowerCase(), {
        name,
        description: '',
        status: 'Up',
        addresses: nonInternal.map((a) => a.address),
        source: 'os.networkInterfaces',
      });
    }
  }

  if (process.platform === 'win32') {
    const res = await runCmd(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        'Get-NetAdapter | Select-Object Name,InterfaceDescription,Status | ConvertTo-Json -Compress',
      ],
      3000,
    );
    if (res.ok && res.stdout.trim()) {
      try {
        const parsed = JSON.parse(res.stdout.trim());
        const adapters = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
        for (const ad of adapters) {
          const name = String(ad?.Name ?? '').trim();
          const desc = String(ad?.InterfaceDescription ?? '').trim();
          const status = String(ad?.Status ?? '').trim();
          if (!name && !desc) continue;
          const isUp = status.toLowerCase() === 'up' || status === '1';
          if (!isUp) continue;
          if (isTunnelText(name) || isTunnelText(desc)) {
            const key = name.toLowerCase();
            const existing = found.get(key);
            found.set(key, {
              name: existing?.name || name,
              description: desc || existing?.description || '',
              status: 'Up',
              addresses: existing?.addresses || [],
              source: existing ? 'os+Get-NetAdapter' : 'Get-NetAdapter',
            });
          }
        }
      } catch {
        // Ignore malformed JSON from PowerShell fallback
      }
    }
  }

  return Array.from(found.values());
}

async function detectVpnProcesses() {
  const matched = new Map();

  if (process.platform === 'win32') {
    const res = await runCmd('tasklist', ['/FO', 'CSV', '/NH'], 3000);
    if (res.ok && res.stdout) {
      for (const rawLine of res.stdout.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const cols = parseCsvLine(line);
        const procName = (cols[0] || '').trim();
        if (!procName) continue;
        const lower = procName.toLowerCase();
        if (KNOWN_PROCESS_SET.has(lower)) {
          matched.set(lower, procName);
        }
      }
    }
  } else {
    const res = await runCmd('ps', ['-A', '-o', 'comm='], 3000);
    if (res.ok && res.stdout) {
      for (const rawLine of res.stdout.split(/\r?\n/)) {
        const base = path.basename(rawLine.trim());
        if (!base) continue;
        const lower = base.toLowerCase();
        if (KNOWN_PROCESS_SET.has(lower)) {
          matched.set(lower, base);
        }
      }
    }
  }

  return Array.from(matched.values());
}

async function readWindowsInternetSettings() {
  const res = await runCmd('reg', ['query', INTERNET_SETTINGS_KEY], 3000);
  if (!res.ok || !res.stdout) {
    return { regEnabled: false, server: '', pacUrl: '' };
  }
  const out = res.stdout;
  const enableMatch = out.match(/^\s*ProxyEnable\s+REG_\w+\s+(0x[0-9a-f]+|\d+)/im);
  const serverMatch = out.match(/^\s*ProxyServer\s+REG_\w+\s+(.+)$/im);
  const pacMatch = out.match(/^\s*AutoConfigURL\s+REG_\w+\s+(.+)$/im);

  const regEnabled = enableMatch
    ? parseInt(enableMatch[1], enableMatch[1].startsWith('0x') ? 16 : 10) === 1
    : false;
  const rawServer = serverMatch ? serverMatch[1].trim() : '';
  const pacUrl = pacMatch ? pacMatch[1].trim() : '';

  return {
    regEnabled,
    server: regEnabled ? rawServer : '',
    pacUrl,
  };
}

async function readSystemProxy() {
  const envProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    '';

  if (process.platform === 'win32') {
    const win = await readWindowsInternetSettings();
    const enabled = Boolean(win.regEnabled || win.pacUrl || envProxy);
    return {
      enabled,
      server: win.server,
      pacUrl: win.pacUrl,
      envProxy: envProxy.trim(),
    };
  }

  return {
    enabled: Boolean(envProxy.trim()),
    server: '',
    pacUrl: '',
    envProxy: envProxy.trim(),
  };
}

async function detectAlwaysOn(hasActiveVpn) {
  if (process.platform === 'win32' && hasActiveVpn) {
    const res = await runCmd(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "Get-Service | Where-Object { $_.StartType -eq 'Automatic' -and $_.Status -eq 'Running' -and $_.Name -match 'wireguard|openvpn|nordvpn|protonvpn|mullvad|warp|tailscale|zerotier|expressvpn|surfshark|windscribe|clash|mihomo' } | Select-Object Name,DisplayName | ConvertTo-Json -Compress",
      ],
      3000,
    );
    if (res.ok && res.stdout.trim()) {
      try {
        const parsed = JSON.parse(res.stdout.trim());
        const svcs = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
        if (svcs.length > 0) {
          return {
            enabled: true,
            lockdown: false,
            serviceName: svcs[0].Name || svcs[0].DisplayName || '',
            note: ALWAYS_ON_NOTE,
          };
        }
      } catch {
        // Ignore parse failure
      }
    }
  }

  return {
    enabled: false,
    lockdown: false,
    note: ALWAYS_ON_NOTE,
  };
}

async function checkIsAdmin() {
  if (process.platform === 'win32') {
    const res = await runCmd('net', ['session'], 2500);
    return res.code === 0;
  }
  return typeof process.getuid === 'function' ? process.getuid() === 0 : false;
}

/**
 * Inspects active VPN adapters, VPN/proxy processes, system proxy settings,
 * always-on service status, and elevated privileges.
 */
export async function probeVpn() {
  const [interfaces, processes, systemProxy, isAdmin] = await Promise.all([
    detectTunnelInterfaces(),
    detectVpnProcesses(),
    readSystemProxy(),
    checkIsAdmin(),
  ]);

  const hasTunnel = interfaces.length > 0;
  const hasProcess = processes.length > 0;
  const hasProxy = systemProxy.enabled;
  const active = hasTunnel || hasProcess || hasProxy;

  const alwaysOn = await detectAlwaysOn(active);

  let transport = 'none';
  if (hasTunnel && hasProxy) transport = 'tunnel+proxy';
  else if (hasTunnel) transport = 'tunnel';
  else if (hasProxy) transport = 'proxy';
  else if (hasProcess) transport = 'process';

  let packageOrService = '';
  if (hasProcess) packageOrService = processes[0];
  else if (hasTunnel) packageOrService = interfaces[0].name;
  else if (hasProxy) packageOrService = systemProxy.server || systemProxy.pacUrl || 'system-proxy';

  let label = '';
  if (active) {
    if (hasProcess) {
      label = friendlyProcessLabel(processes[0]);
      if (hasTunnel && !label.toLowerCase().includes(interfaces[0].name.toLowerCase())) {
        label = `${label} (${interfaces[0].name})`;
      }
    } else if (hasTunnel) {
      label = interfaces[0].description || interfaces[0].name;
    } else if (hasProxy) {
      const target = systemProxy.server || systemProxy.pacUrl || systemProxy.envProxy;
      label = `Proxy del sistema (${target})`;
    }
  }

  return {
    active,
    packageOrService,
    label,
    transport,
    interfaces,
    processes,
    systemProxy,
    alwaysOn,
    isAdmin,
  };
}

/**
 * Applies basic leak-prevention fixes when a VPN is active:
 * disables IPv6 (when elevated) and clears the global system proxy only if a
 * tunnel interface is active (preserving local proxy when proxy-only).
 */
export async function applyBasicVpnFix(vpnInfo) {
  const info = vpnInfo || (await probeVpn());
  const isAdmin = typeof info.isAdmin === 'boolean' ? info.isAdmin : await checkIsAdmin();

  if (!info.active) {
    const remaining = listGlobalIpv6Addresses().length;
    return {
      attempted: false,
      v6DisabledOk: remaining === 0,
      v6GlobalAddrsRemaining: remaining,
      proxyClearedOk: !info.systemProxy?.enabled,
      vpnDeclaredProxyKept: false,
      isAdmin,
      message: 'No hay VPN activa; no se aplicaron correcciones básicas.',
    };
  }

  if (isAdmin) {
    if (process.platform === 'win32') {
      await runCmd(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          "Get-NetAdapter | Where-Object { $_.InterfaceDescription -notmatch 'Loopback' } | ForEach-Object { Disable-NetAdapterBinding -Name $_.Name -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue }",
        ],
        5000,
      );
      await runCmd('netsh', ['interface', 'ipv6', 'set', 'global', 'randomizeidentifiers=disabled'], 3000);
    } else if (process.platform === 'linux') {
      await runCmd('sysctl', ['-w', 'net.ipv6.conf.all.disable_ipv6=1'], 3000);
    } else if (process.platform === 'darwin') {
      await runCmd('sysctl', ['-w', 'net.inet6.ip6.accept_rtadv=0'], 3000);
    }
  }

  const v6GlobalAddrsRemaining = listGlobalIpv6Addresses().length;
  const v6DisabledOk = isAdmin && v6GlobalAddrsRemaining === 0;

  const hasTunnel = Array.isArray(info.interfaces) && info.interfaces.length > 0;
  let proxyClearedOk = false;
  let vpnDeclaredProxyKept = false;

  if (hasTunnel) {
    if (process.platform === 'win32') {
      await runCmd(
        'reg',
        ['add', INTERNET_SETTINGS_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f'],
        3000,
      );
      await runCmd('reg', ['delete', INTERNET_SETTINGS_KEY, '/v', 'ProxyServer', '/f'], 3000);
      await runCmd('reg', ['delete', INTERNET_SETTINGS_KEY, '/v', 'AutoConfigURL', '/f'], 3000);
      const readBack = await readWindowsInternetSettings();
      proxyClearedOk = !readBack.regEnabled && !readBack.server && !readBack.pacUrl;
    } else {
      proxyClearedOk = !info.systemProxy?.enabled;
    }
  } else if (info.systemProxy?.enabled) {
    // Proxy-only VPN (e.g., Clash/Mihomo without TUN): keep system proxy so egress stays routed.
    vpnDeclaredProxyKept = true;
    proxyClearedOk = false;
  } else {
    proxyClearedOk = true;
  }

  const lines = [
    v6DisabledOk
      ? '✓ IPv6 desactivado (0 direcciones globales)'
      : isAdmin
        ? `⚠ IPv6 aún tiene ${v6GlobalAddrsRemaining} dirección(es) global(es)`
        : `✗ IPv6 sin cambios (requiere Administrador; ${v6GlobalAddrsRemaining} global(es))`,
    vpnDeclaredProxyKept
      ? '· Proxy del sistema conservado (VPN en modo proxy local sin túnel)'
      : proxyClearedOk
        ? '✓ Proxy global del sistema limpiado'
        : '✗ El proxy del sistema sigue activo',
    `· ${ALWAYS_ON_NOTE}`,
  ];

  return {
    attempted: true,
    v6DisabledOk,
    v6GlobalAddrsRemaining,
    proxyClearedOk,
    vpnDeclaredProxyKept,
    isAdmin,
    message: lines.join('\n'),
  };
}

/**
 * Opens the OS VPN configuration screen.
 */
export async function openVpnSettings() {
  if (process.platform === 'win32') {
    const res = await runCmd('cmd', ['/c', 'start', '', 'ms-settings:network-vpn'], 3000);
    return {
      ok: res.ok,
      message: res.ok
        ? 'Configuración de VPN de Windows abierta.'
        : `No se pudo abrir ms-settings:network-vpn (${res.stderr || 'error'}).`,
    };
  }

  if (process.platform === 'darwin') {
    const res = await runCmd('open', ['x-apple.systempreferences:com.apple.Network-Settings.extension'], 3000);
    return {
      ok: res.ok,
      message: res.ok
        ? 'Preferencias de Red de macOS abiertas.'
        : 'Abre Ajustes del Sistema → VPN manualmente.',
    };
  }

  return {
    ok: false,
    message: 'En Linux abre NetworkManager (nm-connection-editor) o Ajustes → Red → VPN.',
  };
}
