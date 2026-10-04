import type { ServerBuild } from '@pfandraiders/core';

/** Setzt esbuild beim Bauen ein (siehe scripts/build.mjs); fehlt unter tsx und vitest. */
declare const __BUILD_NUMBER__: string | undefined;
declare const __BUILD_SHA__: string | undefined;

/** Werte aus dem Bundle; ein fehlendes Feld bedeutet "nicht gebündelt". */
export interface BuildDefines {
  number?: string;
  sha?: string;
}

function cleanNumber(raw: string | undefined): string {
  const text = raw?.trim() ?? '';
  return /^\d+$/.test(text) ? text : 'dev';
}

function cleanSha(raw: string | undefined): string {
  return (raw?.trim() ?? '').slice(0, 7);
}

/**
 * Build des Servers. Gebündelt gelten die Werte aus dem Bundle, sonst (tsx) die
 * Umgebungsvariablen BUILD_NUMBER und GIT_SHA. Nummer nur aus Ziffern, sonst "dev"; Hash leer = unbekannt.
 */
export function resolveBuild(defines: BuildDefines, env: Record<string, string | undefined>): ServerBuild {
  return {
    number: cleanNumber(defines.number !== undefined ? defines.number : env.BUILD_NUMBER),
    sha: cleanSha(defines.sha !== undefined ? defines.sha : env.GIT_SHA),
  };
}

export function currentBuild(): ServerBuild {
  return resolveBuild(
    {
      number: typeof __BUILD_NUMBER__ !== 'undefined' ? __BUILD_NUMBER__ : undefined,
      sha: typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : undefined,
    },
    process.env,
  );
}

/** Startmeldung, zum Beispiel "PfandRaiders server listening on :8080 (build #12 · abc1234)". */
export function startupLine(port: number, build: ServerBuild): string {
  const num = /^\d+$/.test(build.number) ? `#${build.number}` : build.number;
  const label = build.sha ? `${num} · ${build.sha}` : num;
  return `PfandRaiders server listening on :${port} (build ${label})`;
}
