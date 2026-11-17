import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  REGIONS,
  DC_ASN,
  getRegionByIso,
  utcFmt,
  utcAt,
  parseMin,
  utcMatch,
  extractLocaleCountry,
  localeMatch,
  inferCountriesFromTimezone,
  flagOf,
  isDatacenterOrg,
} from '../src/catalog/regions.js';
import { TARGETS, getTargetById } from '../src/catalog/targets.js';
import { probeSystem } from '../src/probes/systemProbe.js';
import { probeVpn } from '../src/probes/vpnProbe.js';
import { evaluateScan } from '../src/engine/assessment.js';
import { createAppServer } from '../src/server/appServer.js';
import {
  IANA_TO_WINDOWS_TZ,
  WINDOWS_TO_IANA_TZ,
  COUNTRY_TO_GEOID,
  ianaToWindowsTz,
  windowsToIanaTz,
  resolveAlignmentProfile,
  alignOsToTarget,
  getSwitcherStatus,
  revertOsFromBackup,
} from '../src/switcher/osSwitcher.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function findRow(table, key) {
  return table.find((row) => row.key === key);
}

function hasDiscrepancy(result, code) {
  return result.discrepancies.some((item) => item.code === code);
}

test('Catálogo de regiones: getRegionByIso, aliases, UTC, locale, zonas IANA y ASN datacenter vs residencial', () => {
  assert.ok(Array.isArray(REGIONS) && REGIONS.length >= 170, 'REGIONS debe incluir 170+ países');
  assert.ok(Array.isArray(DC_ASN) && DC_ASN.includes('m247'));

  const uk = getRegionByIso('uk');
  assert.ok(uk, 'Alias uk debe resolver');
  assert.equal(uk.iso, 'gb');

  assert.equal(getRegionByIso('USA')?.iso, 'us');
  assert.equal(getRegionByIso('uae')?.iso, 'ae');
  assert.equal(getRegionByIso('korea')?.iso, 'kr');
  assert.equal(getRegionByIso('holland')?.iso, 'nl');
  assert.equal(flagOf('es'), '🇪🇸');

  assert.equal(utcFmt(60), '+1');
  assert.equal(utcFmt(-240), '-4');
  assert.equal(utcFmt(330), '+5:30');
  assert.equal(parseMin('UTC+5:30'), 330);
  assert.equal(parseMin('UTC-4'), -240);
  assert.match(utcAt('America/Caracas'), /^UTC[+-]\d/);

  assert.equal(utcMatch('UTC-4~-10', 'UTC-5'), true);
  assert.equal(utcMatch('UTC-4~-10', 'UTC+1'), false);
  assert.equal(utcMatch('UTC+5:30', 'UTC+5:30'), true);
  assert.equal(utcMatch('UTC+1~+2', 'UTC+1'), true);

  assert.equal(extractLocaleCountry('es-VE'), 've');
  assert.equal(extractLocaleCountry('en_US.UTF-8'), 'us');
  assert.equal(localeMatch(['es-ES', 'ca-ES'], 'es-ES'), true);
  assert.equal(localeMatch('es-MX/es-419', 'es_MX.UTF-8'), true);
  assert.equal(localeMatch(['en-US'], 'es-ES'), false);

  assert.deepEqual(inferCountriesFromTimezone('Europe/Madrid'), ['es']);
  assert.deepEqual(inferCountriesFromTimezone('America/Buenos_Aires'), ['ar']);
  assert.deepEqual(inferCountriesFromTimezone('Asia/Calcutta'), ['in']);
  assert.deepEqual(inferCountriesFromTimezone('America/Caracas'), ['ve']);

  assert.equal(isDatacenterOrg('AS16509 Amazon.com, Inc.'), true);
  assert.equal(isDatacenterOrg('AS9009 M247 Europe SRL'), true);
  assert.equal(isDatacenterOrg('AS14061 DigitalOcean, LLC'), true);
  assert.equal(isDatacenterOrg('AS3352 Telefonica de Espana'), false);
  assert.equal(isDatacenterOrg('AS7922 Comcast Cable Communications, LLC'), false);
  assert.equal(isDatacenterOrg('AS8048 CANTV Servicios, Venezuela'), false);

  assert.ok(TARGETS.length >= 3);
  assert.equal(getTargetById('chatgpt').id, 'chatgpt');
  assert.equal(getTargetById('desconocido').id, 'claude');
});

