/** Wird beim Bauen von Vite eingesetzt (siehe vite.config.ts); fehlt außerhalb von Vite, dann "dev". */
declare const __BUILD_NUMBER__: string | undefined;
declare const __BUILD_SHA__: string | undefined;

export interface BuildInfo {
  number: string;
  sha: string;
}

export function currentBuild(): BuildInfo {
  return {
    number: typeof __BUILD_NUMBER__ === 'string' && __BUILD_NUMBER__ !== '' ? __BUILD_NUMBER__ : 'dev',
    sha: typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : '',
  };
}

/**
 * Laufen Client und Server mit verschiedenem Code? Verglichen wird nur der Kurz-Hash
 * (die Nummern zählen unterschiedlich: GitHub-Lauf beim Client, Commit-Anzahl beim Server).
 * Unbekannter oder leerer Hash auf einer Seite: false.
 */
export function versionMismatch(client: BuildInfo, server: BuildInfo | null): boolean {
  if (!server || !client.sha || !server.sha) return false;
  return client.sha.toLowerCase() !== server.sha.toLowerCase();
}

/** Text für die Menüecke, zum Beispiel "Build #123 · a1b2c3d" oder "Build dev · a1b2c3d". */
export function buildLabel(info: BuildInfo): string {
  const num = /^\d+$/.test(info.number) ? `#${info.number}` : info.number;
  return info.sha ? `Build ${num} · ${info.sha}` : `Build ${num}`;
}
