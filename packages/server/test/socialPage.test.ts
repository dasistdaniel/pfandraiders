import { SOCIAL_PREVIEW, socialMetaTags } from '@pfandraiders/core';
import { describe, expect, it } from 'vitest';
import { socialPageHtml } from '../src/socialPage';

describe('socialPageHtml', () => {
  const page = 'https://spiel.example/pfand/';
  const html = socialPageHtml(page);

  it('is a small German HTML page with all preview tags', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="de">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain(socialMetaTags(page));
    expect(html).toContain('<title>PfandRaiders – Pfand sammeln, ausknocken, gewinnen</title>');
    expect(Buffer.byteLength(html)).toBeLessThan(4096);
  });

  it('forwards people to the game page and links it visibly', () => {
    expect(html).toContain(`<meta http-equiv="refresh" content="0; url=${page}">`);
    expect(html).toContain(`<link rel="canonical" href="${page}">`);
    expect(html).toContain(`<a href="${page}">Zum Spiel</a>`);
    expect(html).not.toContain('<script');
  });

  it('escapes the page address everywhere', () => {
    const evil = socialPageHtml(`https://x.example/"><script>alert('x')</script>&/`);
    expect(evil).not.toContain('<script');
    expect(evil).not.toContain(`"><`);
    expect(evil).toContain('https://x.example/&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;/');
  });

  it('uses the shared description text', () => {
    expect(html).toContain(`<p>${SOCIAL_PREVIEW.description}</p>`);
  });
});
