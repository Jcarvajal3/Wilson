import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { getRegionByIso, inferCountriesFromTimezone } from '../catalog/regions.js';
import { probeEgress } from '../probes/networkProbe.js';
import { probeSystem } from '../probes/systemProbe.js';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_BACKUP_PATH = path.resolve(PROJECT_ROOT, '.wilson-os-backup.json');
const CMD_TIMEOUT_MS = 5000;

const HKCU_INTL_KEY = 'HKCU\\Control Panel\\International';
const HKCU_GEO_KEY = 'HKCU\\Control Panel\\International\\Geo';

export const IANA_TO_WINDOWS_TZ = Object.freeze({
  // US zones
  'America/New_York': 'Eastern Standard Time',
  'America/Detroit': 'Eastern Standard Time',
  'America/Indiana/Indianapolis': 'US Eastern Standard Time',
  'America/Chicago': 'Central Standard Time',
  'America/Denver': 'Mountain Standard Time',
  'America/Boise': 'Mountain Standard Time',
  'America/Phoenix': 'US Mountain Standard Time',
  'America/Los_Angeles': 'Pacific Standard Time',
  'America/Anchorage': 'Alaskan Standard Time',
  'Pacific/Honolulu': 'Hawaiian Standard Time',

  // Major catalog zones
  'America/Caracas': 'Venezuela Standard Time',
  'Europe/Madrid': 'Romance Standard Time',
  'Atlantic/Canary': 'GMT Standard Time',
  'America/Mexico_City': 'Central Standard Time (Mexico)',
  'America/Monterrey': 'Central Standard Time (Mexico)',
  'America/Cancun': 'Eastern Standard Time (Mexico)',
  'America/Tijuana': 'Pacific Standard Time (Mexico)',
  'America/Hermosillo': 'US Mountain Standard Time',
  'America/Chihuahua': 'Mountain Standard Time (Mexico)',
  'America/Argentina/Buenos_Aires': 'Argentina Standard Time',
  'America/Buenos_Aires': 'Argentina Standard Time',
  'America/Argentina/Cordoba': 'Argentina Standard Time',
  'America/Bogota': 'SA Pacific Standard Time',
  'America/Lima': 'SA Pacific Standard Time',
  'America/Panama': 'SA Pacific Standard Time',
  'America/Guayaquil': 'SA Pacific Standard Time',
  'America/Santiago': 'Pacific SA Standard Time',
  'America/Punta_Arenas': 'Magallanes Standard Time',
  'Pacific/Easter': 'Easter Island Standard Time',
  'America/Sao_Paulo': 'E. South America Standard Time',
  'America/Manaus': 'SA Western Standard Time',
  'America/La_Paz': 'SA Western Standard Time',
  'America/Santo_Domingo': 'SA Western Standard Time',
  'America/Montevideo': 'Montevideo Standard Time',
  'America/Asuncion': 'Paraguay Standard Time',
  'America/Costa_Rica': 'Central America Standard Time',
  'America/Guatemala': 'Central America Standard Time',
  'America/Tegucigalpa': 'Central America Standard Time',
  'America/El_Salvador': 'Central America Standard Time',
  'America/Managua': 'Central America Standard Time',
  'America/Havana': 'Cuba Standard Time',
  'America/Toronto': 'Eastern Standard Time',
  'America/Winnipeg': 'Central Standard Time',
  'America/Edmonton': 'Mountain Standard Time',
  'America/Vancouver': 'Pacific Standard Time',
  'America/Halifax': 'Atlantic Standard Time',
  'America/St_Johns': 'Newfoundland Standard Time',
  'Europe/London': 'GMT Standard Time',
  'Europe/Berlin': 'W. Europe Standard Time',
  'Europe/Paris': 'Romance Standard Time',
  'Europe/Rome': 'W. Europe Standard Time',
  'Europe/Amsterdam': 'W. Europe Standard Time',
  'Europe/Zurich': 'W. Europe Standard Time',
  'Europe/Lisbon': 'GMT Standard Time',
  'Europe/Dublin': 'GMT Standard Time',
  'Europe/Warsaw': 'Central European Standard Time',
  'Europe/Bucharest': 'GTB Standard Time',
  'Europe/Athens': 'GTB Standard Time',
  'Europe/Istanbul': 'Turkey Standard Time',
  'Europe/Kyiv': 'FLE Standard Time',
  'Europe/Kiev': 'FLE Standard Time',
  'Asia/Dubai': 'Arabian Standard Time',
  'Asia/Riyadh': 'Arab Standard Time',
  'Asia/Jerusalem': 'Israel Standard Time',
  'Africa/Cairo': 'Egypt Standard Time',
  'Africa/Johannesburg': 'South Africa Standard Time',
  'Asia/Tokyo': 'Tokyo Standard Time',
  'Asia/Seoul': 'Korea Standard Time',
  'Asia/Singapore': 'Singapore Standard Time',
  'Asia/Shanghai': 'China Standard Time',
  'Asia/Hong_Kong': 'China Standard Time',
  'Asia/Taipei': 'Taipei Standard Time',
  'Asia/Kolkata': 'India Standard Time',
  'Asia/Bangkok': 'SE Asia Standard Time',
  'Asia/Ho_Chi_Minh': 'SE Asia Standard Time',
  'Asia/Jakarta': 'SE Asia Standard Time',
  'Asia/Manila': 'Singapore Standard Time',
  'Australia/Sydney': 'AUS Eastern Standard Time',
  'Australia/Melbourne': 'AUS Eastern Standard Time',
  'Australia/Perth': 'W. Australia Standard Time',
  'Pacific/Auckland': 'New Zealand Standard Time',
});

