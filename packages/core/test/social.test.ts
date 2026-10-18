import { describe, expect, it } from 'vitest';
import { SOCIAL_PREVIEW, escapeHtml, socialImageUrl, socialMetaTags } from '../src/social';

describe('SOCIAL_PREVIEW', () => {
  it('hat kurze Texte für Link-Vorschauen', () => {
    expect(SOCIAL_PREVIEW.title).toContain('PfandRaiders');
    expect(SOCIAL_PREVIEW.title.length).toBeLessThanOrEqual(60);
    expect(SOCIAL_PREVIEW.description.length).toBeGreaterThan(50);
    expect(SOCIAL_PREVIEW.description.length).toBeLessThanOrEqual(200);
    expect(SOCIAL_PREVIEW.pageUrl).toBe('https://dasistdaniel.github.io/pfandraiders/');
    expect(SOCIAL_PREVIEW.image).toBe('social-preview.png');
    expect(SOCIAL_PREVIEW.imageWidth).toBe(1200);
    expect(SOCIAL_PREVIEW.imageHeight).toBe(630);
  });
});

describe('escapeHtml', () => {
  it('maskiert die fünf HTML-Sonderzeichen', () => {
    expect(escapeHtml(`a"b'c<d>e&f`)).toBe('a&quot;b&#39;c&lt;d&gt;e&amp;f');
  });
});

describe('socialImageUrl', () => {
  it('hängt das Bild an die Seitenadresse', () => {
    expect(socialImageUrl('https://x.example/spiel/')).toBe('https://x.example/spiel/social-preview.png');
  });
});

describe('socialMetaTags', () => {
  const tags = socialMetaTags('https://x.example/spiel/');
  it('enthält Open Graph, Twitter und Beschreibung mit absoluten Adressen', () => {
    expect(tags).toContain('<meta property="og:type" content="website">');
    expect(tags).toContain('<meta property="og:url" content="https://x.example/spiel/">');
    expect(tags).toContain('<meta property="og:image" content="https://x.example/spiel/social-preview.png">');
    expect(tags).toContain('<meta property="og:image:width" content="1200">');
    expect(tags).toContain('<meta property="og:image:height" content="630">');
    expect(tags).toContain('<meta property="og:image:type" content="image/png">');
    expect(tags).toContain('<meta property="og:locale" content="de_DE">');
    expect(tags).toContain('<meta property="og:site_name" content="PfandRaiders">');
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(tags).toContain(`<meta name="description" content="${escapeHtml(SOCIAL_PREVIEW.description)}">`);
    expect(tags).toContain(`<meta property="og:title" content="${escapeHtml(SOCIAL_PREVIEW.title)}">`);
  });
  it('maskiert die Seitenadresse', () => {
    const evil = socialMetaTags('https://x.example/"><script>alert(1)</script>/');
    expect(evil).not.toContain('<script>');
    expect(evil).toContain('&quot;&gt;&lt;script&gt;');
  });
});
