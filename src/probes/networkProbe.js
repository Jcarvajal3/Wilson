import crypto from 'node:crypto';
import dgram from 'node:dgram';
import dns from 'node:dns';
import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { isDatacenterOrg } from '../catalog/regions.js';

const NET_HOSTS = ['ipinfo.io', 'ip-api.com', 'ipify.org', 'icanhazip.com', 'ident.me'];
const MAX_BODY_BYTES = 65536;
const MAX_REDIRECTS = 4;

const DEFAULT_DNS_DOMAINS = ['www.google.com', 'www.youtube.com', 'www.cloudflare.com'];
const TUNNEL_IFACE_RE = /(?:^|[\s\-_./()])(tun|tap|wg|utun|ppp)\d*(?:$|[\s\-_./()])|wintun|wireguard|openvpn|nordlynx|clash|mihomo|sing-box|tailscale|zerotier|warp/i;

function isWhitelistedHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return NET_HOSTS.some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
}

function isValidIpv4(ip) {
  return typeof ip === 'string' && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip.trim());
}

function isPublicIp(ip) {
  const s = String(ip || '').trim();
  if (!s) return false;
  if (s.startsWith('198.18.') || s.startsWith('198.19.')) return false;
  if (s.startsWith('127.') || s.startsWith('10.') || s.startsWith('192.168.')) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(s)) return false;
  if (s === '::1') return false;
  return isValidIpv4(s) || s.includes(':');
}

function isFakeIp(ip) {
  return typeof ip === 'string' && (ip.startsWith('198.18.') || ip.startsWith('198.19.'));
}

function isGlobalIpv6(address) {
  if (!address) return false;
  const clean = String(address).split('%')[0].trim().toLowerCase();
  if (!clean.includes(':')) return false;
  if (clean === '::' || clean === '::1') return false;
  if (/^fe[89ab][0-9a-f]:/i.test(clean)) return false;
  if (/^f[cd][0-9a-f]{2}:/i.test(clean)) return false;
  if (/^ff[0-9a-f]{2}:/i.test(clean)) return false;
  return true;
}

function hasLocalTunnelInterface() {
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!Array.isArray(addrs)) continue;
    if (addrs.some((a) => !a.internal) && TUNNEL_IFACE_RE.test(name)) {
      return true;
    }
  }
  return false;
}

function resolveProxyUrl(proxyInput, targetProtocol = 'https:') {
  if (!proxyInput) return '';
  let raw = '';
  if (typeof proxyInput === 'string') {
    raw = proxyInput.trim();
  } else if (typeof proxyInput === 'object') {
    if (proxyInput.enabled === false) return '';
    raw = String(proxyInput.server || proxyInput.envProxy || '').trim();
  }
  if (!raw) return '';

  if (raw.includes('=') && raw.includes(';')) {
    const parts = raw.split(';');
    const map = {};
    for (const part of parts) {
      const idx = part.indexOf('=');
      if (idx > 0) {
        map[part.slice(0, idx).trim().toLowerCase()] = part.slice(idx + 1).trim();
      }
    }
    raw = (targetProtocol === 'https:' ? map.https || map.http : map.http) || '';
    if (!raw) return '';
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    raw = `http://${raw}`;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.href;
  } catch {
    return '';
  }
}

function decodeChunked(buf) {
  const chunks = [];
  let offset = 0;
  while (offset < buf.length) {
    const lineEnd = buf.indexOf('\r\n', offset);
    if (lineEnd === -1) break;
    const sizeHex = buf.slice(offset, lineEnd).toString('ascii').split(';')[0].trim();
    const chunkSize = parseInt(sizeHex, 16);
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) break;
    const dataStart = lineEnd + 2;
    const dataEnd = Math.min(dataStart + chunkSize, buf.length);
    chunks.push(buf.slice(dataStart, dataEnd));
    offset = dataEnd + 2;
  }
  return Buffer.concat(chunks);
}

