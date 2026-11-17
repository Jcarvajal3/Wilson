import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { probeEgress } from '../probes/networkProbe.js';
import { probeVpn } from '../probes/vpnProbe.js';
import {
  alignOsToTarget,
  getSwitcherStatus,
  revertOsFromBackup,
} from '../switcher/osSwitcher.js';

function parseArgs(argv) {
  const opts = {
    action: '',
    region: '',
    tz: '',
    locale: '',
    backup: '',
    dryRun: false,
    json: false,
    interactive: false,
    includeSystemLocale: false,
    forceBackup: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--auto' || arg === '--ip') {
      opts.action = 'auto';
    } else if (arg === '--us') {
      opts.action = 'us';
      if (!opts.region) opts.region = 'us';
    } else if (arg === '--ve') {
      opts.action = 've';
      if (!opts.region) opts.region = 've';
    } else if (arg === '--revert' || arg === '--restore') {
      opts.action = 'revert';
    } else if (arg === '--status') {
      opts.action = 'status';
    } else if (arg === '--interactive' || arg === '-i') {
      opts.interactive = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--include-system-locale') {
      opts.includeSystemLocale = true;
    } else if (arg === '--force-backup') {
      opts.forceBackup = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--region' && argv[i + 1]) {
      opts.region = argv[++i];
    } else if (arg.startsWith('--region=')) {
      opts.region = arg.slice('--region='.length);
    } else if (arg === '--tz' && argv[i + 1]) {
      opts.tz = argv[++i];
    } else if (arg.startsWith('--tz=')) {
      opts.tz = arg.slice('--tz='.length);
    } else if (arg === '--locale' && argv[i + 1]) {
      opts.locale = argv[++i];
    } else if (arg.startsWith('--locale=')) {
      opts.locale = arg.slice('--locale='.length);
    } else if (arg === '--backup' && argv[i + 1]) {
      opts.backup = argv[++i];
    } else if (arg.startsWith('--backup=')) {
      opts.backup = arg.slice('--backup='.length);
    }
  }

  if (!opts.action && !opts.interactive && !opts.help) {
    if (opts.region || opts.tz || opts.locale) {
      opts.action = 'manual';
    } else {
      opts.interactive = true;
    }
  }

  return opts;
}

function printHelp() {
  console.log(`Uso: node src/server/switcherCli.js [opciones]

Opciones:
  --auto, --ip         Alinea el OS automáticamente según la IP pública detectada
  --us                 Alinea el OS a Estados Unidos (America/New_York, en-US)
  --ve                 Alinea el OS a Venezuela (America/Caracas, es-VE)
  --region <iso>       País ISO2 objetivo (ej: us, es, mx, ve)
  --tz <iana>          Zona horaria IANA objetivo (ej: America/Chicago)
  --locale <locale>    Cultura/Locale objetivo (ej: en-US, es-VE)
  --revert, --restore  Restaura el estado original del OS desde el backup
  --status             Muestra el estado actual del OS y el estado del backup
  --dry-run            Simula sin modificar el sistema operativo
  --backup <path>      Ruta alternativa para el archivo de backup JSON
  --json               Imprime el resultado en formato JSON
  --interactive        Abre el menú interactivo en español
  -h, --help           Muestra esta ayuda`);
}

function printStatusReport(status) {
  const cur = status.current || {};
  console.log('------------------------------------------------------------------');
  console.log('Estado actual del Sistema Operativo:');
  console.log(`  Plataforma     : ${cur.platform || '?'}`);
  console.log(`  Zona IANA      : ${cur.timezone || '?'} (${cur.utcOffset || '?'})`);
  console.log(`  Zona Windows   : ${cur.windowsTimezone || '—'}`);
  console.log(`  Locale/Cultura : ${cur.userCulture || cur.locale || '?'} (System: ${cur.systemLocale || '—'})`);
  console.log(`  GeoId          : ${cur.geoId ?? '—'} (RegName: ${cur.regGeoName || '—'}, RegNation: ${cur.regGeoNation || '—'})`);
  console.log(`  País inferido  : ${(cur.primaryInferredCountry || '?').toUpperCase()}`);
  console.log('');
  console.log(`Backup (${status.backupPath}):`);
  if (!status.hasBackup) {
    console.log('  Estado         : No existe backup guardado.');
  } else {
    const bak = status.backup;
    console.log(`  Estado         : Guardado (${bak.savedAt || 'sin fecha'}) · Alineado al backup: ${status.isAlignedToBackup ? 'SÍ' : 'NO'}`);
    console.log(`  Original       : TZ=${bak.timezone || '?'} (${bak.windowsTimezone || '—'}), Locale=${bak.userCulture || bak.locale || '?'}, GeoId=${bak.geoId ?? '—'}`);
  }
  console.log('------------------------------------------------------------------');
}

function printActionResult(result) {
  if (!result.ok) {
    console.error(`✗ Error: ${result.error || 'Operación fallida'}`);
    return;
  }
  console.log(result.message);
  if (Array.isArray(result.steps) && result.steps.length > 0) {
    console.log('Pasos:');
    for (const step of result.steps) {
      const glyph = step.ok ? (step.simulated ? '·' : '✓') : step.skipped ? '⚠' : '✗';
      console.log(`  ${glyph} [${step.step}] ${step.detail}`);
    }
  }
  if (result.backupPath && result.action === 'align') {
    console.log(`Backup: ${result.backupPath} (${result.backupSaved ? 'guardado' : result.dryRun ? 'simulado/existente' : 'conservado'})`);
  }
}

