# WilsonGeoGuard

**Auditoría Anti-Spoofing y Ubicación Geográfica Desktop** inspirada en **ClaudeWilson Desktop**.  
Correlaciona señales locales del sistema operativo, interfaces/procesos VPN, salida TCP pública, resolución DNS (incluido Fake-IP y DNS UDP/53), tráfico IPv6, STUN/UDP (WebRTC) y reglas locales de nodo proxy para determinar si la ubicación aparentada por la IP coincide con la ubicación real del dispositivo o si existen fugas / evasión geográfica.

---

## Arquitectura elegida

WilsonGeoGuard está diseñado para ejecutarse **100 % en local y sin dependencias externas** sobre **Node.js v24+** (ESM nativo, `"type": "module"`):

- **Sin dependencias npm ni build step**: utiliza únicamente APIs estándar de Node.js (`node:http`, `node:https`, `node:dgram`, `node:dns`, `node:os`, `node:child_process`, `node:test`) y utilidades nativas del sistema operativo.
- **Frontend Desktop offline**: HTML, CSS y JavaScript vanilla servidos localmente desde `127.0.0.1` (y abiertos automáticamente en ventana tipo app con Edge/Chrome `--app=...` o navegador por defecto).
- **Separación por capas**:
  1. **Catálogo (`src/catalog/`)**: regiones ISO/UTC/locales/IANA y objetivos de auditoría.
  2. **Sondas (`src/probes/`)**: recolección de señales del OS, túneles/procesos VPN y pruebas activas de red.
  3. **Motor de evaluación (`src/engine/`)**: correlación cruzada anti-spoofing, tablas semafóricas, veredicto geográfico y cálculo de riesgo (`0–100%`).
  4. **Servidor y CLI (`src/server/`)**: API HTTP JSON + archivos estáticos + interfaz de línea de comandos.
  5. **Interfaz Desktop (`src/public/`)**: panel oscuro de alta densidad con modo privacidad (`👁`), selector de objetivo y región, comparativa geográfica y registro compacto de diagnóstico.

---

## Módulos implementados

| Ruta | Responsabilidad |
| --- | --- |
| `package.json` | Manifiesto ESM (`wilson-geoguard`) y scripts de ejecución y pruebas. |
| `src/catalog/regions.js` | Catálogo curado + 170+ países ISO2 (`REGIONS`), alias (`uk`→`gb`, `usa`→`us`, etc.), firmas de datacenters (`DC_ASN`), mapeo IANA→ISO2 (`inferCountriesFromTimezone`), coincidencia UTC y locale. |
| `src/catalog/targets.js` | Objetivos predefinidos (`claude`, `chatgpt`, `custom` / Proyecto Propio) y sus dominios y reglas de proxy. |
| `src/probes/systemProbe.js` | Inspección de locale, zona horaria IANA/Windows, desplazamiento UTC, país inferido del sistema y metadatos del host. |
| `src/probes/vpnProbe.js` | Detección de interfaces de túnel (`tun`, `wg`, `tap`, `wintun`, etc.), procesos VPN/proxy, proxy del sistema, estado Always-On/Kill-Switch, privilegios elevados (`isAdmin`), corrección básica (`applyBasicVpnFix`) y apertura de `ms-settings:network-vpn`. |
| `src/probes/networkProbe.js` | Sonda de salida TCP (`probeEgress`), DNS + Fake-IP + `udpWhoami` DNS/53 (`probeDns`), IPv6 local y externa (`probeIpv6`), STUN RFC 5389 UDP (`probeUdp` / `stunProbe`) y reglas locales Clash/Mihomo (`probeNodeRules`). |
| `src/engine/assessment.js` | Motor `evaluateScan()`: construye `systemTable`, `networkTable`, `discrepancies`, `locationVerdict`, `riskScore`, `riskLevel`, `isLocationSpoofed`, historial `ipHistory` y las 5 notas operativas. |
| `src/server/appServer.js` | Servidor HTTP local (`createAppServer`, `startServer`) con endpoints `/api/bootstrap`, `/api/scan`, `/api/fix`, `/api/open-vpn-settings` y servicio estático de `src/public/`. |
| `src/server/cli.js` | Punto de entrada CLI (`--gui`, `--scan`, `--fix`, `--region`, `--target`, `--domains`, `--json`, `--port`). |
| `src/public/index.html` | Estructura de la interfaz Desktop (`WilsonGeoGuard`). |
| `src/public/styles.css` | Estética oscura de alta densidad (`#070b10`, `#0d1520`, `#1c2d42`, badges semafóricos y acento cian `#00e5ff`). |
| `src/public/app.js` | Lógica cliente: bootstrap, búsqueda/chips de región, toggle de privacidad `👁`, escaneo, auto-fix, `fixLine` y diagnóstico compacto. |
| `test/verification.test.js` | Suite de pruebas unitarias e integración con `node:test` y `node:assert/strict`. |