function httpGetDirect(urlObj, { timeout = 6000, family } = {}) {
  return new Promise((resolve, reject) => {
    const mod = urlObj.protocol === 'https:' ? https : http;
    const reqOpts = {
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: `${urlObj.pathname}${urlObj.search}`,
      method: 'GET',
      timeout,
      headers: {
        'User-Agent': 'WilsonGeoGuard/1.0',
        Accept: 'application/json,text/plain,*/*',
        Connection: 'close',
      },
    };
    if (family === 4 || family === 6) {
      reqOpts.family = family;
    }

    const req = mod.request(reqOpts, (res) => {
      const chunks = [];
      let total = 0;
      res.on('data', (chunk) => {
        if (total < MAX_BODY_BYTES) {
          const slice = chunk.subarray(0, MAX_BODY_BYTES - total);
          chunks.push(slice);
          total += slice.length;
        }
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy(new Error(`HTTP timeout after ${timeout}ms`));
    });
    req.on('error', reject);
    req.end();
  });
}

function httpGetViaProxy(urlObj, proxyHref, { timeout = 6000 } = {}) {
  const proxy = new URL(proxyHref);
  const proxyHost = proxy.hostname;
  const proxyPort = Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 8080);

  if (urlObj.protocol === 'http:') {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: proxyHost,
          port: proxyPort,
          method: 'GET',
          path: urlObj.href,
          timeout,
          headers: {
            Host: urlObj.host,
            'User-Agent': 'WilsonGeoGuard/1.0',
            Accept: 'application/json,text/plain,*/*',
            'Proxy-Connection': 'close',
          },
        },
        (res) => {
          const chunks = [];
          let total = 0;
          res.on('data', (chunk) => {
            if (total < MAX_BODY_BYTES) {
              const slice = chunk.subarray(0, MAX_BODY_BYTES - total);
              chunks.push(slice);
              total += slice.length;
            }
          });
          res.on('end', () => {
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new Error(`Proxy HTTP timeout after ${timeout}ms`)));
      req.on('error', reject);
      req.end();
    });
  }

  return new Promise((resolve, reject) => {
    const targetPort = Number(urlObj.port) || 443;
    const rawSock = net.connect({ host: proxyHost, port: proxyPort });
    let tlsSock = null;
    let settled = false;

    const finishErr = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (tlsSock) tlsSock.destroy();
      rawSock.destroy();
      reject(err);
    };

    const timer = setTimeout(() => {
      finishErr(new Error(`Proxy CONNECT timeout after ${timeout}ms`));
    }, timeout);

    rawSock.on('error', finishErr);

    rawSock.on('connect', () => {
      const connectReq =
        `CONNECT ${urlObj.hostname}:${targetPort} HTTP/1.1\r\n` +
        `Host: ${urlObj.hostname}:${targetPort}\r\n` +
        `Proxy-Connection: keep-alive\r\n\r\n`;
      rawSock.write(connectReq);

      let connectBuf = Buffer.alloc(0);
      const onConnectData = (chunk) => {
        connectBuf = Buffer.concat([connectBuf, chunk]);
        const hdrEnd = connectBuf.indexOf('\r\n\r\n');
        if (hdrEnd === -1) {
          if (connectBuf.length > 8192) {
            finishErr(new Error('Proxy CONNECT header too large'));
          }
          return;
        }
        rawSock.removeListener('data', onConnectData);
        const hdrText = connectBuf.slice(0, hdrEnd).toString('ascii');
        const statusLine = hdrText.split('\r\n')[0] || '';
        const statusCode = Number(statusLine.split(/\s+/)[1] || 0);
        if (statusCode < 200 || statusCode >= 300) {
          finishErr(new Error(`Proxy CONNECT failed: ${statusLine}`));
          return;
        }

        tlsSock = tls.connect({
          socket: rawSock,
          servername: urlObj.hostname,
        });

        const respChunks = [];
        let total = 0;

        tlsSock.on('error', finishErr);
        tlsSock.on('secureConnect', () => {
          const reqPath = `${urlObj.pathname}${urlObj.search}`;
          tlsSock.write(
            `GET ${reqPath} HTTP/1.1\r\n` +
              `Host: ${urlObj.host}\r\n` +
              `User-Agent: WilsonGeoGuard/1.0\r\n` +
              `Accept: application/json,text/plain,*/*\r\n` +
              `Connection: close\r\n\r\n`,
          );
        });

        tlsSock.on('data', (d) => {
          if (total < MAX_BODY_BYTES + 8192) {
            respChunks.push(d);
            total += d.length;
          }
        });

        tlsSock.on('end', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const rawResp = Buffer.concat(respChunks);
          const splitAt = rawResp.indexOf('\r\n\r\n');
          if (splitAt === -1) {
            resolve({ status: 0, headers: {}, body: rawResp.toString('utf8') });
            return;
          }
          const rawHeaders = rawResp.slice(0, splitAt).toString('ascii');
          const lines = rawHeaders.split('\r\n');
          const status = Number((lines[0] || '').split(/\s+/)[1] || 0);
          const headers = {};
          for (let i = 1; i < lines.length; i++) {
            const sep = lines[i].indexOf(':');
            if (sep > 0) {
              headers[lines[i].slice(0, sep).trim().toLowerCase()] = lines[i].slice(sep + 1).trim();
            }
          }
          let bodyBuf = rawResp.slice(splitAt + 4);
          if ((headers['transfer-encoding'] || '').toLowerCase().includes('chunked')) {
            bodyBuf = decodeChunked(bodyBuf);
          }
          resolve({
            status,
            headers,
            body: bodyBuf.subarray(0, MAX_BODY_BYTES).toString('utf8'),
          });
        });
      };

      rawSock.on('data', onConnectData);
    });
  });
}

