import { createAppRequestHandler } from '../src/server/appServer.js';

const appHandler = createAppRequestHandler();

/**
 * Vercel serverless entry point delegating /api/* requests to the WilsonGeoGuard handler.
 */
export default async function handler(req, res) {
  const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
  const rewrittenPath = urlObj.searchParams.get('__path');
  if (rewrittenPath) {
    urlObj.searchParams.delete('__path');
    const qs = urlObj.searchParams.toString();
    const normalized = rewrittenPath.startsWith('/') ? rewrittenPath : `/${rewrittenPath}`;
    req.url = `${normalized}${qs ? `?${qs}` : ''}`;
  }
  return appHandler(req, res);
}
