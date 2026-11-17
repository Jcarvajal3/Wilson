import { getTargetById } from '../catalog/targets.js';
import { evaluateScan } from '../engine/assessment.js';
import { probeNetwork } from '../probes/networkProbe.js';
import { probeSystem } from '../probes/systemProbe.js';
import { applyBasicVpnFix, probeVpn } from '../probes/vpnProbe.js';
import { alignOsToTarget, revertOsFromBackup } from '../switcher/osSwitcher.js';
import { startServer } from './appServer.js';

function parseArgs(argv) {
  const opts = {
    scan: false,
    fix: false,
    align: false,
    alignRegion: '',
    alignTz: '',
    revert: false,
    dryRun: false,
    backupPath: '',
    region: '',
    target: 'claude',
    domains: [],
    json: false,
    gui: false,
    port: 4380,
    noOpen: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--scan') opts.scan = true;
    else if (arg === '--fix') opts.fix = true;
    else if (arg === '--align') opts.align = true;
    else if (arg === '--revert') opts.revert = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--gui') opts.gui = true;
    else if (arg === '--no-open') opts.noOpen = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--align-region' && argv[i + 1]) opts.alignRegion = argv[++i];
    else if (arg.startsWith('--align-region=')) opts.alignRegion = arg.slice('--align-region='.length);
    else if (arg === '--align-tz' && argv[i + 1]) opts.alignTz = argv[++i];
    else if (arg.startsWith('--align-tz=')) opts.alignTz = arg.slice('--align-tz='.length);
    else if (arg === '--backup' && argv[i + 1]) opts.backupPath = argv[++i];
    else if (arg.startsWith('--backup=')) opts.backupPath = arg.slice('--backup='.length);
    else if (arg === '--region' && argv[i + 1]) opts.region = argv[++i];
    else if (arg.startsWith('--region=')) opts.region = arg.slice('--region='.length);
    else if (arg === '--target' && argv[i + 1]) opts.target = argv[++i];
    else if (arg.startsWith('--target=')) opts.target = arg.slice('--target='.length);
    else if (arg === '--domains' && argv[i + 1]) {
      opts.domains = argv[++i].split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--domains=')) {
      opts.domains = arg
        .slice('--domains='.length)
        .split(/[,\s;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === '--port' && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) opts.port = parsed;
    } else if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) opts.port = parsed;
    }
  }

  return opts;
}

function stateGlyph(state) {
  if (state === 1) return '✓';
  if (state === 0) return '✗';
  if (state === 2) return '⚠';
  return '—';
}

function printTextReport(assessment) {
  const v = assessment.locationVerdict;
  console.log('==================================================================');
  console.log('  WilsonGeoGuard — Auditoría Anti-Spoofing y Ubicación Geográfica');
  console.log('==================================================================');
  console.log(`Fecha UTC       : ${assessment.timestamp}`);
  console.log(`Objetivo        : ${assessment.target.name} (${assessment.target.id})`);
  console.log(`Región esperada : ${assessment.expectedRegion ? assessment.expectedRegion.toUpperCase() : 'No seleccionada'}`);
  console.log(`Privilegios     : ${assessment.vpn?.isAdmin ? 'Administrador' : 'Usuario estándar'}`);
  console.log('');
  console.log(`VEREDICTO       : ${v.consistent ? '✓ UBICACIÓN CONSISTENTE' : '✗ DISCORDANCIA / POSIBLE EVASIÓN GEOGRÁFICA'}`);
  console.log(`Riesgo          : ${assessment.riskScore}/100 (${assessment.riskLevel}) · Spoofed=${assessment.isLocationSpoofed ? 'SÍ' : 'NO'}`);
  console.log(`Resumen         : ${v.summary}`);
  console.log(`  - IP aparenta : ${v.declaredIpFlag || ''} ${v.declaredIpCountryName || '?'} (${v.declaredIpCountry?.toUpperCase() || '?'})`);
  console.log(`  - OS sugiere  : ${v.systemInferredFlag || ''} ${v.systemInferredCountryName || '?'} (${v.systemInferredCountry?.toUpperCase() || '?'})`);
  console.log(`  - Fuga real   : ${v.leakedRealCountry ? `${v.leakedRealFlag || ''} ${v.leakedRealCountryName} (${v.leakedRealCountry.toUpperCase()})` : 'Ninguna'}`);
  console.log(`  - Real est.   : ${v.estimatedActualFlag || ''} ${v.estimatedActualCountryName || '?'} (${v.estimatedActualCountry?.toUpperCase() || '?'})`);

  console.log('\n[Sistema]');
  for (const row of assessment.systemTable) {
    console.log(`  ${stateGlyph(row.state)} ${row.label.padEnd(26)} | Esperado: ${String(row.expected).padEnd(22)} | Actual: ${row.actual}`);
  }

  console.log('\n[Comprobación de Red]');
  for (const row of assessment.networkTable) {
    console.log(`  ${stateGlyph(row.state)} ${row.label.padEnd(26)} | Esperado: ${String(row.expected).padEnd(22)} | Actual: ${row.actual}`);
  }

  if (assessment.fixResult?.attempted) {
    console.log('\n[Corrección Básica VPN]');
    for (const line of String(assessment.fixResult.message || '').split('\n')) {
      console.log(`  ${line}`);
    }
  }

  if (assessment.switcherResult) {
    const sr = assessment.switcherResult;
    console.log('\n[Alineación OS (Switcher)]');
    console.log(`  Estado  : ${sr.ok ? '✓ OK' : '✗ ERROR'}${sr.dryRun ? ' (DRY-RUN)' : ''}`);
    if (sr.action) {
      console.log(`  Acción  : ${sr.action}`);
    }
    if (sr.profile) {
      console.log(
        `  Perfil  : ${sr.profile.targetIso ? sr.profile.targetIso.toUpperCase() : '?'} · ${sr.profile.targetTimezone || '?'} · ${sr.profile.targetLocale || '?'} · GeoId=${sr.profile.geoId ?? '?'}`,
      );
    }
    if (sr.message) {
      console.log(`  Detalle : ${sr.message}`);
    } else if (sr.error) {
      console.log(`  Error   : ${sr.error}`);
    }
  }

  console.log('\n[Discordancias Detectadas]');
  if (assessment.discrepancies.length === 0) {
    console.log('  ✓ Ninguna discordancia detectada.');
  } else {
    for (const d of assessment.discrepancies) {
      console.log(`  • [${d.severity}] ${d.code}: ${d.title}`);
      console.log(`    Detalle: ${d.detail}`);
      console.log(`    Acción : ${d.recommendation}`);
    }
  }

  console.log('\n[Notas Operativas]');
  assessment.notes.forEach((n, idx) => {
    console.log(`  ${idx + 1}. ${n}`);
  });
  console.log('==================================================================');
}