export const WINDOWS_TO_IANA_TZ = Object.freeze({
  // US canonical reverse
  'Eastern Standard Time': 'America/New_York',
  'US Eastern Standard Time': 'America/Indiana/Indianapolis',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu',

  // Major catalog canonical reverse
  'Venezuela Standard Time': 'America/Caracas',
  'Romance Standard Time': 'Europe/Madrid',
  'GMT Standard Time': 'Europe/London',
  'Central Standard Time (Mexico)': 'America/Mexico_City',
  'Eastern Standard Time (Mexico)': 'America/Cancun',
  'Pacific Standard Time (Mexico)': 'America/Tijuana',
  'Mountain Standard Time (Mexico)': 'America/Chihuahua',
  'Argentina Standard Time': 'America/Argentina/Buenos_Aires',
  'SA Pacific Standard Time': 'America/Bogota',
  'Pacific SA Standard Time': 'America/Santiago',
  'Magallanes Standard Time': 'America/Punta_Arenas',
  'Easter Island Standard Time': 'Pacific/Easter',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'SA Western Standard Time': 'America/La_Paz',
  'Montevideo Standard Time': 'America/Montevideo',
  'Paraguay Standard Time': 'America/Asuncion',
  'Central America Standard Time': 'America/Costa_Rica',
  'Cuba Standard Time': 'America/Havana',
  'Atlantic Standard Time': 'America/Halifax',
  'Newfoundland Standard Time': 'America/St_Johns',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central European Standard Time': 'Europe/Warsaw',
  'GTB Standard Time': 'Europe/Bucharest',
  'Turkey Standard Time': 'Europe/Istanbul',
  'FLE Standard Time': 'Europe/Kyiv',
  'Arabian Standard Time': 'Asia/Dubai',
  'Arab Standard Time': 'Asia/Riyadh',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Egypt Standard Time': 'Africa/Cairo',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Korea Standard Time': 'Asia/Seoul',
  'Singapore Standard Time': 'Asia/Singapore',
  'China Standard Time': 'Asia/Shanghai',
  'Taipei Standard Time': 'Asia/Taipei',
  'India Standard Time': 'Asia/Kolkata',
  'SE Asia Standard Time': 'Asia/Bangkok',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'W. Australia Standard Time': 'Australia/Perth',
  'New Zealand Standard Time': 'Pacific/Auckland',
});

