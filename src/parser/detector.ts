// src/parser/detector.ts
// Detection of CAPTCHA, blocking, and consent signals.

export interface DetectionResult {
  blocked: boolean;
  type: 'captcha' | 'unusual_traffic' | 'consent' | 'none';
}

export function detectBlocking(snapshot: string, title: string): DetectionResult {
  const combined = `${snapshot}\n${title}`;

  if (/tráfego incomum|unusual traffic/i.test(combined)) {
    return { blocked: true, type: 'unusual_traffic' };
  }

  if (/recaptcha|captcha/i.test(combined)) {
    return { blocked: true, type: 'captcha' };
  }

  // Soft block: consent / cookie wall standing between us and results.
  if (
    /consent\.google|before you continue to google|antes de (ir|continuar) para o google|antes de continuar a usar o google/i.test(
      combined,
    )
  ) {
    return { blocked: true, type: 'consent' };
  }

  return { blocked: false, type: 'none' };
}