test('probeSystem() devuelve locale, timezone, utcOffset y primaryInferredCountry válidos', async () => {
  const sys = await probeSystem();
  assert.equal(typeof sys.locale, 'string');
  assert.ok(sys.locale.length > 0, 'locale no debe estar vacío');
  assert.equal(typeof sys.timezone, 'string');
  assert.ok(sys.timezone.length > 0, 'timezone no debe estar vacío');
  assert.match(sys.utcOffset, /^UTC[+-]\d{1,2}(?::\d{2})?$/);
  assert.equal(typeof sys.utcOffsetMinutes, 'number');
  assert.match(sys.primaryInferredCountry, /^[a-z]{2}$/);
  assert.ok(Array.isArray(sys.inferredCountries));
});

test('probeVpn() devuelve la estructura esperada', async () => {
  const vpn = await probeVpn();
  assert.equal(typeof vpn.active, 'boolean');
  assert.equal(typeof vpn.packageOrService, 'string');
  assert.ok(Array.isArray(vpn.interfaces));
  assert.ok(Array.isArray(vpn.processes));
  assert.equal(typeof vpn.systemProxy, 'object');
  assert.equal(typeof vpn.systemProxy.enabled, 'boolean');
  assert.equal(typeof vpn.systemProxy.server, 'string');
  assert.equal(typeof vpn.systemProxy.pacUrl, 'string');
  assert.equal(typeof vpn.alwaysOn, 'object');
  assert.equal(typeof vpn.alwaysOn.enabled, 'boolean');
  assert.equal(typeof vpn.alwaysOn.lockdown, 'boolean');
  assert.equal(typeof vpn.alwaysOn.note, 'string');
  assert.equal(typeof vpn.isAdmin, 'boolean');
});

test('evaluateScan() escenario a: dispositivo coherente con IP residencial sin VPN', () => {
  const res = evaluateScan({
    expectedRegion: 'es',
    targetId: 'claude',
    system: {
      locale: 'es-ES',
      localeCountry: 'es',
      timezone: 'Europe/Madrid',
      utcOffset: 'UTC+1',
      utcOffsetMinutes: 60,
      inferredCountries: ['es'],
      primaryInferredCountry: 'es',
    },
    vpn: {
      active: false,
      packageOrService: '',
      label: '',
      transport: '',
      interfaces: [],
      processes: [],
      systemProxy: { enabled: false, server: '', pacUrl: '', envProxy: '' },
      alwaysOn: { enabled: false, lockdown: false, note: 'Manual' },
      isAdmin: false,
    },
    network: {
      egress: {
        ip: '88.14.22.10',
        cc: 'ES',
        org: 'AS3352 Telefonica de Espana',
        isDatacenter: false,
      },
      dns: {
        state: 1,
        total: 3,
        fakeCount: 0,
        realCount: 3,
        failedCount: 0,
        resolverIp: '80.58.61.250',
        resolverCc: 'ES',
      },
      ipv6: {
        state: 1,
        externalIp: 'none',
        externalCc: '',
        localAddrs: [],
        isLocalLeak: false,
      },
      udp: {
        state: 1,
        ip: '88.14.22.10',
        cc: 'ES',
        via: 'stun',
      },
      nodeRules: {
        state: -1,
        matchedRules: [],
        domainChecks: [],
      },
    },
  });

  assert.equal(res.locationVerdict.consistent, true);
  assert.equal(res.isLocationSpoofed, false);
  assert.ok(res.riskScore < 15, `riskScore esperado bajo, obtenido ${res.riskScore}`);
  assert.equal(res.riskLevel, 'LOW');
  assert.equal(res.discrepancies.length, 0);
  assert.equal(res.locationVerdict.declaredIpCountry, 'es');
  assert.equal(res.locationVerdict.estimatedActualCountry, 'es');
});

