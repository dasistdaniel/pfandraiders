/**
 * Link-Vorschau (Social Preview) für WhatsApp, Facebook, Discord, Slack und Co.: Texte und Bild an einer Stelle.
 * Der Server baut daraus seine Vorschauseite (packages/server/src/socialPage.ts); die Spielseite
 * packages/client/index.html ist statisch und trägt dieselben Tags von Hand (ein Test prüft, dass sie passen).
 * Das Bild erzeugt scripts/generate-social-preview.mjs (npm run social).
 */
export const SOCIAL_PREVIEW = {
  siteName: 'PfandRaiders',
  title: 'PfandRaiders – Pfand sammeln, ausknocken, gewinnen',
  description:
    'Sammle Pfandflaschen, trickse Hunde und Polizei aus, schlag deine Gegner k.o. und kauf zwischen den Runden ein. ' +
    'Lokal zu viert oder online mit bis zu acht Leuten.',
  /** Öffentliche Adresse der Spielseite (GitHub Pages); der Server kann sie mit PAGE_URL ändern. */
  pageUrl: 'https://dasistdaniel.github.io/pfandraiders/',
  /** Bild relativ zur Seitenadresse (liegt in packages/client/public). */
  image: 'social-preview.png',
  imageWidth: 1200,
  imageHeight: 630,
  imageAlt: 'PfandRaiders-Logo in Pixelschrift, darunter: Pfand sammeln. Schlag zu. Gewinne. Lokal bis 4, online bis 8.',
  locale: 'de_DE',
} as const;

/** Maskiert Text für HTML-Inhalt und Attribute in doppelten Anführungszeichen. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Absolute Bildadresse zu einer Seitenadresse (mit Schrägstrich am Ende). */
export function socialImageUrl(pageUrl: string): string {
  return pageUrl + SOCIAL_PREVIEW.image;
}

/** Die Meta-Tags der Vorschau, eins pro Zeile, alle Werte maskiert. */
export function socialMetaTags(pageUrl: string): string {
  const s = SOCIAL_PREVIEW;
  const tag = (attr: 'name' | 'property', key: string, value: string): string =>
    `<meta ${attr}="${key}" content="${escapeHtml(value)}">`;
  return [
    tag('name', 'description', s.description),
    tag('property', 'og:type', 'website'),
    tag('property', 'og:site_name', s.siteName),
    tag('property', 'og:locale', s.locale),
    tag('property', 'og:url', pageUrl),
    tag('property', 'og:title', s.title),
    tag('property', 'og:description', s.description),
    tag('property', 'og:image', socialImageUrl(pageUrl)),
    tag('property', 'og:image:type', 'image/png'),
    tag('property', 'og:image:width', String(s.imageWidth)),
    tag('property', 'og:image:height', String(s.imageHeight)),
    tag('property', 'og:image:alt', s.imageAlt),
    tag('name', 'twitter:card', 'summary_large_image'),
    tag('name', 'twitter:title', s.title),
    tag('name', 'twitter:description', s.description),
    tag('name', 'twitter:image', socialImageUrl(pageUrl)),
  ].join('\n');
}