export const COUNTRY_TO_GEOID = Object.freeze({
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
  gt: 99,
  hn: 106,
  sv: 72,
  ni: 182,
  cu: 56,
  ca: 39,
  gb: 242,
  de: 94,
  fr: 84,
  jp: 122,
  sg: 215,
  // Additional catalog countries
  it: 118,
  pt: 193,
  nl: 176,
  ch: 223,
  se: 221,
  no: 177,
  dk: 61,
  fi: 77,
  pl: 191,
  cz: 75,
  at: 14,
  be: 21,
  ie: 68,
  ro: 200,
  gr: 98,
  tr: 235,
  ua: 241,
  ae: 224,
  sa: 205,
  il: 117,
  eg: 67,
  za: 209,
  ng: 175,
  kr: 134,
  my: 167,
  id: 111,
  vn: 251,
  ph: 201,
  th: 227,
  in: 113,
  tw: 237,
  hk: 104,
  cn: 45,
  au: 12,
  nz: 183,
});

const IANA_TO_WIN_LOWER = new Map(
  Object.entries(IANA_TO_WINDOWS_TZ).map(([k, v]) => [k.toLowerCase(), v]),
);
const WIN_TO_IANA_LOWER = new Map(
  Object.entries(WINDOWS_TO_IANA_TZ).map(([k, v]) => [k.toLowerCase(), v]),
);

/**
 * Resolve an IANA timezone ID to its corresponding Windows timezone ID.
 * Falls back via inferred country or fallbackIso when an exact match is absent.
 * @param {string} ianaZone
 * @param {string} [fallbackIso='us']
 * @returns {string}
 */
export function ianaToWindowsTz(ianaZone, fallbackIso = 'us') {
  const clean = typeof ianaZone === 'string' ? ianaZone.trim() : '';
  if (clean) {
    if (IANA_TO_WINDOWS_TZ[clean]) return IANA_TO_WINDOWS_TZ[clean];
    const lowerHit = IANA_TO_WIN_LOWER.get(clean.toLowerCase());
    if (lowerHit) return lowerHit;

    const inferred = inferCountriesFromTimezone(clean);
    for (const iso of inferred) {
      const region = getRegionByIso(iso);
      if (region) {
        for (const candidate of region.zones) {
          const mapped = IANA_TO_WINDOWS_TZ[candidate] || IANA_TO_WIN_LOWER.get(candidate.toLowerCase());
          if (mapped) return mapped;
        }
      }
    }
  }

  const fallbackRegion = getRegionByIso(fallbackIso) || getRegionByIso('us');
  if (fallbackRegion) {
    for (const candidate of fallbackRegion.zones) {
      const mapped = IANA_TO_WINDOWS_TZ[candidate] || IANA_TO_WIN_LOWER.get(candidate.toLowerCase());
      if (mapped) return mapped;
    }
  }

  return 'Eastern Standard Time';
}

/**
 * Resolve a Windows timezone ID (e.g. "Eastern Standard Time") to its canonical IANA timezone.
 * @param {string} winTzId
 * @returns {string}
 */
export function windowsToIanaTz(winTzId) {
  if (typeof winTzId !== 'string') return '';
  let clean = winTzId.trim();
  if (!clean) return '';
  if (clean.endsWith('_dstoff')) {
    clean = clean.slice(0, -'_dstoff'.length).trim();
  }
  if (WINDOWS_TO_IANA_TZ[clean]) return WINDOWS_TO_IANA_TZ[clean];
  return WIN_TO_IANA_LOWER.get(clean.toLowerCase()) || '';
}

async function runCmd(cmd, args = [], timeout = CMD_TIMEOUT_MS) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout,
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    return {
      ok: true,
      code: 0,
      stdout: String(stdout ?? '').trim(),
      stderr: String(stderr ?? '').trim(),
    };
  } catch (err) {
    return {
      ok: false,
      code: typeof err?.code === 'number' ? err.code : 1,
      stdout: String(err?.stdout ?? '').trim(),
      stderr: String(err?.stderr ?? err?.message ?? '').trim(),
    };
  }
}