test('evaluateScan() escenario b: spoofing/VPN detectada (Madrid vs US datacenter M247)', () => {
  const res = evaluateScan({
    expectedRegion: 'es',
    targetId: 'claude',
    system: {
      locale: 'es-ES',
      localeCountry: 'es',
      timezone: 'Europe/Madrid',
      utcOffset: 'UTC+1',
      utcOffsetMinutes: 60,
      inferredCountries: ['es'],
      primaryInferredCountry: 'es',
    },
    vpn: {
      active: true,
      packageOrService: 'wireguard.exe',
      label: 'WireGuard',
      transport: 'wg',
      systemProxy: { enabled: false, server: '', pacUrl: '', envProxy: '' },
      alwaysOn: { enabled: false, lockdown: false },
      isAdmin: true,
    },
    network: {
      egress: {
        ip: '185.220.101.5',
        cc: 'US',
        org: 'AS9009 M247 Europe SRL',
        isDatacenter: false, // evaluateScan debe detectar M247 por isDatacenterOrg
      },
      dns: {
        fakeCount: 3,
        realCount: 0,
        failedCount: 0,
      },
      ipv6: {
        externalIp: 'none',
        localAddrs: [],
      },
      udp: {
        ip: 'timeout',
        cc: '',
      },
      nodeRules: {
        state: 1,
        matchedRules: [{ type: 'DOMAIN-SUFFIX', pattern: 'anthropic.com', policy: 'PROXY' }],
        domainChecks: [],
      },
    },
  });

  assert.equal(hasDiscrepancy(res, 'TIMEZONE_IP_MISMATCH'), true);
  assert.equal(hasDiscrepancy(res, 'UTC_OFFSET_MISMATCH'), true);
  assert.equal(hasDiscrepancy(res, 'DATACENTER_IP_DETECTED'), true);
  assert.equal(hasDiscrepancy(res, 'VPN_ACTIVE_DETECTED'), true);
  assert.equal(res.isLocationSpoofed, true);
  assert.equal(res.locationVerdict.consistent, false);
  assert.equal(res.locationVerdict.declaredIpCountry, 'us');
  assert.equal(res.locationVerdict.estimatedActualCountry, 'es');
});

test('evaluateScan() escenario c: fuga UDP/STUN (TCP US vs STUN ES)', () => {
  const res = evaluateScan({
    system: {
      locale: 'en-US',
      localeCountry: 'us',
      timezone: 'America/New_York',
      utcOffset: 'UTC-5',
      inferredCountries: ['us'],
      primaryInferredCountry: 'us',
    },
    vpn: {
      active: true,
      packageOrService: 'openvpn.exe',
      label: 'OpenVPN',
      systemProxy: { enabled: false },
      alwaysOn: { enabled: false, lockdown: false },
    },
    network: {
      egress: {
        ip: '1.2.3.4',
        cc: 'US',
        org: 'AS14061 DigitalOcean, LLC',
      },
      dns: {
        fakeCount: 3,
        realCount: 0,
        failedCount: 0,
      },
      ipv6: {
        externalIp: 'none',
        localAddrs: [],
      },
      udp: {
        ip: '5.6.7.8',
        cc: 'ES',
        via: 'stun',
      },
    },
  });

  assert.equal(hasDiscrepancy(res, 'UDP_STUN_LEAK'), true);
  assert.equal(res.locationVerdict.leakedRealCountry, 'es');
  assert.equal(res.locationVerdict.estimatedActualCountry, 'es');
  assert.equal(findRow(res.networkTable, 'udp')?.state, 0);
});

test('evaluateScan() escenario d: fuga IPv6 cuando externalIp coincide con IP local', () => {
  const leakedV6 = '2001:db8:85a3::8a2e:370:7334';
  const res = evaluateScan({
    system: {
      locale: 'en-US',
      localeCountry: 'us',
      timezone: 'America/New_York',
      utcOffset: 'UTC-5',
      inferredCountries: ['us'],
      primaryInferredCountry: 'us',
    },
    vpn: {
      active: true,
      packageOrService: 'wireguard.exe',
      label: 'WireGuard',
      systemProxy: { enabled: false },
      alwaysOn: { enabled: false, lockdown: false },
    },
    network: {
      egress: {
        ip: '1.2.3.4',
        cc: 'US',
        org: 'AS16509 Amazon.com, Inc.',
      },
      dns: {
        fakeCount: 3,
        realCount: 0,
        failedCount: 0,
      },
      ipv6: {
        externalIp: leakedV6,
        externalCc: 'ES',
        localAddrs: [{ iface: 'Wi-Fi', address: leakedV6 }],
      },
      udp: {
        ip: '1.2.3.4',
        cc: 'US',
      },
    },
  });

  assert.equal(hasDiscrepancy(res, 'IPV6_LEAK'), true);
  assert.equal(findRow(res.networkTable, 'ipv6')?.state, 0);
  assert.equal(res.isLocationSpoofed, true);
});