async function runQuickScanAndStatus(backupPath) {
  const [status, vpn, egress] = await Promise.all([
    getSwitcherStatus({ backupPath }),
    probeVpn(),
    probeEgress(),
  ]);
  printStatusReport(status);
  console.log('Escaneo rápido de red:');
  console.log(`  IP Pública     : ${egress.ip || '?'} (${egress.cc || '?'} - ${egress.city || '?'}, ${egress.region || '?'})`);
  console.log(`  ASN / Org      : ${egress.org || '?'} ${egress.isDatacenter ? '[DATACENTER]' : '[Residencial]'}`);
  console.log(`  TZ según IP    : ${egress.timezone || '—'}`);
  console.log(`  VPN / Proxy    : ${vpn.active ? `Activa (${vpn.label || vpn.transport})` : 'Inactiva'} · Admin=${vpn.isAdmin ? 'SÍ' : 'NO'}`);
  console.log('------------------------------------------------------------------');
}

async function runInteractiveMenu(opts) {
  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      console.log('');
      console.log('==================================================================');
      console.log(`  WilsonGeoGuard — Alineador de Ubicación del Sistema${opts.dryRun ? ' [DRY-RUN]' : ''}`);
      console.log('==================================================================');
      console.log('  1) Auto según IP pública');
      console.log('  2) US Este (America/New_York, en-US)');
      console.log('  3) US Centro (America/Chicago, en-US)');
      console.log('  4) US Pacífico (America/Los_Angeles, en-US)');
      console.log('  5) Revertir OS original desde backup / VE');
      console.log('  6) Ver estado actual + escaneo rápido');
      console.log('  0) Salir');
      console.log('------------------------------------------------------------------');

      const choice = (await rl.question('Selecciona una opción [0-6]: ')).trim();
      console.log('');

      if (choice === '0') {
        console.log('Saliendo de WilsonGeoGuard OS Switcher.');
        break;
      }

      if (choice === '1') {
        const res = await alignOsToTarget({
          mode: 'auto-ip',
          dryRun: opts.dryRun,
          backupPath: opts.backup || undefined,
          includeSystemLocale: opts.includeSystemLocale,
          forceBackup: opts.forceBackup,
        });
        printActionResult(res);
      } else if (choice === '2') {
        const res = await alignOsToTarget({
          mode: 'manual',
          region: 'us',
          timezone: 'America/New_York',
          locale: 'en-US',
          dryRun: opts.dryRun,
          backupPath: opts.backup || undefined,
          includeSystemLocale: opts.includeSystemLocale,
          forceBackup: opts.forceBackup,
        });
        printActionResult(res);
      } else if (choice === '3') {
        const res = await alignOsToTarget({
          mode: 'manual',
          region: 'us',
          timezone: 'America/Chicago',
          locale: 'en-US',
          dryRun: opts.dryRun,
          backupPath: opts.backup || undefined,
          includeSystemLocale: opts.includeSystemLocale,
          forceBackup: opts.forceBackup,
        });
        printActionResult(res);
      } else if (choice === '4') {
        const res = await alignOsToTarget({
          mode: 'manual',
          region: 'us',
          timezone: 'America/Los_Angeles',
          locale: 'en-US',
          dryRun: opts.dryRun,
          backupPath: opts.backup || undefined,
          includeSystemLocale: opts.includeSystemLocale,
          forceBackup: opts.forceBackup,
        });
        printActionResult(res);
      } else if (choice === '5') {
        const status = await getSwitcherStatus({ backupPath: opts.backup || undefined });
        if (status.hasBackup) {
          const res = await revertOsFromBackup({
            dryRun: opts.dryRun,
            backupPath: opts.backup || undefined,
          });
          printActionResult(res);
        } else {
          console.log('No se encontró backup guardado; aplicando perfil VE (America/Caracas, es-VE)...');
          const res = await alignOsToTarget({
            mode: 'manual',
            region: 've',
            timezone: 'America/Caracas',
            locale: 'es-VE',
            dryRun: opts.dryRun,
            backupPath: opts.backup || undefined,
            includeSystemLocale: opts.includeSystemLocale,
          });
          printActionResult(res);
        }
      } else if (choice === '6') {
        await runQuickScanAndStatus(opts.backup || undefined);
      } else {
        console.log('Opción no válida. Elige un número entre 0 y 6.');
      }
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    printHelp();
    return;
  }

  if (opts.interactive) {
    await runInteractiveMenu(opts);
    return;
  }

  let result;
  if (opts.action === 'status') {
    result = await getSwitcherStatus({ backupPath: opts.backup || undefined });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printStatusReport(result);
    }
    return;
  }

  if (opts.action === 'revert') {
    result = await revertOsFromBackup({
      dryRun: opts.dryRun,
      backupPath: opts.backup || undefined,
    });
  } else {
    const mode = opts.action === 'auto' ? 'auto-ip' : 'manual';
    result = await alignOsToTarget({
      mode,
      region: opts.region,
      timezone: opts.tz,
      locale: opts.locale,
      dryRun: opts.dryRun,
      backupPath: opts.backup || undefined,
      includeSystemLocale: opts.includeSystemLocale,
      forceBackup: opts.forceBackup,
    });
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printActionResult(result);
  }

  if (result && result.ok === false) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
