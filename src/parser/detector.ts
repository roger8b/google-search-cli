// src/parser/detector.ts
// Detection of CAPTCHA and blocking signals.

export interface DetectionResult {
  blocked: boolean;
  type: 'captcha' | 'unusual_traffic' | 'none';
}

export function detectBlocking(snapshot: string, title: string): DetectionResult {
  const combined = `${snapshot}\n${title}`;

  if (/tráfego incomum|unusual traffic/i.test(combined)) {
    return { blocked: true, type: 'unusual_traffic' };
  }

  if (/recaptcha|captcha/i.test(combined)) {
    return { blocked: true, type: 'captcha' };
  }

  return { blocked: false, type: 'none' };
}