test('evaluateScan() escenario e: semántica DNS (fake-ip=1, failedCount>0 unread=-1 sin fuga, mezcla=0)', () => {
  const baseInput = {
    system: {
      locale: 'en-US',
      localeCountry: 'us',
      timezone: 'America/New_York',
      utcOffset: 'UTC-5',
      inferredCountries: ['us'],
      primaryInferredCountry: 'us',
    },
    vpn: {
      active: true,
      packageOrService: 'mihomo.exe',
      label: 'Mihomo / Clash',
      systemProxy: { enabled: false },
      alwaysOn: { enabled: false, lockdown: false },
    },
  };

  // e.1) Fake-IP puro (198.18.0.1) -> state = 1
  const fakeIpScan = evaluateScan({
    ...baseInput,
    network: {
      egress: { ip: '1.2.3.4', cc: 'US', org: 'AS7922 Comcast' },
      dns: {
        domains: [
          { domain: 'www.google.com', ips: ['198.18.0.1'], isFakeIp: true },
          { domain: 'www.youtube.com', ips: ['198.18.0.2'], isFakeIp: true },
        ],
        failedCount: 0,
      },
      ipv6: { externalIp: 'none', localAddrs: [] },
      udp: { ip: '1.2.3.4', cc: 'US' },
    },
  });
  assert.equal(findRow(fakeIpScan.networkTable, 'dns')?.state, 1);
  assert.equal(hasDiscrepancy(fakeIpScan, 'DNS_LEAK_OR_UNCOVERED'), false);

  // e.2) Error transitorio (failedCount > 0) -> unread (state = -1), NO marca filtración
  const transientErrScan = evaluateScan({
    ...baseInput,
    network: {
      egress: { ip: '1.2.3.4', cc: 'US', org: 'AS7922 Comcast' },
      dns: {
        total: 2,
        fakeCount: 0,
        realCount: 2,
        failedCount: 1,
        domains: [
          { domain: 'www.google.com', ips: ['142.250.1.100'], isFakeIp: false },
          { domain: 'www.youtube.com', ips: ['142.250.1.101'], isFakeIp: false },
          { domain: 'www.cloudflare.com', ips: [], isFakeIp: false, error: 'ETIMEDOUT' },
        ],
      },
      ipv6: { externalIp: 'none', localAddrs: [] },
      udp: { ip: '1.2.3.4', cc: 'US' },
    },
  });
  assert.equal(findRow(transientErrScan.networkTable, 'dns')?.state, -1);
  assert.equal(hasDiscrepancy(transientErrScan, 'DNS_LEAK_OR_UNCOVERED'), false);

  // e.3) Mezcla fake-ip + IP real -> leaked (state = 0)
  const mixedScan = evaluateScan({
    ...baseInput,
    network: {
      egress: { ip: '1.2.3.4', cc: 'US', org: 'AS7922 Comcast' },
      dns: {
        domains: [
          { domain: 'www.google.com', ips: ['198.18.0.1'], isFakeIp: true },
          { domain: 'www.cloudflare.com', ips: ['104.16.132.229'], isFakeIp: false },
        ],
        failedCount: 0,
      },
      ipv6: { externalIp: 'none', localAddrs: [] },
      udp: { ip: '1.2.3.4', cc: 'US' },
    },
  });
  assert.equal(findRow(mixedScan.networkTable, 'dns')?.state, 0);
  assert.equal(hasDiscrepancy(mixedScan, 'DNS_LEAK_OR_UNCOVERED'), true);
});

test('evaluateScan() escenario f: detección de cambio de IP (IP_FLIP_DETECTED)', () => {
  const res = evaluateScan({
    ipHistory: ['198.51.100.20', '198.51.100.10'],
    system: {
      locale: 'es-ES',
      localeCountry: 'es',
      timezone: 'Europe/Madrid',
      utcOffset: 'UTC+1',
      inferredCountries: ['es'],
      primaryInferredCountry: 'es',
    },
    vpn: { active: false, systemProxy: { enabled: false }, alwaysOn: { enabled: false } },
    network: {
      egress: { ip: '203.0.113.55', cc: 'ES', org: 'AS3352 Telefonica de Espana' },
      dns: { fakeCount: 0, realCount: 3, failedCount: 0 },
      ipv6: { externalIp: 'none', localAddrs: [] },
      udp: { ip: '203.0.113.55', cc: 'ES' },
    },
  });

  assert.equal(res.ipFlipped, true);
  assert.equal(res.previousIp, '198.51.100.20');
  assert.equal(res.ipHistory[0], '203.0.113.55');
  assert.equal(hasDiscrepancy(res, 'IP_FLIP_DETECTED'), true);
});

