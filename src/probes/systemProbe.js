import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  extractLocaleCountry,
  inferCountriesFromTimezone,
  parseMin,
  utcAt,
  utcFmt,
} from "../catalog/regions.js";
import { ianaToWindowsTz, windowsToIanaTz } from "../switcher/osSwitcher.js";

const execFileAsync = promisify(execFile);
const WIN_CMD_TIMEOUT_MS = 2500;

async function runQuickCommand(cmd, args) {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: WIN_CMD_TIMEOUT_MS,
      windowsHide: true,
      encoding: "utf8",
    });
    return typeof stdout === "string" ? stdout.trim() : "";
  } catch {
    return "";
  }
}

async function probeWindowsDetails() {
  if (process.platform !== "win32") {
    return { windowsTimezone: "", systemLocale: "", userCulture: "", geoId: null };
  }

  const [tzOut, localeOut] = await Promise.all([
    runQuickCommand("tzutil", ["/g"]),
    runQuickCommand("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "(Get-WinSystemLocale).Name + '|' + (Get-Culture).Name + '|' + (Get-WinHomeLocation).GeoId",
    ]),
  ]);

  let systemLocale = "";
  let userCulture = "";
  let geoId = null;
  if (localeOut && localeOut.includes("|")) {
    const [sysPart, userPart, geoPart] = localeOut.split("|");
    systemLocale = (sysPart ?? "").trim();
    userCulture = (userPart ?? "").trim();
    const parsedGeo = Number.parseInt((geoPart ?? "").trim(), 10);
    if (Number.isFinite(parsedGeo)) {
      geoId = parsedGeo;
    }
  }

  return {
    windowsTimezone: tzOut,
    systemLocale,
    userCulture,
    geoId,
  };
}

/**
 * Inspect local OS/runtime locale, timezone, UTC offset, GeoId, and infer expected countries.
 * @returns {Promise<{
 *   locale: string,
 *   localeCountry: string,
 *   systemLocale: string,
 *   userCulture: string,
 *   geoId: number|null,
 *   timezone: string,
 *   windowsTimezone: string,
 *   utcOffsetMinutes: number,
 *   utcOffset: string,
 *   inferredCountries: string[],
 *   primaryInferredCountry: string,
 *   platform: string,
 *   arch: string,
 *   hostname: string
 * }>}
 */
export async function probeSystem() {
  const intlOpts = Intl.DateTimeFormat().resolvedOptions();
  let timezone = intlOpts.timeZone || "";
  const envLocale = (
    process.env.LC_ALL ||
    process.env.LC_MESSAGES ||
    process.env.LANG ||
    ""
  ).trim();

  const win = await probeWindowsDetails();

  const rawOffset = -new Date().getTimezoneOffset();
  let utcOffsetMinutes = rawOffset === 0 ? 0 : rawOffset;
  let utcOffset = "UTC" + utcFmt(utcOffsetMinutes);

  if (process.platform === "win32" && win.windowsTimezone) {
    if (ianaToWindowsTz(timezone) !== win.windowsTimezone) {
      const liveZone = windowsToIanaTz(win.windowsTimezone);
      if (liveZone) {
        timezone = liveZone;
        const liveUtc = utcAt(liveZone);
        const liveMins = parseMin(liveUtc);
        if (liveMins !== null) {
          utcOffsetMinutes = liveMins;
          utcOffset = liveUtc;
        }
      }
    }
  }

  const locale =
    win.userCulture ||
    envLocale ||
    intlOpts.locale ||
    win.systemLocale ||
    "";

  const localeCountry =
    extractLocaleCountry(locale) ||
    extractLocaleCountry(win.userCulture) ||
    extractLocaleCountry(win.systemLocale) ||
    extractLocaleCountry(envLocale) ||
    extractLocaleCountry(intlOpts.locale) ||
    "";

  const systemLocale = win.systemLocale || envLocale || intlOpts.locale || "";
  const userCulture = win.userCulture || intlOpts.locale || envLocale || "";

  const inferredCountries = inferCountriesFromTimezone(timezone);
  const primaryInferredCountry =
    inferredCountries.length > 0 ? inferredCountries[0] : localeCountry;

  return {
    locale,
    localeCountry,
    systemLocale,
    userCulture,
    geoId: win.geoId,
    timezone,
    windowsTimezone: win.windowsTimezone,
    utcOffsetMinutes,
    utcOffset,
    inferredCountries,
    primaryInferredCountry,
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
  };
}
