import { NPC_SHEET_NAMES, npcSheetTexture, type NpcSheetName } from './textureKeys';

/** URLs der NPC-Bögen (Vite-Asset-Import) aus assets/npc, Schlüssel = Texturschlüssel (npc:dog-white, npc:officer, ...). */
const modules = import.meta.glob<string>('./assets/npc/*.png', { eager: true, query: '?url', import: 'default' });

/** Texturschlüssel aus dem Dateinamen (dog-white.png -> npc:dog-white), null für unbekannte Dateien. */
export function npcSheetKeyFromPath(path: string): string | null {
  const m = /([\w-]+)\.png$/.exec(path);
  if (!m || !(NPC_SHEET_NAMES as readonly string[]).includes(m[1])) return null;
  return npcSheetTexture(m[1] as NpcSheetName);
}

export const NPC_SHEET_URLS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(modules).flatMap(([path, url]) => {
    const key = npcSheetKeyFromPath(path);
    return key ? [[key, url]] : [];
  }),
);
