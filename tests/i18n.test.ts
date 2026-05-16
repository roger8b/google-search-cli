import { describe, it, expect } from 'vitest';
import { detectLocale, getLabels } from '../src/utils/i18n.js';

describe('detectLocale', () => {
  it('reads hl= from the Google URL', () => {
    expect(detectLocale('https://www.google.com/?hl=pt-BR')).toBe('pt-BR');
    expect(detectLocale('https://www.google.com/?hl=en-US')).toBe('en-US');
  });

  it('matches by language prefix when exact locale is unknown', () => {
    expect(detectLocale('https://www.google.com/?hl=en')).toBe('en-US');
    expect(detectLocale('https://www.google.com/?hl=pt')).toBe('pt-BR');
    expect(detectLocale('https://www.google.com/?hl=fr')).toBe('fr-FR');
  });

  it('falls back to pt-BR for missing/unknown/invalid', () => {
    expect(detectLocale('https://www.google.com/')).toBe('pt-BR');
    expect(detectLocale('https://www.google.com/?hl=zz')).toBe('pt-BR');
    expect(detectLocale('not a url')).toBe('pt-BR');
  });
});

describe('getLabels', () => {
  it('returns locale-specific UI strings', () => {
    expect(getLabels('https://www.google.com/?hl=en-US').aiModeButton).toBe('AI Mode');
    expect(getLabels('https://www.google.com/?hl=pt-BR').aiModeButton).toBe('Modo IA');
    expect(getLabels('https://www.google.com/?hl=en-US').searchbox).toContain('Search');
    expect(getLabels('https://www.google.com/?hl=pt-BR').consentAccept[0]).toBe('Aceitar tudo');
  });

  it('defaults to pt-BR labels', () => {
    expect(getLabels('https://www.google.com/').aiModeButton).toBe('Modo IA');
  });
});