---

## Comandos disponibles

```bash
# Iniciar servidor local y abrir la ventana Desktop (puerto por defecto 4380)
npm start

# Ejecutar un escaneo completo por consola y mostrar el reporte legible
npm run scan

# Ejecutar un escaneo completo y emitir el resultado en JSON estructurado
npm run scan:json

# Ejecutar la suite de verificación automatizada
npm test
```

Opciones adicionales de `src/server/cli.js`:

```bash
node src/server/cli.js --scan --region es --target claude
node src/server/cli.js --scan --target custom --domains api.ipify.org,cloudflare.com --fix
node src/server/cli.js --gui --port 4380
```

---

## Qué detecta cada parámetro

### 1. Tabla de Sistema (`systemTable`)
- **Idioma del sistema (`locale`)**: compara el locale configurado en el OS (ej. `es-ES`, `en-US`) frente al país de referencia o el país de salida IP.
- **Zona horaria (`timezone`)**: obtiene la zona IANA actual (ej. `Europe/Madrid`, `America/Caracas`) y deduce los países compatibles.
- **Desplazamiento UTC (`utcOffset`)**: verifica si el offset actual del sistema (ej. `UTC+1`, `UTC-4`) es compatible con la región esperada o el país de la IP pública.
- **País inferido del sistema (`systemCountry`)**: país más probable del dispositivo físico según zona horaria e idioma del sistema operativo.

### 2. Tabla de Comprobación de Red (`networkTable`)
- **VPN**: detecta adaptadores virtuales/túnel activos, procesos de clientes VPN/proxy (WireGuard, OpenVPN, Clash/Mihomo, Sing-box, WARP, Tailscale, NordVPN, ProtonVPN, Mullvad, etc.) y proxy HTTP del sistema.
- **Salida de la IP (`egress`)**: IP pública TCP observada, país ISO, ciudad/región y organización/ASN.
- **Línea (`line`)**: clasifica la IP pública como **residencial** o **centro de datos / hosting** usando la base de ASNs (`DC_ASN`: AWS, GCP, Azure, DigitalOcean, M247, OVH, Hetzner, Cloudflare, etc.) y flags de hosting.
- **DNS (`dns`)**: resuelve dominios de control y del objetivo buscando rangos **Fake-IP** (`198.18.0.0/15`) y ejecuta `udpWhoami` (`o-o.myaddr.l.google.com` vía DNS/53) para geolocalizar el resolver real.
  - `state = 1` (`✓`): protegido con Fake-IP consistente o mismo país que la salida TCP.
  - `state = 0` (`✗`): mezcla Fake-IP + IP real, o el resolver DNS filtra otro país distinto al de la VPN.
  - `state = -1` (`—` / `unread`): alguna consulta falló por timeout/red; **no se marca como fuga**.
