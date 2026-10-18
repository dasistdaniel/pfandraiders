import { escapeHtml, SOCIAL_PREVIEW, socialMetaTags } from '@pfandraiders/core';

/**
 * Vorschauseite für normale HTTP-Anfragen an die Serveradresse (etwa wenn jemand den Link des Servers in WhatsApp
 * teilt): dieselben Open-Graph-Tags wie die Spielseite, Bild von der Spielseite, und eine sofortige Weiterleitung
 * dorthin. Crawler folgen der Meta-Weiterleitung nicht und lesen die Tags dieser Seite; ohne JavaScript nutzbar.
 */
export function socialPageHtml(pageUrl: string): string {
  const s = SOCIAL_PREVIEW;
  const url = escapeHtml(pageUrl);
  return [
    '<!doctype html>',
    '<html lang="de">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(s.title)}</title>`,
    socialMetaTags(pageUrl),
    '<meta name="theme-color" content="#111111">',
    `<link rel="canonical" href="${url}">`,
    `<meta http-equiv="refresh" content="0; url=${url}">`,
    '<style>body{margin:0;padding:2rem;background:#111;color:#fff6d6;font:1.1rem/1.5 sans-serif;text-align:center}' +
      'a{color:#ffca28}</style>',
    '</head>',
    '<body>',
    `<h1>${escapeHtml(s.siteName)}</h1>`,
    `<p>${escapeHtml(s.description)}</p>`,
    `<p><a href="${url}">Zum Spiel</a></p>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