async function checkIsAdmin() {
  if (process.platform === 'win32') {
    const res = await runCmd('net', ['session'], 2500);
    return res.code === 0;
  }
  return typeof process.getuid === 'function' ? process.getuid() === 0 : false;
}

function parseRegValue(stdout, valueName) {
  if (!stdout) return '';
  const escaped = valueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*${escaped}\\s+REG_\\w+\\s+(.+)$`, 'im');
  const match = stdout.match(re);
  return match ? match[1].trim() : '';
}

function resolveBackupPath(backupPath) {
  if (typeof backupPath === 'string' && backupPath.trim()) {
    return path.resolve(backupPath.trim());
  }
  return DEFAULT_BACKUP_PATH;
}

async function readBackupFile(resolvedPath) {
  try {
    const raw = await fs.readFile(resolvedPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function sanitizeCultureTag(tag) {
  const clean = String(tag || '').trim();
  if (!/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8}){0,3}$/.test(clean)) {
    return '';
  }
  return clean;
}

function sanitizeGeoName(iso) {
  const clean = String(iso || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(clean)) return '';
  return clean;
}

/**
 * Reads the live OS locale, timezone, Windows GeoId, and HKCU registry regional values.
 * @returns {Promise<object>}
 */
export async function readCurrentOsState() {
  const system = await probeSystem();

  let geoId = typeof system.geoId === 'number' && Number.isFinite(system.geoId) ? system.geoId : null;
  let regLocaleName = '';
  let regGeoName = '';
  let regGeoNation = '';

  if (process.platform === 'win32') {
    const [geoRes, intlRes, geoRegRes] = await Promise.all([
      geoId === null
        ? runCmd('powershell', ['-NoProfile', '-NonInteractive', '-Command', '(Get-WinHomeLocation).GeoId'], 3000)
        : Promise.resolve(null),
      runCmd('reg', ['query', HKCU_INTL_KEY, '/v', 'LocaleName'], 3000),
      runCmd('reg', ['query', HKCU_GEO_KEY], 3000),
    ]);

    if (geoId === null && geoRes?.ok && geoRes.stdout) {
      const parsed = Number.parseInt(geoRes.stdout, 10);
      if (Number.isFinite(parsed)) geoId = parsed;
    }

    if (intlRes.ok && intlRes.stdout) {
      regLocaleName = parseRegValue(intlRes.stdout, 'LocaleName');
    }
    if (geoRegRes.ok && geoRegRes.stdout) {
      regGeoName = parseRegValue(geoRegRes.stdout, 'Name');
      regGeoNation = parseRegValue(geoRegRes.stdout, 'Nation');
    }
    if (geoId === null && regGeoNation) {
      const parsedNation = Number.parseInt(regGeoNation, 10);
      if (Number.isFinite(parsedNation)) geoId = parsedNation;
    }
  }

  return {
    ...system,
    geoId,
    regLocaleName,
    regGeoName,
    regGeoNation,
    capturedAt: new Date().toISOString(),
  };
}

function checkMatchesBackup(current, backup) {
  if (!current || !backup) return false;

  if (current.platform === 'win32' || backup.platform === 'win32') {
    const tzMatch =
      !backup.windowsTimezone ||
      !current.windowsTimezone ||
      current.windowsTimezone.toLowerCase() === backup.windowsTimezone.toLowerCase();

    const curLocale = (current.userCulture || current.regLocaleName || current.locale || '').toLowerCase();
    const bakLocale = (backup.userCulture || backup.regLocaleName || backup.locale || '').toLowerCase();
    const localeMatches = !bakLocale || !curLocale || curLocale === bakLocale;

    const geoMatches =
      backup.geoId == null ||
      current.geoId == null ||
      Number(current.geoId) === Number(backup.geoId);

    return tzMatch && localeMatches && geoMatches;
  }

  const tzMatch = !backup.timezone || current.timezone === backup.timezone;
  const curLocale = (current.locale || '').toLowerCase();
  const bakLocale = (backup.locale || '').toLowerCase();
  const localeMatches = !bakLocale || !curLocale || curLocale === bakLocale;
  return tzMatch && localeMatches;
}

/**
 * Returns backup availability, saved original OS snapshot, current OS state, and alignment comparison.
 * @param {{ backupPath?: string }} [opts]
 * @returns {Promise<{ hasBackup: boolean, backupPath: string, backup: object|null, current: object, isAlignedToBackup: boolean }>}
 */
export async function getSwitcherStatus({ backupPath } = {}) {
  const resolvedBackupPath = resolveBackupPath(backupPath);
  const [backup, current] = await Promise.all([
    readBackupFile(resolvedBackupPath),
    readCurrentOsState(),
  ]);
  const hasBackup = Boolean(backup);
  const isAlignedToBackup = hasBackup ? checkMatchesBackup(current, backup) : false;

  return {
    hasBackup,
    backupPath: resolvedBackupPath,
    backup,
    current,
    isAlignedToBackup,
  };
}

function zoneBelongsToCountry(zoneId, targetIso) {
  if (!zoneId || !targetIso) return false;
  const inferred = inferCountriesFromTimezone(zoneId);
  if (inferred.includes(targetIso)) return true;
  const region = getRegionByIso(targetIso);
  if (region?.zones?.some((z) => z.toLowerCase() === zoneId.toLowerCase())) {
    return true;
  }
  return false;
}

/**
 * Resolves the target OS alignment profile (country, IANA zone, Windows TZ, locale, GeoId)
 * from public egress IP or explicit region/timezone inputs.
 * @param {object} [opts]
 */
export async function resolveAlignmentProfile({
  mode = 'auto-ip',
  region = '',
  timezone = '',
  locale = '',
  egress = null,
} = {}) {
  const cleanRegion = String(region || '').trim();
  const cleanTimezone = String(timezone || '').trim();
  const cleanLocale = String(locale || '').trim();
  const useAutoIp = mode === 'auto-ip' || (!cleanRegion && !cleanTimezone);

  let resolvedEgress = egress || null;
  let targetIsoRaw = '';
  let candidateTz = '';
  let source = '';

  if (useAutoIp) {
    if (!resolvedEgress) {
      try {
        resolvedEgress = await probeEgress();
      } catch {
        resolvedEgress = null;
      }
    }
    const egressCc = String(resolvedEgress?.cc || '').trim().toLowerCase();
    const egressTz = String(resolvedEgress?.timezone || '').trim();

    if (egressCc) {
      targetIsoRaw = egressCc;
      candidateTz = cleanTimezone || egressTz;
      source = resolvedEgress?.source ? `auto-ip (${resolvedEgress.source})` : 'auto-ip';
    } else if (cleanRegion) {
      targetIsoRaw = cleanRegion;
      candidateTz = cleanTimezone;
      source = 'fallback-region';
    } else {
      targetIsoRaw = 'us';
      candidateTz = cleanTimezone;
      source = 'fallback-us';
    }
  } else {
    if (cleanRegion) {
      targetIsoRaw = cleanRegion;
    } else {
      const inferred = inferCountriesFromTimezone(cleanTimezone);
      targetIsoRaw = inferred[0] || 'us';
    }
    candidateTz = cleanTimezone;
    source = cleanRegion && cleanTimezone ? 'manual-region+tz' : cleanRegion ? 'manual-region' : 'manual-tz';
  }

  const regionObj = getRegionByIso(targetIsoRaw) || getRegionByIso('us');
  const targetIso = regionObj.iso;
  const targetCountryName = regionObj.name;

  let targetTimezone = '';
  if (candidateTz && zoneBelongsToCountry(candidateTz, targetIso)) {
    const exactCatalogZone = regionObj.zones.find(
      (z) => z.toLowerCase() === candidateTz.toLowerCase(),
    );
    targetTimezone = exactCatalogZone || candidateTz;
  } else {
    targetTimezone = regionObj.zones?.[0] || 'America/New_York';
  }

  const targetLocale = cleanLocale || regionObj.locales?.[0] || `en-${targetIso.toUpperCase()}`;
  const windowsTimezone = ianaToWindowsTz(targetTimezone, targetIso);
  const geoId = Object.prototype.hasOwnProperty.call(COUNTRY_TO_GEOID, targetIso)
    ? COUNTRY_TO_GEOID[targetIso]
    : null;

  return {
    targetIso,
    targetCountryName,
    targetTimezone,
    windowsTimezone,
    targetLocale,
    geoId,
    source,
    egressIp: String(resolvedEgress?.ip || '').trim(),
    egressOrg: String(resolvedEgress?.org || '').trim(),
  };
}

async function applyOsSettings({
  windowsTimezone,
  targetTimezone,
  targetLocale,
  geoId,
  geoName,
  systemLocale = '',
  includeSystemLocale = false,
  dryRun = false,
}) {
  const steps = [];
  const safeLocale = sanitizeCultureTag(targetLocale);
  const safeGeoName = sanitizeGeoName(geoName);
  const validGeoId = Number.isInteger(geoId) && geoId > 0 ? geoId : null;

  if (process.platform === 'win32') {
    if (windowsTimezone) {
      if (dryRun) {
        steps.push({ step: 'tzutil', ok: true, simulated: true, detail: `tzutil /s "${windowsTimezone}"` });
      } else {
        const res = await runCmd('tzutil', ['/s', windowsTimezone]);
        steps.push({
          step: 'tzutil',
          ok: res.ok,
          detail: res.ok ? `Zona horaria Windows: ${windowsTimezone}` : res.stderr || 'Error en tzutil',
        });
      }
    }

    if (safeLocale) {
      if (dryRun) {
        steps.push({
          step: 'set-culture',
          ok: true,
          simulated: true,
          detail: `Set-Culture -CultureInfo '${safeLocale}'`,
        });
        steps.push({
          step: 'reg-locale',
          ok: true,
          simulated: true,
          detail: `reg add "${HKCU_INTL_KEY}" /v LocaleName /d "${safeLocale}"`,
        });
      } else {
        const cultureRes = await runCmd('powershell', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Set-Culture -CultureInfo '${safeLocale}'`,
        ]);
        steps.push({
          step: 'set-culture',
          ok: cultureRes.ok,
          detail: cultureRes.ok ? `Cultura de usuario: ${safeLocale}` : cultureRes.stderr || 'Error en Set-Culture',
        });

        const regRes = await runCmd('reg', [
          'add',
          HKCU_INTL_KEY,
          '/v',
          'LocaleName',
          '/t',
          'REG_SZ',
          '/d',
          safeLocale,
          '/f',
        ]);
        steps.push({
          step: 'reg-locale',
          ok: regRes.ok,
          detail: regRes.ok ? `Registro LocaleName=${safeLocale}` : regRes.stderr || 'Error en reg LocaleName',
        });
      }
    }

    if (validGeoId !== null) {
      if (dryRun) {
        steps.push({
          step: 'set-geoid',
          ok: true,
          simulated: true,
          detail: `Set-WinHomeLocation -GeoId ${validGeoId}`,
        });
        steps.push({
          step: 'reg-geo',
          ok: true,
          simulated: true,
          detail: `reg add "${HKCU_GEO_KEY}" Nation=${validGeoId}${safeGeoName ? ` Name=${safeGeoName}` : ''}`,
        });
      } else {
        const geoRes = await runCmd('powershell', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Set-WinHomeLocation -GeoId ${validGeoId}`,
        ]);
        steps.push({
          step: 'set-geoid',
          ok: geoRes.ok,
          detail: geoRes.ok ? `GeoId Windows: ${validGeoId}` : geoRes.stderr || 'Error en Set-WinHomeLocation',
        });

        const nationRes = await runCmd('reg', [
          'add',
          HKCU_GEO_KEY,
          '/v',
          'Nation',
          '/t',
          'REG_SZ',
          '/d',
          String(validGeoId),
          '/f',
        ]);
        let nameOk = true;
        if (safeGeoName) {
          const nameRes = await runCmd('reg', [
            'add',
            HKCU_GEO_KEY,
            '/v',
            'Name',
            '/t',
            'REG_SZ',
            '/d',
            safeGeoName,
            '/f',
          ]);
          nameOk = nameRes.ok;
        }
        steps.push({
          step: 'reg-geo',
          ok: nationRes.ok && nameOk,
          detail:
            nationRes.ok && nameOk
              ? `Registro Geo Nation=${validGeoId}${safeGeoName ? ` Name=${safeGeoName}` : ''}`
              : 'Error actualizando registro Geo',
        });
      }
    }

    const effectiveSysLocale = sanitizeCultureTag(systemLocale || safeLocale);
    const isAdmin = dryRun ? false : await checkIsAdmin();
    if ((includeSystemLocale || isAdmin) && effectiveSysLocale) {
      if (dryRun) {
        steps.push({
          step: 'system-locale',
          ok: true,
          simulated: true,
          detail: `Set-WinSystemLocale -SystemLocale '${effectiveSysLocale}' (si hay permisos)`,
        });
      } else if (isAdmin) {
        const sysRes = await runCmd('powershell', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Set-WinSystemLocale -SystemLocale '${effectiveSysLocale}'`,
        ]);
        steps.push({
          step: 'system-locale',
          ok: sysRes.ok,
          detail: sysRes.ok
            ? `SystemLocale: ${effectiveSysLocale}`
            : sysRes.stderr || 'No se pudo cambiar SystemLocale',
        });
        const syncRes = await runCmd('w32tm', ['/resync', '/nowait']);
        steps.push({
          step: 'w32tm-resync',
          ok: syncRes.ok,
          detail: syncRes.ok ? 'Hora sincronizada (w32tm)' : syncRes.stderr || 'w32tm omitido',
        });
      } else {
        steps.push({
          step: 'system-locale',
          ok: false,
          skipped: true,
          detail: 'Set-WinSystemLocale requiere privilegios de Administrador.',
        });
      }
    }
  } else {
    if (targetTimezone) {
      if (dryRun) {
        steps.push({
          step: 'timedatectl',
          ok: true,
          simulated: true,
          detail: `timedatectl set-timezone ${targetTimezone}`,
        });
      } else {
        const res = await runCmd('timedatectl', ['set-timezone', targetTimezone]);
        steps.push({
          step: 'timedatectl',
          ok: res.ok,
          detail: res.ok ? `Timezone: ${targetTimezone}` : res.stderr || 'timedatectl no disponible',
        });
      }
    }
  }

  if (!dryRun && targetTimezone) {
    process.env.TZ = targetTimezone;
    steps.push({ step: 'process-tz', ok: true, detail: `process.env.TZ=${targetTimezone}` });
  } else if (dryRun && targetTimezone) {
    steps.push({ step: 'process-tz', ok: true, simulated: true, detail: `process.env.TZ=${targetTimezone}` });
  }

  return steps;
}