function printHelp() {
  console.log(`Uso: node src/server/cli.js [opciones]

Opciones:
  --gui                   Inicia servidor local y abre la ventana desktop (por defecto)
  --scan                  Ejecuta auditoría completa en consola y termina
  --json                  Imprime el resultado del escaneo en JSON (implica --scan)
  --fix                   Si hay VPN activa durante --scan, aplica corrección básica (IPv6 + proxy)
  --align                 Alinea zona horaria, idioma y GeoId del OS con la IP pública antes de escanear
  --align-region <iso>    Alinea el OS al país ISO2 indicado antes de escanear (ej: us, es)
  --align-tz <iana>       Alinea el OS a la zona IANA indicada antes de escanear (ej: America/New_York)
  --revert                Revierte el OS a la configuración original guardada antes de escanear
  --dry-run               Simula --align/--revert sin modificar el OS real
  --region <iso>          País ISO2 esperado para comparar salida (ej: es, us, mx)
  --target <id>           Objetivo de reglas (claude, chatgpt, custom)
  --domains <d1,d2>       Dominios personalizados separados por coma
  --port <num>            Puerto HTTP local para --gui (por defecto 4380)
  --no-open               Inicia --gui sin abrir navegador automáticamente
  -h, --help              Muestra esta ayuda`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const hasSwitcherAction = Boolean(opts.align || opts.alignRegion || opts.alignTz || opts.revert);

  if (!opts.gui && (opts.scan || opts.json || hasSwitcherAction)) {
    let switcherResult = null;
    if (opts.revert) {
      switcherResult = await revertOsFromBackup({
        dryRun: opts.dryRun,
        ...(opts.backupPath ? { backupPath: opts.backupPath } : {}),
      });
    } else if (opts.align || opts.alignRegion || opts.alignTz) {
      const hasManualTarget = Boolean(opts.alignRegion || opts.alignTz);
      switcherResult = await alignOsToTarget({
        mode: hasManualTarget ? 'manual' : 'auto-ip',
        region: opts.alignRegion || '',
        timezone: opts.alignTz || '',
        dryRun: opts.dryRun,
        ...(opts.backupPath ? { backupPath: opts.backupPath } : {}),
      });
    }

    const targetSpec = getTargetById(opts.target);
    const [system, initialVpn] = await Promise.all([probeSystem(), probeVpn()]);
    let vpn = initialVpn;
    let network = await probeNetwork({
      targetSpec,
      customDomains: opts.domains,
      systemProxy: vpn.systemProxy,
      vpnActive: vpn.active,
    });

    let fixResult = null;
    if (opts.fix && vpn.active) {
      fixResult = await applyBasicVpnFix(vpn);
      vpn = await probeVpn();
      network = await probeNetwork({
        targetSpec,
        customDomains: opts.domains,
        systemProxy: vpn.systemProxy,
        vpnActive: vpn.active,
      });
    }

    const assessment = evaluateScan({
      system,
      vpn,
      network,
      expectedRegion: opts.region,
      targetId: targetSpec.id,
      fixResult,
      ipHistory: [],
    });

    if (switcherResult) {
      assessment.switcherResult = switcherResult;
    }

    if (opts.json) {
      console.log(JSON.stringify(assessment, null, 2));
    } else {
      printTextReport(assessment);
    }
    process.exit(0);
  }

  await startServer({ port: opts.port, openWindow: !opts.noOpen });
}

main().catch((err) => {
  console.error('Error fatal en WilsonGeoGuard:', err);
  process.exit(1);
});
