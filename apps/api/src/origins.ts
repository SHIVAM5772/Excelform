export function allowedOrigins(webOrigin: string, mode: string): Set<string> {
  const configured = new URL(webOrigin);
  const origins = new Set([configured.origin]);
  // The local Vite address and localhost refer to the same development server.
  // Keep protocol and port fixed; never extend this exception to production.
  if (mode === 'development' && ['localhost', '127.0.0.1'].includes(configured.hostname)) {
    for (const hostname of ['localhost', '127.0.0.1']) {
      const alias = new URL(configured);
      alias.hostname = hostname;
      origins.add(alias.origin);
    }
  }
  return origins;
}