/**
 * Aligns OS timezone, user culture, and home GeoId to the target profile,
 * preserving the original OS snapshot in backupPath before the first change.
 * @param {object} [opts]
 */
export async function alignOsToTarget({
  mode = 'auto-ip',
  region = '',
  timezone = '',
  locale = '',
  egress = null,
  includeSystemLocale = false,
  forceBackup = false,
  dryRun = false,
  backupPath,
} = {}) {
  const hasExplicitBackupPath = Boolean(typeof backupPath === 'string' && backupPath.trim());
  const resolvedBackupPath = resolveBackupPath(backupPath);

  const [before, profile, existingBackup] = await Promise.all([
    readCurrentOsState(),
    resolveAlignmentProfile({ mode, region, timezone, locale, egress }),
    readBackupFile(resolvedBackupPath),
  ]);

  let backupSaved = false;
  const shouldWriteBackup = !existingBackup || forceBackup === true;

  if (shouldWriteBackup) {
    const snapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      platform: before.platform,
      timezone: before.timezone,
      windowsTimezone: before.windowsTimezone,
      locale: before.locale,
      userCulture: before.userCulture,
      systemLocale: before.systemLocale,
      localeCountry: before.localeCountry,
      geoId: before.geoId,
      regLocaleName: before.regLocaleName,
      regGeoName: before.regGeoName,
      regGeoNation: before.regGeoNation,
    };

    if (!dryRun || hasExplicitBackupPath) {
      await fs.mkdir(path.dirname(resolvedBackupPath), { recursive: true });
      await fs.writeFile(resolvedBackupPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
      backupSaved = true;
    }
  }

  const steps = await applyOsSettings({
    windowsTimezone: profile.windowsTimezone,
    targetTimezone: profile.targetTimezone,
    targetLocale: profile.targetLocale,
    geoId: profile.geoId,
    geoName: profile.targetIso.toUpperCase(),
    includeSystemLocale,
    dryRun: Boolean(dryRun),
  });

  const after = dryRun ? before : await readCurrentOsState();
  const prefix = dryRun ? '[Simulación dry-run] ' : '';
  const message =
    `${prefix}OS alineado a ${profile.targetCountryName} (${profile.targetIso.toUpperCase()}): ` +
    `TZ=${profile.targetTimezone} (${profile.windowsTimezone}), Locale=${profile.targetLocale}, GeoId=${profile.geoId ?? 'N/A'}.`;

  return {
    ok: true,
    dryRun: Boolean(dryRun),
    action: 'align',
    profile,
    backupSaved,
    backupPath: resolvedBackupPath,
    before,
    after,
    steps,
    message,
  };
}

