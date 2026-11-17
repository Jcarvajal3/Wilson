import {
  getRegionByIso,
  utcMatch,
  localeMatch,
  extractLocaleCountry,
  inferCountriesFromTimezone,
  flagOf,
  isDatacenterOrg,
} from '../catalog/regions.js';
import { getTargetById } from '../catalog/targets.js';

export const OPERATIONAL_NOTES = [
  'Si la salida IP no coincide con la región, el nodo está en otro país. Cambia el nodo o selecciona el país del nodo.',
  'Si hay una VPN en funcionamiento, realiza correcciones básicas (desactivar IPv6 y borrar el proxy del sistema) y lee el resultado de vuelta.',
  'Always-on VPN debe activarse desde la Configuración de VPN del sistema (en desktop no se fuerza vía settings).',
  'DNS unread (No leído / fallo transitorio) significa que una consulta falló; no es una filtración.',
  'Las direcciones 198.18.* / 198.19.* corresponden a Fake-IP del túnel: los dominios extranjeros se resuelven en el nodo remoto sin fuga DNS local.',
];

function normalizeIso(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function formatUtcMinutes(minutes) {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) return '';
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(Math.trunc(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, '0')}`;
}

function describeCountry(iso) {
  const code = normalizeIso(iso);
  if (!code) {
    return { code: '', name: '', flag: '' };
  }
  const region = getRegionByIso(code);
  return {
    code,
    name: region?.name || code.toUpperCase(),
    flag: flagOf(code),
  };
}

function formatExpectedList(val) {
  if (Array.isArray(val)) return val.join(' / ');
  return val ? String(val) : '—';
}

function updateIpHistory(ipHistory, currentIp) {
  const cleanPrev = Array.isArray(ipHistory)
    ? ipHistory.map((ip) => String(ip || '').trim()).filter(Boolean)
    : [];
  const previousIp = cleanPrev[0] || '';
  const ip = String(currentIp || '').trim();
  const validIp = Boolean(ip && ip !== '?' && ip !== 'none' && ip !== 'timeout' && ip !== 'err');
  const ipFlipped = Boolean(previousIp && validIp && previousIp !== ip);

  const nextHistory = validIp
    ? [ip, ...cleanPrev.filter((item) => item !== ip)].slice(0, 8)
    : cleanPrev.slice(0, 8);

  return { previousIp, ipFlipped, ipHistory: nextHistory };
}

function evaluateDnsMetrics(dns, egressCc, vpnActive) {
  const safeDns = dns || {};
  let fakeCount = Number(safeDns.fakeCount ?? safeDns.fakeIpCount ?? 0);
  let realCount = Number(safeDns.realCount ?? safeDns.realIpCount ?? 0);
  let failedCount = Number(safeDns.failedCount ?? 0);
  let totalChecked = Number(safeDns.total ?? safeDns.totalChecked ?? fakeCount + realCount);

  if (
    safeDns.fakeCount === undefined &&
    safeDns.fakeIpCount === undefined &&
    safeDns.realCount === undefined &&
    safeDns.realIpCount === undefined &&
    Array.isArray(safeDns.domains)
  ) {
    fakeCount = 0;
    realCount = 0;
    failedCount = 0;
    for (const d of safeDns.domains) {
      const ips = Array.isArray(d?.ips) ? d.ips : [];
      if (d?.error || ips.length === 0) {
        failedCount++;
      } else if (d.isFakeIp || ips.some((ip) => /^198\.1[89]\./.test(String(ip)))) {
        fakeCount++;
      } else {
        realCount++;
      }
    }
    totalChecked = fakeCount + realCount;
  }

  const resolverIp = String(safeDns.resolverIp || '').trim();
  const resolverCc = normalizeIso(safeDns.resolverCc);

  let state = typeof safeDns.state === 'number' ? safeDns.state : null;
  if (state === null) {
    if (fakeCount > 0 && realCount > 0) {
      state = 0;
    } else if (resolverCc && egressCc && vpnActive && resolverCc !== egressCc) {
      state = 0;
    } else if (totalChecked === 0 || failedCount > 0) {
      state = -1;
    } else {
      state = 1;
    }
  }

  let actual = 'No leído (unread)';
  let detail = safeDns.note || '';

  if (state === -1) {
    actual = 'No leído (unread)';
    detail =
      detail ||
      `Consultas fallidas (${failedCount}); fallo transitorio no equivale a fuga DNS.`;
  } else if (state === 0) {
    actual = 'Filtrado';
    if (!detail) {
      detail =
        fakeCount > 0 && realCount > 0
          ? `Mezcla de Fake-IP (${fakeCount}) e IP real (${realCount}); algún dominio escapó del túnel.`
          : `Resolver DNS (${resolverIp || '?'} ${resolverCc.toUpperCase()}) difiere de la salida (${egressCc.toUpperCase()}).`;
    }
  } else {
    actual = fakeCount > 0 ? `No filtrado (fake-ip ${fakeCount}/${totalChecked || fakeCount})` : 'No filtrado';
    if (!detail) {
      detail =
        fakeCount > 0
          ? 'Todos los dominios extranjeros resuelven vía Fake-IP (198.18.*/198.19.*) en el nodo remoto.'
          : resolverIp
            ? `Resolver observado: ${resolverIp}${resolverCc ? ` (${resolverCc.toUpperCase()})` : ''}.`
            : 'Sin fuga DNS observada.';
    }
  }

  return {
    state,
    actual,
    detail,
    resolverIp,
    resolverCc,
    fakeCount,
    realCount,
    failedCount,
  };
}

function evaluateIpv6Metrics(ipv6, egressCc) {
  const safeV6 = ipv6 || {};
  const externalIp = String(safeV6.externalIp || safeV6.ip || 'none').trim();
  const localAddrs = Array.isArray(safeV6.localGlobalAddrs)
    ? safeV6.localGlobalAddrs
    : Array.isArray(safeV6.localAddrs)
      ? safeV6.localAddrs
      : [];
  const v6Cc = normalizeIso(safeV6.externalCc || safeV6.cc);
  const hasExternal = Boolean(externalIp && externalIp !== 'none' && externalIp !== 'timeout' && externalIp !== 'err');
  const extLower = externalIp.toLowerCase();
  const isLocalLeak = Boolean(
    safeV6.isLocalLeak ||
      (hasExternal && localAddrs.some((entry) => {
        const addr = typeof entry === 'string' ? entry : entry?.address;
        return addr && addr.toLowerCase() === extLower;
      })),
  );
  const ccMismatch = Boolean(hasExternal && v6Cc && egressCc && v6Cc !== egressCc);

  let state = typeof safeV6.state === 'number' ? safeV6.state : 1;
  if (isLocalLeak || ccMismatch) {
    state = 0;
  } else if (!hasExternal) {
    state = 1;
  }

  let actual;
  let detail;
  if (!hasExternal) {
    actual = 'No filtrado (sin salida IPv6)';
    detail = 'El túnel bloquea IPv6 o el equipo no tiene salida IPv6 externa.';
  } else if (state === 0) {
    actual = `Filtrado (${externalIp})`;
    detail = isLocalLeak
      ? `La IPv6 externa ${externalIp} coincide con una interfaz local del dispositivo.`
      : `La salida IPv6 (${externalIp}, ${v6Cc.toUpperCase()}) no coincide con la IPv4 (${egressCc.toUpperCase()}).`;
  } else {
    actual = `No filtrado (${externalIp})`;
    detail = `Salida IPv6 externa coherente${v6Cc ? ` (${v6Cc.toUpperCase()})` : ''}.`;
  }

  return { state, actual, detail, externalIp, v6Cc, isLocalLeak, ccMismatch, localAddrs };
}

function evaluateUdpMetrics(udp, egressIp, egressCc) {
  const safeUdp = udp || {};
  const uip = String(safeUdp.ip || '').trim();
  const ucc = normalizeIso(safeUdp.cc);
  const via = String(safeUdp.via || '').trim();

  if (!uip) {
    return {
      state: -1,
      actual: 'No leído',
      detail: 'No se pudo completar la sonda STUN/UDP.',
      ip: '',
      cc: '',
    };
  }

  if (uip === 'timeout' || uip === 'err') {
    return {
      state: 1,
      actual: 'Protegido (UDP bloqueado)',
      detail: 'El tráfico UDP saliente está bloqueado o no responde STUN; sin superficie de fuga WebRTC.',
      ip: uip,
      cc: '',
    };
  }

  const sameIp = Boolean(egressIp && uip === egressIp);
  const sameCc = Boolean(ucc && egressCc && ucc === egressCc);
  const matches = sameIp || sameCc;
  const state = typeof safeUdp.state === 'number' && !egressIp && !ucc ? safeUdp.state : matches ? 1 : 0;

  if (state === 1) {
    return {
      state: 1,
      actual: `Misma salida (${uip}${ucc ? ` ${ucc.toUpperCase()}` : ''})`,
      detail: `STUN/UDP coincide con la salida TCP${via ? ` [${via}]` : ''}.`,
      ip: uip,
      cc: ucc,
    };
  }

  return {
    state: 0,
    actual: `Filtrado — STUN ve IP real (${uip}${ucc ? ` ${ucc.toUpperCase()}` : ''})`,
    detail: `STUN/UDP revela ${uip} (${ucc ? ucc.toUpperCase() : '?'}) distinto de TCP (${egressIp || '?'} ${egressCc ? egressCc.toUpperCase() : '?'}).`,
    ip: uip,
    cc: ucc,
  };
}

function evaluateNodeMetrics(nodeRules, target) {
  const safeNode = nodeRules || {};
  const matchedRules = Array.isArray(safeNode.matchedRules) ? safeNode.matchedRules : [];
  const domainChecks = Array.isArray(safeNode.domainChecks) ? safeNode.domainChecks : [];

  let state = typeof safeNode.state === 'number' ? safeNode.state : -1;
  if (state === -1 && matchedRules.length > 0) state = 1;

  if (state === 1) {
    return {
      state: 1,
      actual: `Regla aplicada (${matchedRules.length} coincidencias)`,
      detail: safeNode.note || `Reglas para ${target.name} detectadas en configuración de proxy.`,
    };
  }
  if (state === 0) {
    return {
      state: 0,
      actual: 'Sin cubrir',
      detail: safeNode.note || `Los dominios de ${target.name} no están cubiertos por reglas o Fake-IP.`,
    };
  }
  return {
    state: -1,
    actual: 'No leído',
    detail:
      safeNode.note ||
      (domainChecks.length > 0
        ? `${domainChecks.length} dominio(s) comprobado(s) sin archivo de reglas local.`
        : 'No se encontró configuración local de proxy/nodo para auditar reglas.'),
  };
}

/**
 * Evaluates system, VPN, and network probes to detect geo-spoofing,
 * leaks (UDP/STUN, IPv6, DNS), datacenter ASNs, and IP flips.
 */
export function evaluateScan({
  system = {},
  vpn = {},
  network = {},
  expectedRegion = '',
  targetId = 'claude',
  fixResult = null,
  ipHistory = [],
} = {}) {
  const timestamp = new Date().toISOString();
  const target = getTargetById(targetId);
  const expIso = normalizeIso(expectedRegion);
  const expectedRegionObj = expIso ? getRegionByIso(expIso) : null;

  const egress = network.egress || {};
  const egressIp = String(egress.ip || '').trim();
  const egressCc = normalizeIso(egress.cc);
  const egressRegionObj = egressCc ? getRegionByIso(egressCc) : null;
  const egressOrg = String(egress.org || egress.as || egress.isp || '').trim();
  const isDc = Boolean(egress.isDatacenter || (egressOrg && isDatacenterOrg(egressOrg)));

  const { previousIp, ipFlipped, ipHistory: nextIpHistory } = updateIpHistory(ipHistory, egressIp);

  // Normalize system signals
  const sysLocale = String(system.locale || system.userCulture || system.systemLocale || '').trim();
  const sysLocaleCountry = normalizeIso(system.localeCountry || extractLocaleCountry(sysLocale));
  const sysTimezone = String(system.timezone || '').trim();
  const sysUtcOffset =
    String(system.utcOffset || '').trim() || formatUtcMinutes(system.utcOffsetMinutes);
  const inferredList = Array.isArray(system.inferredCountries) && system.inferredCountries.length > 0
    ? system.inferredCountries.map(normalizeIso).filter(Boolean)
    : inferCountriesFromTimezone(sysTimezone).map(normalizeIso).filter(Boolean);
  const sysPrimaryCountry = normalizeIso(
    system.primaryInferredCountry || inferredList[0] || sysLocaleCountry,
  );

  // Reference region for system table: explicit expectedRegion first, else egress IP country
  const sysRefRegion = expectedRegionObj || egressRegionObj;

  // 1. System Table
  const localeRow = (() => {
    const actual = sysLocale || 'Desconocido';
    if (!sysRefRegion) {
      return { key: 'locale', label: 'Idioma del sistema', expected: '—', actual, state: -1, detail: 'Sin región de referencia para comparar.' };
    }
    const expected = formatExpectedList(sysRefRegion.locales);
    const matches =
      localeMatch(sysRefRegion.locales, sysLocale) ||
      (sysLocaleCountry && sysLocaleCountry === sysRefRegion.iso);
    const state = matches ? 1 : sysLocaleCountry ? 0 : 2;
    return {
      key: 'locale',
      label: 'Idioma del sistema',
      expected,
      actual,
      state,
      detail: matches
        ? `Coincide con ${sysRefRegion.name}.`
        : `El idioma ${actual} difiere de lo esperado para ${sysRefRegion.name}.`,
    };
  })();

  const timezoneRow = (() => {
    const actual = sysTimezone || 'Desconocido';
    if (!sysRefRegion) {
      return { key: 'timezone', label: 'Zona horaria', expected: '—', actual, state: -1, detail: 'Sin región de referencia para comparar.' };
    }
    const expected = formatExpectedList(sysRefRegion.zones);
    const zoneList = Array.isArray(sysRefRegion.zones)
      ? sysRefRegion.zones
      : String(sysRefRegion.zones || '').split(/[;,/]/).map((s) => s.trim()).filter(Boolean);
    const matches =
      inferredList.includes(sysRefRegion.iso) ||
      (sysTimezone && zoneList.includes(sysTimezone));
    return {
      key: 'timezone',
      label: 'Zona horaria',
      expected,
      actual,
      state: matches ? 1 : 0,
      detail: matches
        ? `La zona horaria pertenece a ${sysRefRegion.name}.`
        : `La zona ${actual} apunta a ${inferredList.map((c) => c.toUpperCase()).join('/') || '?'}, no a ${sysRefRegion.iso.toUpperCase()}.`,
    };
  })();

  const utcOffsetRow = (() => {
    const actual = sysUtcOffset || 'Desconocido';
    if (!sysRefRegion || !sysRefRegion.utc) {
      return { key: 'utcOffset', label: 'Desplazamiento UTC', expected: '—', actual, state: -1, detail: 'Sin rango UTC de referencia.' };
    }
    const expected = sysRefRegion.utc;
    const matches = Boolean(sysUtcOffset && utcMatch(expected, sysUtcOffset));
    return {
      key: 'utcOffset',
      label: 'Desplazamiento UTC',
      expected,
      actual,
      state: matches ? 1 : 0,
      detail: matches
        ? `Desplazamiento compatible con ${sysRefRegion.name}.`
        : `Offset ${actual} incompatible con ${expected} (${sysRefRegion.name}).`,
    };
  })();

  const systemCountryRow = (() => {
    const sysDesc = describeCountry(sysPrimaryCountry);
    const actual = sysDesc.code ? `${sysDesc.flag} ${sysDesc.code.toUpperCase()} (${sysDesc.name})` : 'Desconocido';
    if (!sysRefRegion) {
      return { key: 'systemCountry', label: 'País inferido del sistema', expected: '—', actual, state: -1, detail: 'Sin región de referencia.' };
    }
    const expected = `${flagOf(sysRefRegion.iso)} ${sysRefRegion.iso.toUpperCase()} (${sysRefRegion.name})`;
    const matches = Boolean(
      sysPrimaryCountry === sysRefRegion.iso || inferredList.includes(sysRefRegion.iso),
    );
    return {
      key: 'systemCountry',
      label: 'País inferido del sistema',
      expected,
      actual,
      state: matches ? 1 : 0,
      detail: matches
        ? 'El país inferido del sistema coincide con la referencia.'
        : `El sistema sugiere ubicación física en ${sysPrimaryCountry.toUpperCase() || '?'}, frente a ${sysRefRegion.iso.toUpperCase()}.`,
    };
  })();

  const systemTable = [localeRow, timezoneRow, utcOffsetRow, systemCountryRow];

  // 2. Network Table
  const vpnActive = Boolean(vpn.active);
  const proxyOnlyEnabled = Boolean(!vpnActive && vpn.systemProxy?.enabled);
  const vpnRow = {
    key: 'vpn',
    label: 'VPN',
    expected: 'No establecida (directo)',
    actual: vpnActive
      ? vpn.label || vpn.packageOrService || vpn.transport || 'VPN activa'
      : proxyOnlyEnabled
        ? `Proxy (${vpn.systemProxy.server || vpn.systemProxy.pacUrl || vpn.systemProxy.envProxy})`
        : 'No establecida',
    state: vpnActive || proxyOnlyEnabled ? 2 : 1,
    detail: vpnActive
      ? `Transporte: ${vpn.transport || 'vpn'}${vpn.packageOrService ? ` · Servicio: ${vpn.packageOrService}` : ''}.`
      : 'Sin túnel VPN ni proxy local detectado.',
  };

  const egressDesc = describeCountry(egressCc);
  const egressMatchesExpected = Boolean(expectedRegionObj && egressCc && expectedRegionObj.iso === egressCc);
  const egressRow = {
    key: 'egress',
    label: 'Salida de la IP',
    expected: expectedRegionObj
      ? `${flagOf(expectedRegionObj.iso)} ${expectedRegionObj.iso.toUpperCase()} (${expectedRegionObj.name})`
      : 'Sin región seleccionada',
    actual: egressIp
      ? `${egressIp} · ${egressDesc.code ? `${egressDesc.flag} ${egressDesc.code.toUpperCase()}` : '?'}`
      : 'Sin respuesta',
    state: !egressIp || !egressCc ? -1 : !expectedRegionObj ? -1 : egressMatchesExpected ? 1 : 0,
    detail: !egressIp
      ? egress.error || 'No se pudo obtener la IP de salida.'
      : !expectedRegionObj
        ? 'Sin región esperada seleccionada; no comparado contra país objetivo.'
        : egressMatchesExpected
          ? `Salida IP en ${expectedRegionObj.name}.`
          : `Salida en ${egressCc.toUpperCase()} distinta de ${expectedRegionObj.iso.toUpperCase()}.`,
  };

  const lineRow = {
    key: 'line',
    label: 'Línea',
    expected: 'IP residencial',
    actual: !egressIp || !egressOrg
      ? 'No leído'
      : isDc
        ? `IP de centro de datos (${egressOrg})`
        : `IP residencial (${egressOrg})`,
    state: !egressIp || !egressOrg ? -1 : isDc ? 0 : 1,
    detail: !egressOrg
      ? 'Sin información de organización/ASN.'
      : isDc
        ? 'ASN/organización coincide con proveedor de hosting, nube o datacenter.'
        : 'ASN/organización compatible con ISP residencial/móvil.',
  };

  const dnsMetrics = evaluateDnsMetrics(network.dns, egressCc, vpnActive);
  const dnsRow = {
    key: 'dns',
    label: 'DNS',
    expected: 'No filtrado',
    actual: dnsMetrics.actual,
    state: dnsMetrics.state,
    detail: dnsMetrics.detail,
  };

  const v6Metrics = evaluateIpv6Metrics(network.ipv6, egressCc);
  const ipv6Row = {
    key: 'ipv6',
    label: 'IPv6',
    expected: 'No filtrado',
    actual: v6Metrics.actual,
    state: v6Metrics.state,
    detail: v6Metrics.detail,
  };

  const udpMetrics = evaluateUdpMetrics(network.udp, egressIp, egressCc);
  const udpRow = {
    key: 'udp',
    label: 'UDP',
    expected: 'Misma salida',
    actual: udpMetrics.actual,
    state: udpMetrics.state,
    detail: udpMetrics.detail,
  };

  const nodeMetrics = evaluateNodeMetrics(network.nodeRules || network.node, target);
  const nodeRow = {
    key: 'node',
    label: 'Nodo',
    expected: 'Regla aplicada',
    actual: nodeMetrics.actual,
    state: nodeMetrics.state,
    detail: nodeMetrics.detail,
  };

  const alwaysOnEnabled = Boolean(vpn.alwaysOn?.enabled);
  const alwaysOnRow = {
    key: 'alwaysOn',
    label: 'Always-On VPN',
    expected: 'Activado',
    actual: alwaysOnEnabled ? 'Activado' : 'Apagado (always-on off)',
    state: alwaysOnEnabled ? 1 : 2,
    detail:
      vpn.alwaysOn?.note ||
      'Always-on VPN debe activarse desde la Configuración de VPN del sistema (en desktop no se fuerza vía settings).',
  };

  const networkTable = [
    vpnRow,
    egressRow,
    lineRow,
    dnsRow,
    ipv6Row,
    udpRow,
    nodeRow,
    alwaysOnRow,
  ];

  // 3. Discrepancies
  const discrepancies = [];

  const tzIpMismatch = Boolean(egressCc && inferredList.length > 0 && !inferredList.includes(egressCc));
  if (tzIpMismatch) {
    discrepancies.push({
      code: 'TIMEZONE_IP_MISMATCH',
      severity: 'HIGH',
      title: 'Discordancia entre zona horaria del sistema e IP pública',
      detail: `La zona horaria del sistema (${sysTimezone || '?'}) corresponde a ${inferredList.map((c) => c.toUpperCase()).join('/')}, pero la IP pública (${egressIp || '?'}) declara ${egressCc.toUpperCase()}.`,
      recommendation: 'Verifica si el dispositivo opera tras una VPN/proxy o alinea la zona horaria con la salida real.',
    });
  }

  const utcIpMismatch = Boolean(
    egressRegionObj?.utc && sysUtcOffset && !utcMatch(egressRegionObj.utc, sysUtcOffset),
  );
  if (utcIpMismatch) {
    discrepancies.push({
      code: 'UTC_OFFSET_MISMATCH',
      severity: 'HIGH',
      title: 'Desplazamiento UTC incompatible con el país de la IP',
      detail: `El desplazamiento UTC del sistema (${sysUtcOffset}) no es compatible con ${egressCc.toUpperCase()} (${egressRegionObj.utc}).`,
      recommendation: 'Ajusta la zona horaria del sistema o desconecta el túnel que cambia el país de salida.',
    });
  }

  const localeIpAndTzMismatch = Boolean(
    egressCc &&
      sysLocaleCountry &&
      sysLocaleCountry !== egressCc &&
      !inferredList.includes(sysLocaleCountry),
  );
  if (localeIpAndTzMismatch) {
    discrepancies.push({
      code: 'LOCALE_COUNTRY_MISMATCH',
      severity: 'MEDIUM',
      title: 'Idioma/país del sistema difiere de la IP y zona horaria',
      detail: `El locale del sistema (${sysLocale}) indica país ${sysLocaleCountry.toUpperCase()}, distinto tanto de la IP (${egressCc.toUpperCase()}) como de la zona horaria (${inferredList.map((c) => c.toUpperCase()).join('/') || '?'}).`,
      recommendation: 'Revisa la configuración regional del sistema operativo para evitar huellas inconsistentes.',
    });
  }

  const regionExitMismatch = Boolean(expIso && egressCc && expIso !== egressCc);
  if (regionExitMismatch) {
    discrepancies.push({
      code: 'REGION_EXIT_MISMATCH',
      severity: 'HIGH',
      title: 'La salida IP no coincide con la región esperada',
      detail: `Se esperaba ${expIso.toUpperCase()} y la IP pública (${egressIp || '?'}) salió por ${egressCc.toUpperCase()}.`,
      recommendation:
        'Si la salida IP no coincide con la región, el nodo está en otro país. Cambia el nodo o selecciona el país del nodo.',
    });
  }

  if (vpnActive) {
    discrepancies.push({
      code: 'VPN_ACTIVE_DETECTED',
      severity: 'HIGH',
      title: 'VPN o servicio proxy activo detectado',
      detail: `Se detectó túnel o proxy activo: ${vpn.label || vpn.packageOrService || vpn.transport}.`,
      recommendation:
        'Para auditoría directa sin spoofing, desactiva la VPN; si debes usar túnel, ejecuta la corrección básica y activa Always-On.',
    });
  }

  if (isDc) {
    discrepancies.push({
      code: 'DATACENTER_IP_DETECTED',
      severity: 'HIGH',
      title: 'IP de centro de datos / hosting detectada',
      detail: `La salida (${egressIp || '?'}) pertenece a ${egressOrg || 'un proveedor de datacenter/hosting'}, no a una línea residencial.`,
      recommendation: 'Las plataformas destino marcan ASN de datacenter como riesgo alto; usa conexión residencial.',
    });
  }

  if (udpMetrics.state === 0) {
    discrepancies.push({
      code: 'UDP_STUN_LEAK',
      severity: 'CRITICAL',
      title: 'Fuga UDP / STUN (WebRTC) detectada',
      detail: `TCP sale por ${egressIp || '?'} (${egressCc ? egressCc.toUpperCase() : '?'}), mientras STUN/UDP responde desde ${udpMetrics.ip} (${udpMetrics.cc ? udpMetrics.cc.toUpperCase() : '?'}).`,
      recommendation: 'Bloquea UDP saliente fuera del túnel o habilita retransmisión UDP en tu cliente VPN.',
    });
  }

  if (v6Metrics.state === 0) {
    discrepancies.push({
      code: 'IPV6_LEAK',
      severity: 'CRITICAL',
      title: 'Fuga de IPv6 externa detectada',
      detail: v6Metrics.detail,
      recommendation: 'Desactiva IPv6 en los adaptadores físicos o usa la corrección básica con permisos de Administrador.',
    });
  }

  if (dnsMetrics.state === 0) {
    discrepancies.push({
      code: 'DNS_LEAK_OR_UNCOVERED',
      severity: 'HIGH',
      title: 'Fuga DNS o dominios sin cobertura Fake-IP',
      detail: dnsMetrics.detail,
      recommendation: 'Configura DNS remoto / Fake-IP para todos los dominios extranjeros sin resolución local directa.',
    });
  }

  if (ipFlipped) {
    discrepancies.push({
      code: 'IP_FLIP_DETECTED',
      severity: 'MEDIUM',
      title: 'Cambio de IP pública detectado (IP Flip)',
      detail: `La IP de salida cambió de ${previousIp} a ${egressIp} respecto al escaneo anterior.`,
      recommendation: 'Evita nodos con balanceo dinámico de IP durante sesiones sensibles.',
    });
  }

  // 4. Location Verdict
  let leakedRealCountry = '';
  if (udpMetrics.state === 0 && udpMetrics.cc) {
    leakedRealCountry = udpMetrics.cc;
  } else if (v6Metrics.state === 0 && v6Metrics.v6Cc) {
    leakedRealCountry = v6Metrics.v6Cc;
  } else if (dnsMetrics.state === 0 && dnsMetrics.resolverCc && dnsMetrics.resolverCc !== egressCc) {
    leakedRealCountry = dnsMetrics.resolverCc;
  }

  let estimatedActualCountry = egressCc || sysPrimaryCountry || '';
  if (leakedRealCountry) {
    estimatedActualCountry = leakedRealCountry;
  } else if ((vpnActive || isDc || (tzIpMismatch && utcIpMismatch) || tzIpMismatch) && sysPrimaryCountry) {
    estimatedActualCountry = sysPrimaryCountry;
  }

  const declaredDesc = describeCountry(egressCc);
  const sysDesc = describeCountry(sysPrimaryCountry);
  const leakedDesc = describeCountry(leakedRealCountry);
  const estimatedDesc = describeCountry(estimatedActualCountry);

  const consistent = Boolean(
    !leakedRealCountry &&
      !vpnActive &&
      !isDc &&
      !tzIpMismatch &&
      !utcIpMismatch &&
      !regionExitMismatch &&
      dnsMetrics.state !== 0 &&
      v6Metrics.state !== 0 &&
      udpMetrics.state !== 0,
  );

  let summary;
  if (consistent) {
    summary = declaredDesc.code
      ? `Ubicación consistente: el sistema y la IP residencial coinciden en ${declaredDesc.flag} ${declaredDesc.name} (${declaredDesc.code.toUpperCase()}).`
      : 'No se detectaron discordancias de ubicación, aunque la IP pública no pudo verificarse.';
  } else if (leakedDesc.code) {
    summary = `Fuga activa detectada: la IP aparenta ${declaredDesc.flag} ${declaredDesc.code.toUpperCase() || '?'}, pero la fuga revela ubicación real en ${leakedDesc.flag} ${leakedDesc.name} (${leakedDesc.code.toUpperCase()}).`;
  } else {
    summary = `Posible evasión geográfica: la IP aparenta ${declaredDesc.flag} ${declaredDesc.name || declaredDesc.code.toUpperCase() || '?'}, mientras el sistema apunta a ubicación real probable en ${estimatedDesc.flag} ${estimatedDesc.name || estimatedDesc.code.toUpperCase() || '?'}.`;
  }

  const locationVerdict = {
    declaredIpCountry: declaredDesc.code,
    declaredIpCountryName: declaredDesc.name,
    declaredIpFlag: declaredDesc.flag,
    systemInferredCountry: sysDesc.code,
    systemInferredCountryName: sysDesc.name,
    systemInferredFlag: sysDesc.flag,
    leakedRealCountry: leakedDesc.code,
    leakedRealCountryName: leakedDesc.name,
    leakedRealFlag: leakedDesc.flag,
    estimatedActualCountry: estimatedDesc.code,
    estimatedActualCountryName: estimatedDesc.name,
    estimatedActualFlag: estimatedDesc.flag,
    summary,
    consistent,
  };

  // 5. Risk Score & Spoofing Verdict
  let riskScore = 0;
  if (udpMetrics.state === 0) riskScore += 35;
  if (v6Metrics.state === 0) riskScore += 30;
  if (dnsMetrics.state === 0) riskScore += 20;
  if (tzIpMismatch) riskScore += 20;
  if (utcIpMismatch) riskScore += 15;
  if (localeIpAndTzMismatch) riskScore += 10;
  if (regionExitMismatch) riskScore += 15;
  if (vpnActive) riskScore += 20;
  if (isDc) riskScore += 20;
  if (ipFlipped) riskScore += 10;
  riskScore = Math.min(100, Math.max(0, riskScore));

  const riskLevel =
    riskScore >= 70 ? 'CRITICAL' : riskScore >= 40 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW';

  const isLocationSpoofed = Boolean(
    leakedRealCountry ||
      vpnActive ||
      isDc ||
      tzIpMismatch ||
      utcIpMismatch ||
      (declaredDesc.code && estimatedDesc.code && declaredDesc.code !== estimatedDesc.code),
  );

  return {
    timestamp,
    expectedRegion: expIso,
    target,
    system,
    vpn,
    network,
    fixResult,
    ipHistory: nextIpHistory,
    ipFlipped,
    previousIp: previousIp || '',
    systemTable,
    networkTable,
    discrepancies,
    locationVerdict,
    riskScore,
    riskLevel,
    isLocationSpoofed,
    notes: [...OPERATIONAL_NOTES],
  };
}
