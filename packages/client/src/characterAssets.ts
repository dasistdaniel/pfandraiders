/** URLs der 24 Figurenbögen (Vite-Asset-Import), Schlüssel m01..m12, f01..f12. */
const modules = import.meta.glob<string>('./assets/characters/*.png', { eager: true, query: '?url', import: 'default' });

/** Schlüssel aus dem Dateinamen (m01.png -> m01), null für alles andere. */
export function charKeyFromPath(path: string): string | null {
  const m = /([mf]\d\d)\.png$/.exec(path);
  return m ? m[1] : null;
}

export const CHARACTER_URLS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(modules).flatMap(([path, url]) => {
    const key = charKeyFromPath(path);
    return key ? [[key, url]] : [];
  }),
);
