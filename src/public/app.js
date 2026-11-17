(() => {
  'use strict';

  const QUICK_CHIP_ISOS = ['es', 'us', 'mx', 'ar', 'co', 've', 'jp', 'gb', 'de', 'fr', 'br', 'sg'];

  const FALLBACK_QUICK_REGIONS = {
    es: { iso: 'es', name: 'España', flag: '🇪🇸' },
    us: { iso: 'us', name: 'Estados Unidos', flag: '🇺🇸' },
    mx: { iso: 'mx', name: 'México', flag: '🇲🇽' },
    ar: { iso: 'ar', name: 'Argentina', flag: '🇦🇷' },
    co: { iso: 'co', name: 'Colombia', flag: '🇨🇴' },
    ve: { iso: 've', name: 'Venezuela', flag: '🇻🇪' },
    jp: { iso: 'jp', name: 'Japón', flag: '🇯🇵' },
    gb: { iso: 'gb', name: 'Reino Unido', flag: '🇬🇧' },
    de: { iso: 'de', name: 'Alemania', flag: '🇩🇪' },
    fr: { iso: 'fr', name: 'Francia', flag: '🇫🇷' },
    br: { iso: 'br', name: 'Brasil', flag: '🇧🇷' },
    sg: { iso: 'sg', name: 'Singapur', flag: '🇸🇬' },
  };

  const SEARCH_ALIASES = {
    uk: 'gb',
    england: 'gb',
    inglaterra: 'gb',
    usa: 'us',
    eeuu: 'us',
    uae: 'ae',
    korea: 'kr',
    corea: 'kr',
    holland: 'nl',
    holanda: 'nl',
    espana: 'es',
    spain: 'es',
    alemania: 'de',
    germany: 'de',
    francia: 'fr',
    france: 'fr',
    japon: 'jp',
    japan: 'jp',
    brasil: 'br',
    brazil: 'br',
    mexico: 'mx',
    singapur: 'sg',
    singapore: 'sg',
  };

  const DEFAULT_NOTES = [
    'Si hay una VPN en funcionamiento, realiza correcciones básicas (desactivar IPv6 y borrar el proxy del sistema) y lee el resultado de vuelta.',
    'Always-on VPN debe activarse desde la Configuración de VPN del sistema (en desktop no se fuerza vía settings).',
    'Si la salida IP no coincide con la región, el nodo está en otro país. Cambia el nodo o selecciona el país del nodo.',
    'Si la línea no es residencial (IP de centro de datos/hosting), cambia el nodo.',
    'DNS unread significa que una consulta falló; no es una filtración.',
  ];

  const state = {
    regions: [],
    targets: [],
    selectedRegion: '',
    selectedTargetId: 'claude',
    customDomains: '',
    privacyMasked: false,
    busy: false,
    assessment: null,
    osSwitcher: null,
    lastSwitcherResult: null,
    notes: DEFAULT_NOTES,
  };

  const OS_ALIGN_PRESETS = {
    'auto-ip': { mode: 'auto-ip' },
    'us-ny': { mode: 'manual', region: 'us', timezone: 'America/New_York', locale: 'en-US' },
    'us-chi': { mode: 'manual', region: 'us', timezone: 'America/Chicago', locale: 'en-US' },
    'us-den': { mode: 'manual', region: 'us', timezone: 'America/Denver', locale: 'en-US' },
    'us-la': { mode: 'manual', region: 'us', timezone: 'America/Los_Angeles', locale: 'en-US' },
  };

  const els = {
    channelBadge: document.getElementById('channelBadge'),
    targetSelect: document.getElementById('targetSelect'),
    customDomainsWrap: document.getElementById('customDomainsWrap'),
    customDomainsInput: document.getElementById('customDomainsInput'),
    privacyBtn: document.getElementById('privacyBtn'),
    privacyLabel: document.getElementById('privacyLabel'),
    statusBar: document.getElementById('statusBar'),

    scanTimestamp: document.getElementById('scanTimestamp'),
    riskBadge: document.getElementById('riskBadge'),
    riskFill: document.getElementById('riskFill'),
    verdictBanner: document.getElementById('verdictBanner'),
    verdictIcon: document.getElementById('verdictIcon'),
    verdictTitle: document.getElementById('verdictTitle'),
    verdictSummary: document.getElementById('verdictSummary'),
    colEstimated: document.getElementById('colEstimated'),
    colDeclaredIp: document.getElementById('colDeclaredIp'),
    colSystemOs: document.getElementById('colSystemOs'),
    colLeakedReal: document.getElementById('colLeakedReal'),
    discrepancyCount: document.getElementById('discrepancyCount'),
    discrepanciesList: document.getElementById('discrepanciesList'),

    selectedRegionLabel: document.getElementById('selectedRegionLabel'),
    regionSearchInput: document.getElementById('regionSearchInput'),
    clearRegionBtn: document.getElementById('clearRegionBtn'),
    regionSearchResults: document.getElementById('regionSearchResults'),
    regionChips: document.getElementById('regionChips'),

    systemHostMeta: document.getElementById('systemHostMeta'),
    systemSummaryBadge: document.getElementById('systemSummaryBadge'),
    systemTableBody: document.getElementById('systemTableBody'),
    osAlignSelect: document.getElementById('osAlignSelect'),
    alignOsBtn: document.getElementById('alignOsBtn'),
    revertOsBtn: document.getElementById('revertOsBtn'),
    osSwitcherLine: document.getElementById('osSwitcherLine'),

    targetMeta: document.getElementById('targetMeta'),
    networkSummaryBadge: document.getElementById('networkSummaryBadge'),
    networkTableBody: document.getElementById('networkTableBody'),
    scanBtn: document.getElementById('scanBtn'),
    autoFixCheckbox: document.getElementById('autoFixCheckbox'),
    vpnStatusReadonly: document.getElementById('vpnStatusReadonly'),
    fixBtn: document.getElementById('fixBtn'),
    openVpnSettingsBtn: document.getElementById('openVpnSettingsBtn'),
    fixLine: document.getElementById('fixLine'),

    diagIpFlip: document.getElementById('diagIpFlip'),
    diagStun: document.getElementById('diagStun'),
    diagDns: document.getElementById('diagDns'),
    diagNode: document.getElementById('diagNode'),
    diagIpv6: document.getElementById('diagIpv6'),

    notesList: document.getElementById('notesList'),
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function isoToFlag(iso) {
    const code = String(iso || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return '🏳️';
    return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  }

  function findRegion(iso) {
    const target = String(iso || '').trim().toLowerCase();
    if (!target) return null;
    const found = state.regions.find((r) => String(r.iso || '').toLowerCase() === target);
    if (found) {
      return { ...found, flag: found.flag || isoToFlag(found.iso) };
    }
    return FALLBACK_QUICK_REGIONS[target] || { iso: target, name: target.toUpperCase(), flag: isoToFlag(target) };
  }

  function maskIpv4(ip) {
    const parts = String(ip).split('.');
    if (parts.length !== 4) return '•••.•••.•••.•••';
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }

  function maskIpv6(ip) {
    const s = String(ip);
    const segments = s.split(':');
    if (segments.length < 3) return '••••:••••::••••';
    return `${segments[0] || '••'}:${segments[1] || '••'}:••••::••••`;
  }

  function maskSensitiveText(raw) {
    const str = String(raw ?? '');
    if (!state.privacyMasked || !str) return str;

    let masked = str;
    // Mask IPv4
    masked = masked.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (m) => maskIpv4(m));
    // Mask IPv6 (with at least two colons)
    masked = masked.replace(/\b(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}\b/g, (m) => {
      if (!/[0-9a-fA-F]/.test(m) || m.length < 5) return m;
      return maskIpv6(m);
    });
    // Mask ASN numbers like AS16509
    masked = masked.replace(/\bAS\d{2,7}\b/gi, 'AS•••••');

    const a = state.assessment;
    if (a) {
      const secrets = [
        a.system?.hostname,
        a.network?.egress?.org,
        a.network?.egress?.isp,
        a.network?.egress?.as,
        a.vpn?.systemProxy?.server,
      ].filter((v) => typeof v === 'string' && v.trim().length >= 3);

      for (const secret of secrets) {
        const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        masked = masked.replace(new RegExp(escaped, 'gi'), '••••••••');
      }
    }

    return masked;
  }

  function setStatus(message, type = 'info') {
    if (!message) {
      els.statusBar.className = 'status-bar hidden';
      els.statusBar.textContent = '';
      return;
    }
    els.statusBar.textContent = message;
    els.statusBar.className = `status-bar ${type}`;
  }

  function setBusy(isBusy, labelText = 'scan') {
    state.busy = isBusy;
    els.scanBtn.disabled = isBusy;
    els.fixBtn.disabled = isBusy;
    els.openVpnSettingsBtn.disabled = isBusy;
    if (els.alignOsBtn) els.alignOsBtn.disabled = isBusy;
    if (els.osAlignSelect) els.osAlignSelect.disabled = isBusy;
    if (els.revertOsBtn) {
      els.revertOsBtn.disabled = isBusy || !state.osSwitcher?.hasBackup;
    }
    els.scanBtn.textContent = isBusy ? labelText : 'scan';
  }

  function getStatePresentation(code) {
    switch (Number(code)) {
      case 1:
        return { symbol: '✓', text: 'OK', cls: 'state-ok' };
      case 0:
        return { symbol: '✗', text: 'FALLO', cls: 'state-fail' };
      case 2:
        return { symbol: '⚠', text: 'AVISO', cls: 'state-warn' };
      default:
        return { symbol: '—', text: 'N/D', cls: 'state-unread' };
    }
  }

  function summarizeTableStates(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { text: '—', cls: 'badge-neutral' };
    }
    const fails = rows.filter((r) => Number(r.state) === 0).length;
    const warns = rows.filter((r) => Number(r.state) === 2).length;
    const oks = rows.filter((r) => Number(r.state) === 1).length;
    if (fails > 0) return { text: `${fails} ✗ · ${oks} ✓`, cls: 'badge-fail' };
    if (warns > 0) return { text: `${warns} ⚠ · ${oks} ✓`, cls: 'badge-warn' };
    if (oks > 0) return { text: `${oks}/${rows.length} ✓`, cls: 'badge-ok' };
    return { text: 'Sin comparar', cls: 'badge-neutral' };
  }

  function renderNotes() {
    const notes = Array.isArray(state.notes) && state.notes.length ? state.notes : DEFAULT_NOTES;
    els.notesList.innerHTML = notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
  }

  function renderTargets() {
    const targets = state.targets.length
      ? state.targets
      : [
          { id: 'claude', name: 'Claude', sampleDomains: ['claude.ai', 'api.anthropic.com'] },
          { id: 'chatgpt', name: 'ChatGPT', sampleDomains: ['chatgpt.com', 'api.openai.com'] },
          { id: 'custom', name: 'Proyecto Propio', sampleDomains: ['api.ipify.org', 'cloudflare.com'] },
        ];

    els.targetSelect.innerHTML = targets
      .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`)
      .join('');
    els.targetSelect.value = state.selectedTargetId;

    const current = targets.find((t) => t.id === state.selectedTargetId) || targets[0];
    const isCustom = current && current.id === 'custom';
    els.customDomainsWrap.classList.toggle('hidden', !isCustom);
    if (isCustom && !els.customDomainsInput.value && state.customDomains) {
      els.customDomainsInput.value = state.customDomains;
    }

    const domainInfo = isCustom && state.customDomains
      ? state.customDomains
      : (current?.sampleDomains || []).join(', ');
    els.targetMeta.textContent = domainInfo
      ? `Objetivo: ${current?.name || state.selectedTargetId} (${domainInfo})`
      : `Objetivo: ${current?.name || state.selectedTargetId}`;
  }

  function renderRegionSelector() {
    const selected = findRegion(state.selectedRegion);
    if (selected) {
      const utcPart = selected.utc ? ` · ${selected.utc}` : '';
      els.selectedRegionLabel.textContent = `${selected.flag} ${selected.name} (${selected.iso.toUpperCase()})${utcPart}`;
    } else {
      els.selectedRegionLabel.textContent = 'Sin región fija (auditoría por coherencia interna)';
    }

    els.regionChips.innerHTML = QUICK_CHIP_ISOS.map((iso) => {
      const reg = findRegion(iso);
      const isActive = state.selectedRegion.toLowerCase() === iso;
      return `<button type="button" class="region-chip${isActive ? ' active' : ''}" data-iso="${escapeHtml(iso)}">${escapeHtml(reg.flag)} <span class="mono">${escapeHtml(iso.toUpperCase())}</span></button>`;
    }).join('');
  }

  function renderRegionSearchDropdown(query) {
    const q = normalizeText(query);
    if (!q) {
      els.regionSearchResults.classList.add('hidden');
      els.regionSearchResults.innerHTML = '';
      return;
    }

    const aliasIso = SEARCH_ALIASES[q] || '';
    const sourceList = state.regions.length ? state.regions : Object.values(FALLBACK_QUICK_REGIONS);

    const matches = sourceList
      .filter((r) => {
        const iso = normalizeText(r.iso);
        const name = normalizeText(r.name);
        const note = normalizeText(r.note || '');
        return (
          iso === q ||
          (aliasIso && iso === aliasIso) ||
          iso.includes(q) ||
          name.includes(q) ||
          note.includes(q)
        );
      })
      .slice(0, 12);

    if (!matches.length) {
      els.regionSearchResults.innerHTML = '<div class="region-option"><span class="meta-text">Sin coincidencias</span></div>';
      els.regionSearchResults.classList.remove('hidden');
      return;
    }

    els.regionSearchResults.innerHTML = matches
      .map((r) => {
        const flag = r.flag || isoToFlag(r.iso);
        const utc = r.utc ? `<span class="meta-text mono">${escapeHtml(r.utc)}</span>` : '';
        return `<button type="button" class="region-option" data-iso="${escapeHtml(String(r.iso).toLowerCase())}">
          <span>${escapeHtml(flag)} ${escapeHtml(r.name)} <span class="meta-text mono">(${escapeHtml(String(r.iso).toUpperCase())})</span></span>
          ${utc}
        </button>`;
      })
      .join('');
    els.regionSearchResults.classList.remove('hidden');
  }

  function renderVerdictColumn(container, { flag, name, iso, sub, colStateClass = '' }) {
    const colBox = container.closest('.verdict-col');
    if (colBox) {
      colBox.classList.remove('col-alert', 'col-ok');
      if (colStateClass) colBox.classList.add(colStateClass);
    }

    const safeIso = iso ? String(iso).toUpperCase() : '—';
    const subHtml = sub ? `<div class="meta-text mono">${escapeHtml(maskSensitiveText(sub))}</div>` : '';
    container.innerHTML = `
      <span class="flag-lg" aria-hidden="true">${escapeHtml(flag || '—')}</span>
      <div>
        <div class="country-name">${escapeHtml(name || 'Desconocido')}</div>
        <div class="country-iso mono">${escapeHtml(safeIso)}</div>
        ${subHtml}
      </div>
    `;
  }

  function renderTable(tbody, rows, emptyMessage) {
    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-row">${escapeHtml(emptyMessage)}</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map((row) => {
        const st = getStatePresentation(row.state);
        const expected = maskSensitiveText(row.expected ?? '—');
        const actual = maskSensitiveText(row.actual ?? '—');
        const detail = row.detail ? `<div class="cell-actual-detail">${escapeHtml(maskSensitiveText(row.detail))}</div>` : '';
        return `
          <tr>
            <td class="cell-field">${escapeHtml(row.label || row.key || '—')}</td>
            <td class="cell-expected">${escapeHtml(expected || '—')}</td>
            <td>
              <div class="cell-actual-main">${escapeHtml(actual || '—')}</div>
              ${detail}
            </td>
            <td class="cell-state">
              <span class="state-pill ${st.cls}" title="${escapeHtml(st.text)}">${st.symbol} ${st.text}</span>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function renderDiscrepancies(discrepancies) {
    const list = Array.isArray(discrepancies) ? discrepancies : [];
    els.discrepancyCount.textContent = String(list.length);
    els.discrepancyCount.className = list.length > 0 ? 'badge badge-fail mono' : 'badge badge-ok mono';

    if (!list.length) {
      els.discrepanciesList.innerHTML =
        '<div class="empty-state">No se detectaron discordancias ni vectores de evasión en este escaneo.</div>';
      return;
    }

    els.discrepanciesList.innerHTML = list
      .map((d) => {
        const sev = String(d.severity || 'MEDIUM').toUpperCase();
        const sevClass =
          sev === 'CRITICAL'
            ? 'sev-critical'
            : sev === 'HIGH'
              ? 'sev-high'
              : sev === 'LOW'
                ? 'sev-low'
                : 'sev-medium';
        const badgeClass =
          sev === 'CRITICAL' || sev === 'HIGH'
            ? 'badge-fail'
            : sev === 'LOW'
              ? 'badge-cyan'
              : 'badge-warn';

        const detail = maskSensitiveText(d.detail || '');
        const rec = maskSensitiveText(d.recommendation || '');

        return `
          <article class="discrepancy-item ${sevClass}">
            <div class="disc-top">
              <span class="disc-title">${escapeHtml(d.title || d.code || 'Discordancia')}</span>
              <div>
                <span class="disc-code mono">${escapeHtml(d.code || '')}</span>
                <span class="badge ${badgeClass} mono">${escapeHtml(sev)}</span>
              </div>
            </div>
            ${detail ? `<div class="disc-detail">${escapeHtml(detail)}</div>` : ''}
            ${rec ? `<div class="disc-rec">Recomendación: ${escapeHtml(rec)}</div>` : ''}
          </article>
        `;
      })
      .join('');
  }

  function renderDiagnostics(a) {
    const egress = a.network?.egress || {};
    const udp = a.network?.udp || {};
    const dns = a.network?.dns || {};
    const ipv6 = a.network?.ipv6 || {};
    const node = a.network?.nodeRules || a.network?.node || {};

    // IP flip & history
    const hist = Array.isArray(a.ipHistory) ? a.ipHistory : [];
    const maskedHist = hist.map((ip) => maskSensitiveText(ip));
    if (a.ipFlipped && a.previousIp) {
      els.diagIpFlip.textContent = `CAMBIO DETECTADO (${maskSensitiveText(a.previousIp)} → ${maskSensitiveText(egress.ip || '?')}) · Historial: [${maskedHist.join(', ')}]`;
      els.diagIpFlip.style.color = 'var(--amber)';
    } else if (maskedHist.length) {
      els.diagIpFlip.textContent = `Sin cambio · Historial reciente: ${maskedHist.join(', ')}`;
      els.diagIpFlip.style.color = '';
    } else {
      els.diagIpFlip.textContent = 'Sin historial de IP todavía';
      els.diagIpFlip.style.color = '';
    }

    // STUN / UDP
    const udpIp = udp.ip ? maskSensitiveText(udp.ip) : '—';
    const udpCc = udp.cc ? String(udp.cc).toUpperCase() : '—';
    const udpVia = udp.via || udp.source || 'stun';
    const udpServer = udp.server ? ` (${udp.server})` : '';
    const udpExtra = udp.error ? ` · ${udp.error}` : '';
    els.diagStun.textContent = `IP: ${udpIp} (${udpCc}) · vía ${udpVia}${udpServer}${udpExtra}`;

    // DNS
    const resolverIp = dns.resolverIp ? maskSensitiveText(dns.resolverIp) : '—';
    const resolverCc = dns.resolverCc ? String(dns.resolverCc).toUpperCase() : '—';
    const fakeVal = dns.fakeCount ?? dns.fakeIpCount;
    const realVal = dns.realCount ?? dns.realIpCount;
    const dnsCounts = [
      fakeVal != null ? `fake-ip:${fakeVal}` : null,
      realVal != null ? `real:${realVal}` : null,
      dns.failedCount != null ? `fallos:${dns.failedCount}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    els.diagDns.textContent = `Resolver: ${resolverIp} (${resolverCc})${dnsCounts ? ` · ${dnsCounts}` : ''}`;

    // Node rules
    const matchedRules = Array.isArray(node.matchedRules) ? node.matchedRules : [];
    const domainChecks = Array.isArray(node.domainChecks) ? node.domainChecks : [];
    const ruleSummary = matchedRules.length
      ? `${matchedRules.length} regla(s): ${matchedRules.slice(0, 3).map((r) => maskSensitiveText(r)).join(' | ')}`
      : node.note || 'Sin reglas locales detectadas';
    const checkSummary = domainChecks.length
      ? ` · Dominios (${domainChecks.length}): ${domainChecks
          .slice(0, 3)
          .map((d) => `${d.domain || d.host}→${maskSensitiveText((d.ips && d.ips[0]) || d.ip || (d.error ? 'err' : 'ok'))}`)
          .join(', ')}`
      : '';
    els.diagNode.textContent = `${ruleSummary}${checkSummary}`;

    // IPv6 local global addresses
    const rawLocalV6 = Array.isArray(ipv6.localAddrs)
      ? ipv6.localAddrs
      : Array.isArray(ipv6.localGlobal)
        ? ipv6.localGlobal
        : Array.isArray(ipv6.localAddresses)
          ? ipv6.localAddresses
          : [];
    const formattedLocalV6 = rawLocalV6.map((item) => {
      if (item && typeof item === 'object') {
        const addr = maskSensitiveText(item.address || item.ip || '');
        return item.iface ? `${item.iface}: ${addr}` : addr;
      }
      return maskSensitiveText(item);
    });
    const extV6 = ipv6.externalIp ? maskSensitiveText(ipv6.externalIp) : 'none';
    const v6Cc = ipv6.externalCc || ipv6.cc || '';
    const extV6Cc = v6Cc ? ` (${String(v6Cc).toUpperCase()})` : '';
    const localV6Text = formattedLocalV6.length ? formattedLocalV6.join(', ') : 'ninguna';
    els.diagIpv6.textContent = `Externa: ${extV6}${extV6Cc} · Locales globales (${formattedLocalV6.length}): ${localV6Text}`;
  }

  function renderAssessment() {
    const a = state.assessment;
    if (!a) {
      renderTable(els.systemTableBody, [], 'Ejecuta un escaneo para inspeccionar idioma, zona horaria y UTC del sistema.');
      renderTable(els.networkTableBody, [], 'Ejecuta un escaneo para comprobar VPN, salida IP, línea, DNS, IPv6, UDP y nodo.');
      return;
    }

    // Channel badge (Admin vs Read-only)
    if (a.vpn?.isAdmin) {
      els.channelBadge.textContent = 'Admin / Privilegiado';
      els.channelBadge.className = 'badge badge-ok';
    } else {
      els.channelBadge.textContent = 'Usuario / Solo lectura';
      els.channelBadge.className = 'badge badge-warn';
    }

    // Timestamp & host meta
    if (a.timestamp) {
      const dt = new Date(a.timestamp);
      const formatted = Number.isNaN(dt.getTime()) ? a.timestamp : dt.toLocaleString('es-ES');
      els.scanTimestamp.textContent = `Último escaneo: ${formatted}`;
    }
    const sys = a.system || {};
    const host = maskSensitiveText(sys.hostname || '—');
    els.systemHostMeta.textContent = `Host: ${host} · ${sys.platform || 'os'}/${sys.arch || 'arch'}`;

    // Risk meter
    const score = Math.max(0, Math.min(100, Number(a.riskScore ?? 0)));
    const level = String(a.riskLevel || 'LOW').toUpperCase();
    els.riskFill.style.width = `${score}%`;
    els.riskFill.className = 'risk-fill ' + (
      level === 'CRITICAL' ? 'risk-critical'
      : level === 'HIGH' ? 'risk-high'
      : level === 'MEDIUM' ? 'risk-medium'
      : 'risk-low'
    );
    els.riskBadge.textContent = `${score}% · ${level}`;
    els.riskBadge.className = 'badge mono ' + (
      level === 'CRITICAL' || level === 'HIGH' ? 'badge-fail'
      : level === 'MEDIUM' ? 'badge-warn'
      : 'badge-ok'
    );

    // Location Verdict Banner
    const lv = a.locationVerdict || {};
    const isConsistent = Boolean(lv.consistent) && !a.isLocationSpoofed;
    if (a.isLocationSpoofed || !lv.consistent) {
      els.verdictBanner.className = `verdict-banner ${a.isLocationSpoofed ? 'verdict-spoofed' : 'verdict-warn'}`;
      els.verdictIcon.textContent = a.isLocationSpoofed ? '✗' : '⚠';
      els.verdictTitle.textContent = 'DISCORDANCIA DETECTADA — POSIBLE EVASIÓN GEOGRÁFICA';
    } else {
      els.verdictBanner.className = 'verdict-banner verdict-ok';
      els.verdictIcon.textContent = '✓';
      els.verdictTitle.textContent = 'UBICACIÓN CONSISTENTE';
    }
    els.verdictSummary.textContent = maskSensitiveText(lv.summary || (isConsistent ? 'Todos los parámetros de red y sistema coinciden.' : 'Se detectaron inconsistencias entre el sistema y la salida de red.'));

    // 4 Verdict Columns
    const egress = a.network?.egress || {};
    const egressSub = [egress.ip, egress.org].filter(Boolean).join(' · ');
    renderVerdictColumn(els.colEstimated, {
      flag: lv.estimatedActualFlag || isoToFlag(lv.estimatedActualCountry),
      name: lv.estimatedActualCountryName || lv.estimatedActualCountry || 'Indeterminado',
      iso: lv.estimatedActualCountry || '—',
      colStateClass: a.isLocationSpoofed ? 'col-alert' : 'col-ok',
    });
    renderVerdictColumn(els.colDeclaredIp, {
      flag: lv.declaredIpFlag || isoToFlag(lv.declaredIpCountry),
      name: lv.declaredIpCountryName || lv.declaredIpCountry || 'Desconocido',
      iso: lv.declaredIpCountry || '—',
      sub: egressSub,
      colStateClass: !isConsistent && lv.declaredIpCountry !== lv.estimatedActualCountry ? 'col-alert' : '',
    });
    renderVerdictColumn(els.colSystemOs, {
      flag: lv.systemInferredFlag || isoToFlag(lv.systemInferredCountry),
      name: lv.systemInferredCountryName || lv.systemInferredCountry || 'Indeterminado',
      iso: lv.systemInferredCountry || '—',
      sub: [sys.timezone, sys.utcOffset].filter(Boolean).join(' · '),
    });
    renderVerdictColumn(els.colLeakedReal, {
      flag: lv.leakedRealCountry ? (lv.leakedRealFlag || isoToFlag(lv.leakedRealCountry)) : '✓',
      name: lv.leakedRealCountryName || (lv.leakedRealCountry ? lv.leakedRealCountry.toUpperCase() : 'Sin fuga directa'),
      iso: lv.leakedRealCountry || 'NONE',
      colStateClass: lv.leakedRealCountry ? 'col-alert' : 'col-ok',
    });

    // Discrepancies
    renderDiscrepancies(a.discrepancies);

    // Tables
    renderTable(els.systemTableBody, a.systemTable, 'Sin datos de sistema.');
    const sysBadge = summarizeTableStates(a.systemTable);
    els.systemSummaryBadge.textContent = sysBadge.text;
    els.systemSummaryBadge.className = `badge mono ${sysBadge.cls}`;

    renderTable(els.networkTableBody, a.networkTable, 'Sin datos de red.');
    const netBadge = summarizeTableStates(a.networkTable);
    els.networkSummaryBadge.textContent = netBadge.text;
    els.networkSummaryBadge.className = `badge mono ${netBadge.cls}`;

    // VPN readonly input
    if (a.vpn?.active) {
      els.vpnStatusReadonly.value = a.vpn.packageOrService || a.vpn.label || 'VPN activa';
      els.vpnStatusReadonly.classList.add('vpn-active');
    } else {
      els.vpnStatusReadonly.value = 'VPN no establecida';
      els.vpnStatusReadonly.classList.remove('vpn-active');
    }

    // fixLine
    if (a.fixResult && a.fixResult.message) {
      els.fixLine.textContent = `Auto-fix: ${maskSensitiveText(a.fixResult.message)}`;
      els.fixLine.classList.remove('hidden', 'fix-warn');
      if (a.fixResult.attempted && !a.fixResult.v6DisabledOk && !a.fixResult.proxyClearedOk) {
        els.fixLine.classList.add('fix-warn');
      }
    } else {
      els.fixLine.classList.add('hidden');
      els.fixLine.textContent = '';
    }

    // Diagnostics & notes
    renderDiagnostics(a);
    if (Array.isArray(a.notes) && a.notes.length) {
      state.notes = a.notes;
      renderNotes();
    }
  }

  function renderOsSwitcher() {
    if (!els.osSwitcherLine || !els.revertOsBtn) return;

    const status = state.osSwitcher;
    const hasBackup = Boolean(status?.hasBackup);
    els.revertOsBtn.disabled = state.busy || !hasBackup;

    const parts = [];
    if (hasBackup) {
      const b = status.backup || {};
      const origSummary = [
        b.timezone,
        b.locale,
        b.geoId != null ? `GeoId:${b.geoId}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const alignedText = status.isAlignedToBackup
        ? 'OS en estado original'
        : 'OS modificado respecto al backup';
      parts.push(`Backup original${origSummary ? ` (${origSummary})` : ''} · ${alignedText}`);
    } else {
      parts.push('Sin backup guardado (se creará automáticamente al alinear)');
    }

    const res = state.lastSwitcherResult;
    let lineClass = 'os-switcher-line mono';
    if (res) {
      if (res.ok) {
        const msg = res.message || `${res.action || 'Operación'} completada.`;
        parts.push(maskSensitiveText(msg));
        lineClass += ' switcher-ok';
      } else {
        const errMsg = res.error || res.message || 'Error en operación OS Switcher.';
        parts.push(maskSensitiveText(errMsg));
        lineClass += ' switcher-error';
      }
    } else if (hasBackup && !status.isAlignedToBackup) {
      lineClass += ' switcher-warn';
    }

    els.osSwitcherLine.textContent = parts.join(' | ');
    els.osSwitcherLine.className = lineClass;
  }

  async function apiJson(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || `HTTP ${res.status}`);
    }
    return data;
  }

  function buildPayload() {
    return {
      expectedRegion: state.selectedRegion,
      targetId: state.selectedTargetId,
      customDomains: state.customDomains,
      autoFixOnVpn: els.autoFixCheckbox.checked,
    };
  }

  async function runScan() {
    if (state.busy) return;
    setBusy(true, 'escaneando...');
    setStatus('Ejecutando auditoría anti-spoofing (Sistema, VPN, Egress, DNS, IPv6, STUN/UDP)...', 'info');
    try {
      const assessment = await apiJson('/api/scan', {
        method: 'POST',
        body: JSON.stringify(buildPayload()),
      });
      state.assessment = assessment;
      renderAssessment();
      setStatus(
        assessment.isLocationSpoofed
          ? 'Escaneo completado: se detectaron discordancias geográficas.'
          : 'Escaneo completado correctamente.',
        assessment.isLocationSpoofed ? 'error' : 'ok',
      );
    } catch (err) {
      setStatus(`Error al ejecutar escaneo: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function runFix() {
    if (state.busy) return;
    setBusy(true, 'corrigiendo...');
    setStatus('Aplicando corrección básica VPN y re-sondeando red...', 'info');
    try {
      const assessment = await apiJson('/api/fix', {
        method: 'POST',
        body: JSON.stringify({
          expectedRegion: state.selectedRegion,
          targetId: state.selectedTargetId,
          customDomains: state.customDomains,
        }),
      });
      state.assessment = assessment;
      renderAssessment();
      setStatus(assessment.fixResult?.message || 'Corrección y re-escaneo completados.', 'ok');
    } catch (err) {
      setStatus(`Error al aplicar corrección: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function openVpnSettings() {
    if (state.busy) return;
    try {
      const res = await apiJson('/api/open-vpn-settings', { method: 'POST', body: '{}' });
      setStatus(res.message || 'Configuración VPN abierta.', res.ok ? 'ok' : 'info');
    } catch (err) {
      setStatus(`No se pudo abrir Configuración VPN: ${err.message}`, 'error');
    }
  }

  async function alignOs() {
    if (state.busy) return;
    const choice = els.osAlignSelect ? els.osAlignSelect.value : 'auto-ip';
    let alignOpts;

    if (choice === 'expected') {
      if (!state.selectedRegion) {
        setStatus('Selecciona primero una Región de Referencia Esperada para alinear con ella.', 'error');
        return;
      }
      alignOpts = { mode: 'manual', region: state.selectedRegion };
    } else {
      alignOpts = OS_ALIGN_PRESETS[choice] || { mode: 'auto-ip' };
    }

    setBusy(true, 'alineando...');
    setStatus('Alineando zona horaria, idioma y región (GeoId) del OS y re-escaneando...', 'info');
    try {
      const data = await apiJson('/api/os-switcher/align', {
        method: 'POST',
        body: JSON.stringify({
          ...buildPayload(),
          ...alignOpts,
        }),
      });
      if (data.osSwitcher !== undefined) state.osSwitcher = data.osSwitcher;
      if (data.switcherResult !== undefined) state.lastSwitcherResult = data.switcherResult;
      if (data.assessment) state.assessment = data.assessment;
      renderAssessment();
      renderOsSwitcher();
      const ok = Boolean(data.switcherResult?.ok);
      setStatus(
        data.switcherResult?.message || data.switcherResult?.error || 'Alineación del sistema completada.',
        ok ? 'ok' : 'error',
      );
    } catch (err) {
      setStatus(`Error al alinear OS: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function revertOs() {
    if (state.busy) return;
    setBusy(true, 'revirtiendo...');
    setStatus('Revirtiendo OS a la configuración original guardada y re-escaneando...', 'info');
    try {
      const data = await apiJson('/api/os-switcher/revert', {
        method: 'POST',
        body: JSON.stringify(buildPayload()),
      });
      if (data.osSwitcher !== undefined) state.osSwitcher = data.osSwitcher;
      if (data.switcherResult !== undefined) state.lastSwitcherResult = data.switcherResult;
      if (data.assessment) state.assessment = data.assessment;
      renderAssessment();
      renderOsSwitcher();
      const ok = Boolean(data.switcherResult?.ok);
      setStatus(
        data.switcherResult?.message || data.switcherResult?.error || 'Reversión del sistema completada.',
        ok ? 'ok' : 'error',
      );
    } catch (err) {
      setStatus(`Error al revertir OS: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function bootstrap() {
    renderRegionSelector();
    renderTargets();
    renderNotes();
    renderAssessment();
    renderOsSwitcher();

    try {
      const data = await apiJson('/api/bootstrap');
      if (Array.isArray(data.regions)) state.regions = data.regions;
      if (Array.isArray(data.targets)) state.targets = data.targets;
      if (Array.isArray(data.notes) && data.notes.length) state.notes = data.notes;
      if (data.osSwitcher !== undefined) state.osSwitcher = data.osSwitcher;
      if (data.lastAssessment) {
        state.assessment = data.lastAssessment;
        if (data.lastAssessment.expectedRegion) {
          state.selectedRegion = data.lastAssessment.expectedRegion;
        }
        if (data.lastAssessment.target?.id) {
          state.selectedTargetId = data.lastAssessment.target.id;
        }
      }
      renderTargets();
      renderRegionSelector();
      renderNotes();
      renderAssessment();
      renderOsSwitcher();
    } catch (err) {
      setStatus(`Error cargando datos iniciales: ${err.message}`, 'error');
    }
  }

  function bindEvents() {
    els.targetSelect.addEventListener('change', (e) => {
      state.selectedTargetId = e.target.value;
      renderTargets();
    });

    els.customDomainsInput.addEventListener('input', (e) => {
      state.customDomains = e.target.value;
      renderTargets();
    });

    els.privacyBtn.addEventListener('click', () => {
      state.privacyMasked = !state.privacyMasked;
      els.privacyBtn.setAttribute('aria-pressed', String(state.privacyMasked));
      els.privacyLabel.textContent = state.privacyMasked ? 'Privacidad: ON' : 'Privacidad: OFF';
      renderAssessment();
    });

    els.regionChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.region-chip');
      if (!btn) return;
      const iso = btn.dataset.iso || '';
      state.selectedRegion = state.selectedRegion === iso ? '' : iso;
      els.regionSearchInput.value = '';
      renderRegionSearchDropdown('');
      renderRegionSelector();
    });

    els.clearRegionBtn.addEventListener('click', () => {
      state.selectedRegion = '';
      els.regionSearchInput.value = '';
      renderRegionSearchDropdown('');
      renderRegionSelector();
    });

    els.regionSearchInput.addEventListener('input', (e) => {
      renderRegionSearchDropdown(e.target.value);
    });

    els.regionSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = els.regionSearchResults.querySelector('.region-option[data-iso]');
        if (first) {
          e.preventDefault();
          state.selectedRegion = first.dataset.iso || '';
          els.regionSearchInput.value = '';
          renderRegionSearchDropdown('');
          renderRegionSelector();
        }
      } else if (e.key === 'Escape') {
        renderRegionSearchDropdown('');
      }
    });

    els.regionSearchResults.addEventListener('click', (e) => {
      const opt = e.target.closest('.region-option[data-iso]');
      if (!opt) return;
      state.selectedRegion = opt.dataset.iso || '';
      els.regionSearchInput.value = '';
      renderRegionSearchDropdown('');
      renderRegionSelector();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.region-card')) {
        els.regionSearchResults.classList.add('hidden');
      }
    });

    els.scanBtn.addEventListener('click', runScan);
    els.fixBtn.addEventListener('click', runFix);
    els.openVpnSettingsBtn.addEventListener('click', openVpnSettings);
    if (els.alignOsBtn) els.alignOsBtn.addEventListener('click', alignOs);
    if (els.revertOsBtn) els.revertOsBtn.addEventListener('click', revertOs);
  }

  bindEvents();
  bootstrap();
})();
