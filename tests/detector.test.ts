import { describe, it, expect } from 'vitest';
import { detectBlocking } from '../src/parser/detector.js';

describe('detectBlocking', () => {
  it('flags unusual traffic', () => {
    expect(detectBlocking('detectamos tráfego incomum da sua rede', '')).toEqual({
      blocked: true,
      type: 'unusual_traffic',
    });
    expect(detectBlocking('', 'unusual traffic detected').type).toBe('unusual_traffic');
  });

  it('flags captcha / recaptcha', () => {
    expect(detectBlocking('please complete the reCAPTCHA', '').type).toBe('captcha');
    expect(detectBlocking('resolva o captcha', '').type).toBe('captcha');
  });

  it('flags consent / cookie walls as a soft block', () => {
    expect(detectBlocking('Before you continue to Google', '').type).toBe('consent');
    expect(detectBlocking('Antes de ir para o Google', '').type).toBe('consent');
    expect(detectBlocking('redirect to consent.google.com', '').type).toBe('consent');
  });

  it('returns none for a normal SERP', () => {
    expect(detectBlocking('About 1,230,000 results', 'cats - Google Search')).toEqual({
      blocked: false,
      type: 'none',
    });
  });

  it('prioritizes hard blocks over consent', () => {
    expect(detectBlocking('unusual traffic. consent.google.com', '').type).toBe('unusual_traffic');
  });
});
