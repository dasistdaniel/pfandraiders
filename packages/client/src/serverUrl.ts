const DEFAULT_URL = 'ws://localhost:8080';

function valid(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^wss?:\/\/[^\s]+$/.test(url);
}

/** Server-Adresse: ?server=… (nur ws/wss), sonst Build-Variable, sonst localhost. */
export function resolveServerUrl(search: string, envUrl: string | undefined): string {
  const param = new URLSearchParams(search).get('server');
  if (valid(param)) return param;
  if (valid(envUrl)) return envUrl;
  return DEFAULT_URL;
}