test('Integración HTTP createAppServer(): GET /, GET /api/bootstrap, POST /api/scan y cierre limpio', { timeout: 30000 }, async () => {
  const server = createAppServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object' && addr.port > 0);
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const rootRes = await fetch(`${baseUrl}/`);
    assert.equal(rootRes.status, 200);
    const rootHtml = await rootRes.text();
    assert.match(rootHtml, /WilsonGeoGuard/i);

    const bootRes = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(bootRes.status, 200);
    const bootJson = await bootRes.json();
    assert.ok(Array.isArray(bootJson.regions) && bootJson.regions.length >= 170);
    assert.ok(Array.isArray(bootJson.targets) && bootJson.targets.length >= 3);
    assert.ok(Array.isArray(bootJson.notes) && bootJson.notes.length === 5);

    const scanRes = await fetch(`${baseUrl}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRegion: '',
        targetId: 'claude',
        customDomains: [],
        autoFixOnVpn: false,
      }),
    });
    assert.equal(scanRes.status, 200);
    const scanJson = await scanRes.json();
    assert.ok(Array.isArray(scanJson.systemTable) && scanJson.systemTable.length === 4);
    assert.ok(Array.isArray(scanJson.networkTable) && scanJson.networkTable.length === 8);
    assert.equal(typeof scanJson.locationVerdict, 'object');
    assert.ok(Array.isArray(scanJson.discrepancies));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('CLI real: node src/server/cli.js --scan --json sale con código 0 y JSON válido', { timeout: 30000 }, async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['src/server/cli.js', '--scan', '--json'],
    {
      cwd: PROJECT_ROOT,
      timeout: 25000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    },
  );

  const parsed = JSON.parse(stdout);
  assert.ok(Array.isArray(parsed.systemTable) && parsed.systemTable.length === 4);
  assert.ok(Array.isArray(parsed.networkTable) && parsed.networkTable.length === 8);
  assert.equal(typeof parsed.locationVerdict, 'object');
  assert.equal(typeof parsed.locationVerdict.consistent, 'boolean');
  assert.ok(Array.isArray(parsed.discrepancies));
});

test('OS Switcher: mapeo bidireccional ianaToWindowsTz / windowsToIanaTz y COUNTRY_TO_GEOID', () => {
  // Todas las zonas US principales
  const usPairs = [
    ['America/New_York', 'Eastern Standard Time'],
    ['America/Indiana/Indianapolis', 'US Eastern Standard Time'],
    ['America/Chicago', 'Central Standard Time'],
    ['America/Denver', 'Mountain Standard Time'],
    ['America/Phoenix', 'US Mountain Standard Time'],
    ['America/Los_Angeles', 'Pacific Standard Time'],
    ['America/Anchorage', 'Alaskan Standard Time'],
    ['Pacific/Honolulu', 'Hawaiian Standard Time'],
  ];

  for (const [iana, winTz] of usPairs) {
    assert.equal(IANA_TO_WINDOWS_TZ[iana], winTz, `IANA_TO_WINDOWS_TZ[${iana}]`);
    assert.equal(WINDOWS_TO_IANA_TZ[winTz], iana, `WINDOWS_TO_IANA_TZ[${winTz}]`);
    assert.equal(ianaToWindowsTz(iana), winTz, `ianaToWindowsTz(${iana})`);
    assert.equal(windowsToIanaTz(winTz), iana, `windowsToIanaTz(${winTz})`);
  }

  // Zonas US secundarias
  assert.equal(ianaToWindowsTz('America/Detroit'), 'Eastern Standard Time');
  assert.equal(ianaToWindowsTz('America/Boise'), 'Mountain Standard Time');

  // Zonas principales del catálogo
  const catalogPairs = [
    ['America/Caracas', 'Venezuela Standard Time'],
    ['Europe/Madrid', 'Romance Standard Time'],
    ['America/Mexico_City', 'Central Standard Time (Mexico)'],
    ['America/Cancun', 'Eastern Standard Time (Mexico)'],
    ['America/Tijuana', 'Pacific Standard Time (Mexico)'],
    ['America/Argentina/Buenos_Aires', 'Argentina Standard Time'],
    ['America/Bogota', 'SA Pacific Standard Time'],
    ['America/Santiago', 'Pacific SA Standard Time'],
    ['America/Sao_Paulo', 'E. South America Standard Time'],
    ['America/La_Paz', 'SA Western Standard Time'],
    ['America/Montevideo', 'Montevideo Standard Time'],
    ['America/Asuncion', 'Paraguay Standard Time'],
    ['America/Costa_Rica', 'Central America Standard Time'],
    ['Europe/London', 'GMT Standard Time'],
    ['Europe/Berlin', 'W. Europe Standard Time'],
    ['Asia/Tokyo', 'Tokyo Standard Time'],
    ['Asia/Singapore', 'Singapore Standard Time'],
  ];

  for (const [iana, winTz] of catalogPairs) {
    assert.equal(ianaToWindowsTz(iana), winTz, `ianaToWindowsTz(${iana})`);
    assert.equal(windowsToIanaTz(winTz), iana, `windowsToIanaTz(${winTz})`);
  }

  // Alias y sufijo _dstoff + fallback
  assert.equal(ianaToWindowsTz('America/Buenos_Aires'), 'Argentina Standard Time');
  assert.equal(ianaToWindowsTz('America/Lima'), 'SA Pacific Standard Time');
  assert.equal(ianaToWindowsTz('America/Santo_Domingo'), 'SA Western Standard Time');
  assert.equal(windowsToIanaTz('Eastern Standard Time_dstoff'), 'America/New_York');
  assert.equal(ianaToWindowsTz('america/new_york'), 'Eastern Standard Time');
  assert.equal(ianaToWindowsTz('Unknown/Zone', 've'), 'Venezuela Standard Time');

  // COUNTRY_TO_GEOID
  const expectedGeoIds = {
    us: 244,
    ve: 249,
    es: 217,
    mx: 166,
    ar: 11,
    co: 51,
    cl: 46,
    pe: 187,
    br: 32,
    ec: 66,
    uy: 246,
    py: 185,
    bo: 26,
    cr: 54,
    pa: 192,
    do: 65,
    ca: 39,
    gb: 242,
    de: 94,
    fr: 84,
    jp: 122,
    sg: 215,
  };
  for (const [iso, geoId] of Object.entries(expectedGeoIds)) {
    assert.equal(COUNTRY_TO_GEOID[iso], geoId, `COUNTRY_TO_GEOID[${iso}]`);
  }
});

test('OS Switcher: resolveAlignmentProfile con egress US (NY y Chicago) + evaluateScan() sin discordancias de sistema', async () => {
  const cases = [
    {
      tz: 'America/New_York',
      expectedWinTz: 'Eastern Standard Time',
    },
    {
      tz: 'America/Chicago',
      expectedWinTz: 'Central Standard Time',
    },
  ];

  for (const { tz, expectedWinTz } of cases) {
    const egress = {
      ip: '48.44.29.21',
      cc: 'US',
      timezone: tz,
      org: 'AS7922 Comcast Cable Communications, LLC',
    };

    const profile = await resolveAlignmentProfile({
      mode: 'auto-ip',
      egress,
    });

    assert.equal(profile.targetIso, 'us');
    assert.equal(profile.targetTimezone, tz);
    assert.equal(profile.windowsTimezone, expectedWinTz);
    assert.equal(profile.targetLocale, 'en-US');
    assert.equal(profile.geoId, 244);
    assert.equal(profile.egressIp, '48.44.29.21');

    const utcOffset = utcAt(profile.targetTimezone);
    const utcOffsetMinutes = parseMin(utcOffset);
    const inferredCountries = inferCountriesFromTimezone(profile.targetTimezone);

    const scanRes = evaluateScan({
      expectedRegion: 'us',
      targetId: 'claude',
      system: {
        locale: profile.targetLocale,
        localeCountry: extractLocaleCountry(profile.targetLocale),
        timezone: profile.targetTimezone,
        utcOffset,
        utcOffsetMinutes,
        inferredCountries,
        primaryInferredCountry: inferredCountries[0],
      },
      vpn: {
        active: false,
        systemProxy: { enabled: false, server: '', pacUrl: '', envProxy: '' },
        alwaysOn: { enabled: false, lockdown: false },
        isAdmin: false,
      },
      network: {
        egress,
        dns: { fakeCount: 0, realCount: 3, failedCount: 0, resolverIp: '75.75.75.75', resolverCc: 'US' },
        ipv6: { externalIp: 'none', localAddrs: [] },
        udp: { ip: '48.44.29.21', cc: 'US', via: 'stun' },
        nodeRules: { state: -1, matchedRules: [], domainChecks: [] },
      },
    });

    assert.equal(hasDiscrepancy(scanRes, 'TIMEZONE_IP_MISMATCH'), false);
    assert.equal(hasDiscrepancy(scanRes, 'UTC_OFFSET_MISMATCH'), false);
    assert.equal(hasDiscrepancy(scanRes, 'LOCALE_COUNTRY_MISMATCH'), false);
    assert.equal(scanRes.systemTable.length, 4);
    for (const row of scanRes.systemTable) {
      assert.equal(row.state, 1, `Fila sistema ${row.key} debe estar en state=1`);
    }
    assert.equal(scanRes.locationVerdict.systemInferredCountry, 'us');
    assert.equal(scanRes.locationVerdict.consistent, true);
    assert.equal(scanRes.isLocationSpoofed, false);
  }

  // Fallback si la zona no corresponde al país solicitado
  const fallbackProfile = await resolveAlignmentProfile({
    mode: 'manual',
    region: 'us',
    timezone: 'Europe/Madrid',
  });
  assert.equal(fallbackProfile.targetIso, 'us');
  assert.equal(fallbackProfile.targetTimezone, 'America/New_York');
  assert.equal(fallbackProfile.windowsTimezone, 'Eastern Standard Time');
});

test('OS Switcher: ciclo completo dryRun (alignOsToTarget -> getSwitcherStatus -> revertOsFromBackup) con backup temporal', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wilson-switcher-test-'));
  const tmpBackup = path.join(tmpDir, 'backup.json');

  try {
    const initialStatus = await getSwitcherStatus({ backupPath: tmpBackup });
    assert.equal(initialStatus.hasBackup, false);
    assert.equal(initialStatus.backup, null);

    const alignRes = await alignOsToTarget({
      mode: 'manual',
      region: 'us',
      timezone: 'America/New_York',
      locale: 'en-US',
      dryRun: true,
      backupPath: tmpBackup,
    });

    assert.equal(alignRes.ok, true);
    assert.equal(alignRes.dryRun, true);
    assert.equal(alignRes.action, 'align');
    assert.equal(alignRes.backupSaved, true);
    assert.equal(alignRes.backupPath, tmpBackup);
    assert.equal(alignRes.profile.targetIso, 'us');
    assert.equal(alignRes.profile.targetTimezone, 'America/New_York');
    assert.equal(alignRes.profile.windowsTimezone, 'Eastern Standard Time');
    assert.equal(alignRes.profile.targetLocale, 'en-US');
    assert.equal(alignRes.profile.geoId, 244);
    assert.ok(Array.isArray(alignRes.steps) && alignRes.steps.length > 0);
    assert.ok(alignRes.steps.every((s) => s.simulated === true && s.ok === true));

    const midStatus = await getSwitcherStatus({ backupPath: tmpBackup });
    assert.equal(midStatus.hasBackup, true);
    assert.ok(midStatus.backup && typeof midStatus.backup === 'object');
    assert.equal(midStatus.backupPath, tmpBackup);

    const revertRes = await revertOsFromBackup({
      dryRun: true,
      backupPath: tmpBackup,
    });

    assert.equal(revertRes.ok, true);
    assert.equal(revertRes.dryRun, true);
    assert.equal(revertRes.action, 'revert');
    assert.ok(revertRes.restoredFrom && typeof revertRes.restoredFrom === 'object');

    const finalStatus = await getSwitcherStatus({ backupPath: tmpBackup });
    assert.equal(finalStatus.hasBackup, false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('Integración HTTP OS Switcher: /api/bootstrap, /api/os-switcher/status, /api/os-switcher/align y /api/os-switcher/revert (dryRun)', { timeout: 60000 }, async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wilson-http-switcher-'));
  const tmpBackup = path.join(tmpDir, 'backup.json');
  const server = createAppServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object' && addr.port > 0);
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const bootRes = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(bootRes.status, 200);
    const bootJson = await bootRes.json();
    assert.equal(typeof bootJson.osSwitcher, 'object');
    assert.equal(typeof bootJson.osSwitcher.hasBackup, 'boolean');
    assert.equal(typeof bootJson.osSwitcher.current, 'object');

    const statusRes = await fetch(
      `${baseUrl}/api/os-switcher/status?backupPath=${encodeURIComponent(tmpBackup)}`,
    );
    assert.equal(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.equal(statusJson.hasBackup, false);
    assert.equal(statusJson.backupPath, tmpBackup);

    const alignRes = await fetch(`${baseUrl}/api/os-switcher/align`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'manual',
        region: 'us',
        timezone: 'America/New_York',
        locale: 'en-US',
        dryRun: true,
        backupPath: tmpBackup,
        expectedRegion: 'us',
        targetId: 'claude',
        customDomains: [],
        autoFixOnVpn: false,
      }),
    });
    assert.equal(alignRes.status, 200);
    const alignJson = await alignRes.json();
    assert.equal(alignJson.switcherResult.ok, true);
    assert.equal(alignJson.switcherResult.dryRun, true);
    assert.equal(alignJson.switcherResult.action, 'align');
    assert.equal(alignJson.switcherResult.profile.targetTimezone, 'America/New_York');
    assert.equal(alignJson.osSwitcher.hasBackup, true);
    assert.ok(Array.isArray(alignJson.assessment.systemTable) && alignJson.assessment.systemTable.length === 4);
    assert.ok(Array.isArray(alignJson.assessment.networkTable) && alignJson.assessment.networkTable.length === 8);

    const revertRes = await fetch(`${baseUrl}/api/os-switcher/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dryRun: true,
        backupPath: tmpBackup,
        expectedRegion: '',
        targetId: 'claude',
        customDomains: [],
        autoFixOnVpn: false,
      }),
    });
    assert.equal(revertRes.status, 200);
    const revertJson = await revertRes.json();
    assert.equal(revertJson.switcherResult.ok, true);
    assert.equal(revertJson.switcherResult.dryRun, true);
    assert.equal(revertJson.switcherResult.action, 'revert');
    assert.equal(revertJson.osSwitcher.hasBackup, false);
    assert.ok(Array.isArray(revertJson.assessment.systemTable) && revertJson.assessment.systemTable.length === 4);
    assert.ok(Array.isArray(revertJson.assessment.networkTable) && revertJson.assessment.networkTable.length === 8);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('CLI Switcher: --status --json y --us --dry-run --json sin crear .wilson-os-backup.json en raíz', { timeout: 30000 }, async () => {
  const rootBackupPath = path.join(PROJECT_ROOT, '.wilson-os-backup.json');
  const hadRootBackupBefore = await fs.access(rootBackupPath).then(() => true, () => false);

  const statusExec = await execFileAsync(
    process.execPath,
    ['src/server/switcherCli.js', '--status', '--json'],
    {
      cwd: PROJECT_ROOT,
      timeout: 20000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  const statusParsed = JSON.parse(statusExec.stdout);
  assert.equal(typeof statusParsed.hasBackup, 'boolean');
  assert.equal(typeof statusParsed.current, 'object');
  assert.equal(typeof statusParsed.current.timezone, 'string');

  const usDryExec = await execFileAsync(
    process.execPath,
    ['src/server/switcherCli.js', '--us', '--dry-run', '--json'],
    {
      cwd: PROJECT_ROOT,
      timeout: 20000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  const usDryParsed = JSON.parse(usDryExec.stdout);
  assert.equal(usDryParsed.ok, true);
  assert.equal(usDryParsed.dryRun, true);
  assert.equal(usDryParsed.action, 'align');
  assert.equal(usDryParsed.backupSaved, false);
  assert.equal(usDryParsed.profile.targetIso, 'us');
  assert.equal(usDryParsed.profile.targetTimezone, 'America/New_York');
  assert.equal(usDryParsed.profile.windowsTimezone, 'Eastern Standard Time');
  assert.equal(usDryParsed.profile.targetLocale, 'en-US');
  assert.equal(usDryParsed.profile.geoId, 244);

  if (!hadRootBackupBefore) {
    await assert.rejects(fs.access(rootBackupPath), { code: 'ENOENT' });
  }
});