- **IPv6 (`ipv6`)**: inspecciona direcciones IPv6 globales locales y consulta `api6.ipify.org`. Detecta si una IPv6 pública local se filtra al exterior sin pasar por el túnel VPN.
- **UDP (`udp`)**: envía una petición **STUN RFC 5389** (`stun.l.google.com:19302` / `stun.cloudflare.com:3478`, con fallback `udpWhoami`) para descubrir la IP vista por tráfico UDP/WebRTC y compararla con la salida TCP.
- **Nodo (`node`)**: busca reglas (`DOMAIN-SUFFIX`, `DOMAIN-KEYWORD`, `DOMAIN`) en configuraciones locales de Clash/Mihomo/Clash Verge (o `WILSON_PROXY_CONFIG`) para los dominios del objetivo seleccionado (`Claude`, `ChatGPT` o `Proyecto Propio`).
- **Always-On VPN (`alwaysOn`)**: comprueba si existe configuración persistente / kill-switch conocido. En escritorio muestra `always-on off` (`⚠`) cuando no está habilitado a nivel de sistema.

---

## Cómo interpretar las discordancias anti-hackeo

El motor calcula un puntaje de riesgo (`0–100%`) clasificado en `LOW`, `MEDIUM`, `HIGH` o `CRITICAL`, junto con `locationVerdict`:

- **`UBICACIÓN CONSISTENTE`**: la IP pública, el país inferido del sistema operativo, el resolver DNS, STUN/UDP y la región esperada (si se seleccionó) son coherentes y no hay túneles ni fugas activas.
- **`DISCORDANCIA DETECTADA — POSIBLE EVASIÓN GEOGRÁFICA`**: existe contradicción entre la ubicación aparentada por la IP y la ubicación real del dispositivo o sus fugas de red.

Códigos de discordancia:

| Código | Significado e interpretación |
| --- | --- |
| `TIMEZONE_IP_MISMATCH` | La zona horaria del sistema operativo apunta a un país distinto al de la IP pública de salida. Fuerte indicio de uso de VPN/proxy. |
| `UTC_OFFSET_MISMATCH` | El desplazamiento horario UTC del dispositivo es incompatible con el país de la IP pública. |
| `LOCALE_COUNTRY_MISMATCH` | El idioma/región del sistema difiere tanto de la IP pública como de la zona horaria esperada. |
| `REGION_EXIT_MISMATCH` | La IP de salida no coincide con la región de referencia elegida. Cambia el nodo del proxy/VPN o selecciona el país correcto del nodo. |
| `VPN_ACTIVE_DETECTED` | Se detectó una interfaz túnel, proceso VPN o proxy de sistema activo. |
| `DATACENTER_IP_DETECTED` | La IP pública pertenece a un proveedor de nube/hosting/datacenter en lugar de un ISP residencial. |
| `UDP_STUN_LEAK` | El tráfico UDP/STUN (típico de WebRTC) expone una IP o país distinto a la salida TCP (revela la IP real tras la VPN). |
| `IPV6_LEAK` | Existe una dirección IPv6 externa filtrándose fuera del túnel o exponiendo el país real. |
| `DNS_LEAK_OR_UNCOVERED` | Las consultas DNS se resuelven en un país diferente al de la salida TCP o mezclan Fake-IP con IPs reales sin cubrir. *(Nota: `DNS unread` por fallo transitorio nunca dispara esta alerta).* |
| `IP_FLIP_DETECTED` | La IP pública cambió respecto al escaneo anterior registrado en `ipHistory`. |

### Notas operativas clave

1. **Corrección básica automática**: si hay una VPN en funcionamiento y está marcada la casilla de auto-corrección, la herramienta intenta desactivar IPv6 y limpiar el proxy HTTP global (conservando el proxy local si la VPN opera sin interfaz túnel para no cortar la conexión) y re-escanea para comprobar el resultado.
2. **Always-on VPN**: debe activarse desde la **Configuración de VPN** del sistema operativo (en desktop no se fuerza desde la app).
3. **Salida IP ≠ región esperada**: el nodo activo está en otro país; cambia el nodo o ajusta la región seleccionada.
4. **Línea no residencial**: si la salida pertenece a un centro de datos/hosting, cambia a un nodo residencial.
5. **DNS `unread`**: indica que una consulta DNS falló o expiró; **no constituye una filtración confirmada**.