async function httpGet(urlStr, { timeout = 6000, family, proxyUrl } = {}) {
  let currentUrl = new URL(urlStr);

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    if (!isWhitelistedHost(currentUrl.hostname)) {
      throw new Error(`Host not whitelisted: ${currentUrl.hostname}`);
    }

    const proxyHref = resolveProxyUrl(proxyUrl, currentUrl.protocol);
    const res = proxyHref
      ? await httpGetViaProxy(currentUrl, proxyHref, { timeout })
      : await httpGetDirect(currentUrl, { timeout, family });

    if (res.status >= 300 && res.status < 400 && res.headers?.location) {
      currentUrl = new URL(res.headers.location, currentUrl);
      continue;
    }

    return res.body;
  }

  return '';
}

async function lookupWithTimeout(hostname, timeoutMs = 3500) {
  let timer;
  try {
    return await Promise.race([
      dns.promises.lookup(hostname, { all: true }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`DNS timeout (${timeoutMs}ms)`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Queries country ISO2 code for a given public IP using whitelisted endpoints.
 */
export async function geoOf(ip) {
  const cleanIp = String(ip || '').trim();
  if (!isPublicIp(cleanIp)) return '';

  try {
    const body = await httpGet(`https://ipinfo.io/${encodeURIComponent(cleanIp)}/json`, {
      timeout: 4500,
    });
    const parsed = JSON.parse(body);
    if (parsed?.country) return String(parsed.country).trim().toUpperCase();
  } catch {
    // Fall through to ip-api.com
  }

  try {
    const body = await httpGet(
      `http://ip-api.com/json/${encodeURIComponent(cleanIp)}?fields=status,countryCode`,
      { timeout: 4500 },
    );
    const parsed = JSON.parse(body);
    if (parsed?.status === 'success' && parsed?.countryCode) {
      return String(parsed.countryCode).trim().toUpperCase();
    }
  } catch {
    // Return empty string on failure
  }

  return '';
}

/**
 * Raw UDP DNS TXT probe against ns1.google.com:53 querying o-o.myaddr.l.google.com.
 */
export async function udpWhoami() {
  const resolved = await lookupWithTimeout('ns1.google.com', 3500);
  const v4 = resolved.find((r) => r.family === 4)?.address || '216.239.32.10';

  const id = crypto.randomInt(0, 0x10000);
  const header = Buffer.from([
    (id >> 8) & 0xff,
    id & 0xff,
    0x01,
    0x00, // RD=1
    0x00,
    0x01, // QDCOUNT=1
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
  const labels = 'o-o.myaddr.l.google.com'.split('.').flatMap((part) => {
    const b = Buffer.from(part, 'ascii');
    return [b.length, ...b];
  });
  const trailer = Buffer.from([0x00, 0x00, 16, 0x00, 0x01]); // NUL, QTYPE=TXT(16), QCLASS=IN(1)
  const pkt = Buffer.concat([header, Buffer.from(labels), trailer]);

  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      try {
        sock.close();
      } catch {
        // Ignore close errors
      }
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const timer = setTimeout(() => {
      fail(new Error('DNS53 udpWhoami timeout'));
    }, 5000);

    sock.on('error', fail);

    sock.on('message', (rb) => {
      if (settled) return;
      settled = true;
      cleanup();

      const len = rb.length;
      if (len < 12) {
        resolve('bad-resp');
        return;
      }
      const an = (rb[6] << 8) | rb[7];
      let off = 12;
      while (off < len && rb[off] !== 0) {
        off += rb[off] + 1;
      }
      off += 5; // NUL + qtype + qclass

      let found = '';
      for (let i = 0; i < an && off + 10 < len; i++) {
        if ((rb[off] & 0xc0) === 0xc0) {
          off += 2;
        } else {
          while (off < len && rb[off] !== 0) {
            off += rb[off] + 1;
          }
          off += 1;
        }
        if (off + 10 > len) break;
        const type = (rb[off] << 8) | rb[off + 1];
        const rdlen = (rb[off + 8] << 8) | rb[off + 9];
        if (type === 16 && rdlen > 1) {
          let p = off + 10;
          const end = Math.min(p + rdlen, len);
          while (p < end) {
            const tl = rb[p];
            const strEnd = Math.min(p + 1 + tl, end);
            const cs = rb.slice(p + 1, strEnd).toString('utf8').trim();
            if (isValidIpv4(cs)) {
              resolve(cs);
              return;
            }
            if (!found && cs) found = cs;
            p += 1 + tl;
          }
        }
        off += 10 + rdlen;
      }

      resolve(found || 'no-txt');
    });

    sock.send(pkt, 53, v4, (err) => {
      if (err) fail(err);
    });
  });
}

/**
 * RFC 5389 STUN Binding Request over UDPv4 decoding XOR-MAPPED-ADDRESS (0x0020)
 * and MAPPED-ADDRESS (0x0001).
 */
export async function stunProbe(host, port) {
  const resolved = await lookupWithTimeout(host, 3500);
  const v4 = resolved.find((r) => r.family === 4)?.address || host;

  const header = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x21, 0x12, 0xa4, 0x42]);
  const tx = crypto.randomBytes(12);
  const pkt = Buffer.concat([header, tx]);

  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      try {
        sock.close();
      } catch {
        // Ignore close errors
      }
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const timer = setTimeout(() => {
      fail(new Error(`STUN timeout (${host}:${port})`));
    }, 4000);

    sock.on('error', fail);

    sock.on('message', (rb) => {
      if (settled) return;
      settled = true;
      cleanup();

      const len = rb.length;
      if (len < 20 || rb[0] !== 0x01 || rb[1] !== 0x01) {
        resolve('bad-resp');
        return;
      }

      let off = 20;
      while (off + 4 <= len) {
        const at = (rb[off] << 8) | rb[off + 1];
        const al = (rb[off + 2] << 8) | rb[off + 3];
        if (off + 4 + al > len) break;

        if (at === 0x0020 && al >= 8 && rb[off + 5] === 0x01) {
          const b0 = rb[off + 8] ^ 0x21;
          const b1 = rb[off + 9] ^ 0x12;
          const b2 = rb[off + 10] ^ 0xa4;
          const b3 = rb[off + 11] ^ 0x42;
          resolve(`${b0}.${b1}.${b2}.${b3}`);
          return;
        }
        if (at === 0x0001 && al >= 8 && rb[off + 5] === 0x01) {
          resolve(`${rb[off + 8]}.${rb[off + 9]}.${rb[off + 10]}.${rb[off + 11]}`);
          return;
        }

        off += 4 + ((al + 3) & ~3);
      }

      resolve('no-addr');
    });

    sock.send(pkt, port, v4, (err) => {
      if (err) fail(err);
    });
  });
}

/**
 * Probes public TCP egress IP, geolocation, ASN/org, and datacenter status.
 */
export async function probeEgress(proxyUrl = '') {
  let ip = '';
  let cc = '';
  let country = '';
  let region = '';
  let city = '';
  let timezone = '';
  let org = '';
  let as = '';
  let isp = '';
  let hostingFlag = false;
  let source = '';
  const errors = [];

  try {
    const raw = await httpGet('https://ipinfo.io/json', { timeout: 6000, proxyUrl });
    const data = JSON.parse(raw);
    if (data?.ip) {
      ip = String(data.ip).trim();
      cc = String(data.country || '').trim().toUpperCase();
      country = cc;
      region = String(data.region || '').trim();
      city = String(data.city || '').trim();
      timezone = String(data.timezone || '').trim();
      org = String(data.org || '').trim();
      source = 'ipinfo.io';
    }
  } catch (err) {
    errors.push(`ipinfo: ${err.message}`);
  }

  if (!ip || !cc || !org) {
    try {
      const raw = await httpGet(
        'http://ip-api.com/json/?fields=status,query,countryCode,country,regionName,city,timezone,as,org,isp,hosting,proxy',
        { timeout: 6000, proxyUrl },
      );
      const data = JSON.parse(raw);
      if (data?.status === 'success') {
        if (!ip && data.query) ip = String(data.query).trim();
        if (!cc && data.countryCode) cc = String(data.countryCode).trim().toUpperCase();
        if (data.country) country = String(data.country).trim();
        if (!region && data.regionName) region = String(data.regionName).trim();
        if (!city && data.city) city = String(data.city).trim();
        if (!timezone && data.timezone) timezone = String(data.timezone).trim();
        if (data.as) as = String(data.as).trim();
        if (data.isp) isp = String(data.isp).trim();
        if (!org) org = as || isp || String(data.org || '').trim();
        hostingFlag = Boolean(data.hosting || data.proxy);
        source = source ? `${source}+ip-api.com` : 'ip-api.com';
      }
    } catch (err) {
      errors.push(`ip-api: ${err.message}`);
    }
  }

  if (!ip) {
    try {
      const raw = await httpGet('https://api.ipify.org', { timeout: 6000, proxyUrl });
      const trimmed = raw.trim();
      if (isPublicIp(trimmed)) {
        ip = trimmed;
        source = source || 'ipify.org';
      }
    } catch (err) {
      errors.push(`ipify: ${err.message}`);
    }
  }

  const isDatacenter = Boolean(
    hostingFlag || isDatacenterOrg(`${org} ${as} ${isp}`),
  );

  return {
    ip,
    cc,
    country,
    region,
    city,
    timezone,
    org,
    as,
    isp,
    isDatacenter,
    source,
    error: ip ? '' : errors.join('; ') || 'No se pudo determinar la IP de salida',
  };
}

/**
 * Probes DNS resolution for foreign domains (detecting fake-ip coverage) and
 * checks the DNS resolver's apparent IP/country via raw UDP/53 TXT whoami.
 */
export async function probeDns(extraDomains = [], egressCc = '', hasVpnOrProxy = false) {
  const domains = Array.from(
    new Set(
      [...DEFAULT_DNS_DOMAINS, ...(Array.isArray(extraDomains) ? extraDomains : [])]
        .map((d) => String(d || '').trim())
        .filter(Boolean),
    ),
  );

  const checks = await Promise.all(
    domains.map(async (domain) => {
      try {
        const records = await lookupWithTimeout(domain, 3500);
        const ips = records.map((r) => r.address);
        const fake = ips.some((addr) => isFakeIp(addr));
        return { domain, ips, isFakeIp: fake, error: '' };
      } catch (err) {
        return { domain, ips: [], isFakeIp: false, error: err.message };
      }
    }),
  );

  let total = 0;
  let fakeCount = 0;
  let failedCount = 0;
  for (const item of checks) {
    if (item.error || item.ips.length === 0) {
      failedCount++;
    } else {
      total++;
      if (item.isFakeIp) fakeCount++;
    }
  }
  const realCount = total - fakeCount;
  const mixedFakeReal = fakeCount > 0 && fakeCount < total;
  const allFakeIp = total > 0 && fakeCount === total;

  let resolverIp = '';
  let resolverCc = '';
  try {
    const who = await udpWhoami();
    if (isValidIpv4(who)) {
      resolverIp = who;
      resolverCc = await geoOf(resolverIp);
    }
  } catch {
    // UDP/53 blocked or timed out
  }

  const countryMismatch = Boolean(
    hasVpnOrProxy &&
      resolverCc &&
      egressCc &&
      resolverCc.toUpperCase() !== egressCc.toUpperCase(),
  );

  let state = 1;
  if (mixedFakeReal || countryMismatch) {
    state = 0;
  } else if (total === 0 || failedCount > 0) {
    state = -1;
  }

  return {
    state,
    total,
    fakeCount,
    realCount,
    failedCount,
    allFakeIp,
    mixedFakeReal,
    resolverIp,
    resolverCc,
    countryMismatch,
    domains: checks,
  };
}

/**
 * Checks IPv6 external egress vs local global IPv6 addresses to detect IPv6 leaks.
 */
export async function probeIpv6(egressCc = '') {
  const localAddrs = [];
  const ifaces = os.networkInterfaces();
  for (const [iface, addrs] of Object.entries(ifaces)) {
    if (!Array.isArray(addrs)) continue;
    for (const entry of addrs) {
      if (entry.internal) continue;
      if (entry.family !== 'IPv6' && entry.family !== 6) continue;
      const addr = String(entry.address || '').split('%')[0];
      if (isGlobalIpv6(addr)) {
        localAddrs.push({ iface, address: addr });
      }
    }
  }

  let externalIp = 'none';
  try {
    const body = await httpGet('https://api6.ipify.org', { family: 6, timeout: 4500 });
    const trimmed = body.trim();
    if (trimmed && trimmed.includes(':')) {
      externalIp = trimmed;
    }
  } catch {
    externalIp = 'none';
  }

  if (externalIp === 'none') {
    return {
      state: 1,
      externalIp: 'none',
      externalCc: '',
      isLocalLeak: false,
      countryMismatch: false,
      localAddrs,
    };
  }

  const extLower = externalIp.toLowerCase();
  const isLocalLeak = localAddrs.some((entry) => entry.address.toLowerCase() === extLower);
  const externalCc = await geoOf(externalIp);
  const countryMismatch = Boolean(
    externalCc && egressCc && externalCc.toUpperCase() !== egressCc.toUpperCase(),
  );

  const state = isLocalLeak || countryMismatch ? 0 : 1;

  return {
    state,
    externalIp,
    externalCc,
    isLocalLeak,
    countryMismatch,
    localAddrs,
  };
}

/**
 * Probes UDP/WebRTC egress via STUN Binding Request (with DNS/53 fallback) and
 * compares it against the TCP egress IP and country.
 */
export async function probeUdp(egressIp = '', egressCc = '') {
  let ip = '';
  let via = '';
  let server = '';

  try {
    const res = await stunProbe('stun.l.google.com', 19302);
    if (isValidIpv4(res)) {
      ip = res;
      via = 'stun';
      server = 'stun.l.google.com:19302';
    }
  } catch {
    // Try secondary STUN server
  }

  if (!ip) {
    try {
      const res = await stunProbe('stun.cloudflare.com', 3478);
      if (isValidIpv4(res)) {
        ip = res;
        via = 'stun';
        server = 'stun.cloudflare.com:3478';
      }
    } catch {
      // Fall back to DNS53 whoami
    }
  }

  if (!ip) {
    try {
      const res = await udpWhoami();
      if (isValidIpv4(res)) {
        ip = res;
        via = 'dns53';
        server = 'ns1.google.com:53';
      }
    } catch {
      // Both STUN and DNS53 blocked/timed out
    }
  }

  if (!ip) {
    return {
      state: 1,
      ip: 'timeout',
      cc: '',
      via: '',
      server: '',
      matchesTcp: true,
    };
  }

  const cc = await geoOf(ip);
  const matchesTcp = Boolean(
    (egressIp && ip === egressIp) ||
      (cc && egressCc && cc.toUpperCase() === egressCc.toUpperCase()),
  );

  return {
    state: matchesTcp ? 1 : 0,
    ip,
    cc,
    via,
    server,
    matchesTcp,
  };
}

async function collectProxyConfigFiles() {
  const candidates = [];
  if (process.env.WILSON_PROXY_CONFIG) {
    candidates.push(process.env.WILSON_PROXY_CONFIG);
  }
  candidates.push(
    path.join(os.homedir(), '.config', 'clash', 'config.yaml'),
    path.join(os.homedir(), '.config', 'mihomo', 'config.yaml'),
  );

  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  candidates.push(
    path.join(appData, 'io.github.clash-verge-rev.clash-verge-rev', 'profiles'),
  );

  const files = [];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        files.push(candidate);
      } else if (stat.isDirectory()) {
        const entries = await fs.readdir(candidate, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && /\.(ya?ml)$/i.test(entry.name)) {
            files.push(path.join(candidate, entry.name));
          }
        }
      }
    } catch {
      // Path does not exist or is unreadable
    }
  }

  return Array.from(new Set(files));
}