/**
 * Restores the OS timezone, culture, and GeoId from the saved backup snapshot.
 * @param {object} [opts]
 */
export async function revertOsFromBackup({ dryRun = false, keepBackup = false, backupPath } = {}) {
  const hasExplicitBackupPath = Boolean(typeof backupPath === 'string' && backupPath.trim());
  const resolvedBackupPath = resolveBackupPath(backupPath);
  const backup = await readBackupFile(resolvedBackupPath);

  if (!backup) {
    return {
      ok: false,
      error: 'No existe backup guardado para revertir.',
    };
  }

  const before = await readCurrentOsState();

  const windowsTimezone =
    backup.windowsTimezone || (backup.timezone ? ianaToWindowsTz(backup.timezone) : '');
  const targetTimezone = backup.timezone || (windowsTimezone ? windowsToIanaTz(windowsTimezone) : '');
  const targetLocale = backup.regLocaleName || backup.userCulture || backup.locale || '';
  const geoId =
    typeof backup.geoId === 'number' && Number.isFinite(backup.geoId)
      ? backup.geoId
      : backup.regGeoNation
        ? Number.parseInt(backup.regGeoNation, 10)
        : null;
  const geoName = backup.regGeoName || (backup.localeCountry ? backup.localeCountry.toUpperCase() : '');

  const steps = await applyOsSettings({
    windowsTimezone,
    targetTimezone,
    targetLocale,
    geoId: Number.isFinite(geoId) ? geoId : null,
    geoName,
    systemLocale: backup.systemLocale || '',
    includeSystemLocale: Boolean(backup.systemLocale),
    dryRun: Boolean(dryRun),
  });

  if (!keepBackup && (!dryRun || hasExplicitBackupPath)) {
    try {
      await fs.unlink(resolvedBackupPath);
      steps.push({ step: 'remove-backup', ok: true, detail: `Backup eliminado: ${resolvedBackupPath}` });
    } catch (err) {
      steps.push({ step: 'remove-backup', ok: false, detail: err.message });
    }
  } else if (keepBackup) {
    steps.push({ step: 'keep-backup', ok: true, detail: `Backup conservado: ${resolvedBackupPath}` });
  }

  const after = dryRun ? before : await readCurrentOsState();
  const prefix = dryRun ? '[Simulación dry-run] ' : '';
  const message =
    `${prefix}OS restaurado desde backup (${backup.savedAt || 'sin fecha'}): ` +
    `TZ=${targetTimezone || windowsTimezone}, Locale=${targetLocale || 'N/A'}, GeoId=${geoId ?? 'N/A'}.`;

  return {
    ok: true,
    dryRun: Boolean(dryRun),
    action: 'revert',
    restoredFrom: backup,
    before,
    after,
    steps,
    message,
  };
}
