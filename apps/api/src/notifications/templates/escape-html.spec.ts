import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escape-html.js';

describe('escapeHtml', () => {
  it('escapes the five special characters', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('leaves a plain text unchanged', () => {
    expect(escapeHtml('Anna Rossi')).toBe('Anna Rossi');
  });

  it('does not escape twice an entity typed by the user', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('returns an empty string for an empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});