/**
 * Inspects local Clash/Mihomo/Clash-Verge proxy config files for rules matching
 * the target domainRule and performs DNS lookups on target sample + custom domains.
 */
export async function probeNodeRules(targetSpec, customDomains = []) {
  const targetId = targetSpec?.id || 'custom';
  const targetName = targetSpec?.name || 'Custom';
  const domainRule = targetSpec?.domainRule || '';

  let ruleRegex = null;
  if (domainRule) {
    try {
      ruleRegex = new RegExp(domainRule, 'i');
    } catch {
      ruleRegex = null;
    }
  }

  const customList = Array.isArray(customDomains)
    ? customDomains.map((d) => String(d || '').trim()).filter(Boolean)
    : [];

  const configFiles = await collectProxyConfigFiles();
  const matchedRules = [];
  const ruleLineRe = /(?:^|[-,\s])(DOMAIN-SUFFIX|DOMAIN-KEYWORD|DOMAIN|DOMAIN-REGEX)\s*,([^,\r\n#]+)(?:,([^\r\n#]+))?/i;

  for (const filePath of configFiles) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const m = line.match(ruleLineRe);
        if (!m) continue;
        const ruleType = m[1].toUpperCase();
        const pattern = m[2].trim().replace(/^['"]|['"]$/g, '');
        const policy = (m[3] || '').trim().replace(/^['"]|['"]$/g, '');

        const matchesTarget = ruleRegex ? ruleRegex.test(pattern) : false;
        const matchesCustom = customList.some((dom) => {
          const d = dom.toLowerCase();
          const p = pattern.toLowerCase();
          return d === p || d.endsWith(`.${p}`) || (ruleType === 'DOMAIN-KEYWORD' && d.includes(p));
        });

        if (matchesTarget || matchesCustom) {
          matchedRules.push({
            file: filePath,
            type: ruleType,
            pattern,
            policy,
            raw: line,
          });
        }
      }
    } catch {
      // Ignore unreadable file
    }
  }

  const domainsToCheck = Array.from(
    new Set([...(targetSpec?.sampleDomains || []), ...customList].filter(Boolean)),
  );

  const domainChecks = await Promise.all(
    domainsToCheck.map(async (domain) => {
      try {
        const records = await lookupWithTimeout(domain, 3500);
        const ips = records.map((r) => r.address);
        return {
          domain,
          ips,
          isFakeIp: ips.some((addr) => isFakeIp(addr)),
          error: '',
        };
      } catch (err) {
        return { domain, ips: [], isFakeIp: false, error: err.message };
      }
    }),
  );

  const allFake =
    domainChecks.length > 0 &&
    domainChecks.every((d) => !d.error && d.ips.length > 0 && d.isFakeIp);

  let state = -1;
  let note = '';

  if (matchedRules.length > 0) {
    state = 1;
    note = `${matchedRules.length} regla(s) de proxy coincidente(s) encontradas.`;
  } else if (allFake) {
    state = 1;
    note = 'Dominios objetivo cubiertos por Fake-IP (198.18/19).';
  } else if (configFiles.length > 0) {
    state = 0;
    note = `Se inspeccionaron ${configFiles.length} archivo(s) de configuración sin reglas para ${targetName}.`;
  } else {
    state = -1;
    note = 'No se detectaron archivos locales de reglas Clash/Mihomo.';
  }

  return {
    state,
    targetId,
    targetName,
    domainRule,
    matchedRules,
    domainChecks,
    note,
  };
}

/**
 * Runs the complete network probe suite: TCP egress, DNS, IPv6, UDP/STUN, and node rules.
 */
export async function probeNetwork(options = {}) {
  const { targetSpec = null, customDomains = [], systemProxy = null, vpnActive } = options;

  const hasTunnel = hasLocalTunnelInterface();
  const useProxy = !hasTunnel && Boolean(systemProxy?.enabled || typeof systemProxy === 'string');
  const proxyUrl = useProxy ? resolveProxyUrl(systemProxy) : '';

  const egress = await probeEgress(proxyUrl);
  const hasVpnOrProxy = Boolean(vpnActive || hasTunnel || systemProxy?.enabled);

  const [dnsRes, ipv6, udp, nodeRules] = await Promise.all([
    probeDns(customDomains, egress.cc, hasVpnOrProxy),
    probeIpv6(egress.cc),
    probeUdp(egress.ip, egress.cc),
    probeNodeRules(targetSpec, customDomains),
  ]);

  return {
    egress,
    dns: dnsRes,
    ipv6,
    udp,
    nodeRules,
  };
}
