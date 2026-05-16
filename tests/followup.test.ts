import { describe, it, expect } from 'vitest';
import { findFollowUpInputRef } from '../src/agent-mode/index.js';
import { getLabels } from '../src/utils/i18n.js';

const ptThread = `
- main
  - heading "o que é python"
  - text "Python é uma linguagem..."
  - textbox "Pergunte mais alguma coisa" [ref=e91]
`;

const enThread = `
- main
  - heading "what is python"
  - textbox "Ask a follow-up" [ref=e77]
`;

const noInput = `
- main
  - heading "o que é python"
  - text "resposta..."
`;

describe('findFollowUpInputRef', () => {
  it('finds the pt-BR inline follow-up box', () => {
    const hints = getLabels('https://www.google.com/?hl=pt-BR').followUpInput;
    expect(findFollowUpInputRef(ptThread, hints)).toBe('e91');
  });

  it('finds the en-US inline follow-up box', () => {
    const hints = getLabels('https://www.google.com/?hl=en-US').followUpInput;
    expect(findFollowUpInputRef(enThread, hints)).toBe('e77');
  });

  it('returns null when no inline input is present (URL-nav fallback path)', () => {
    const hints = getLabels('https://www.google.com/?hl=pt-BR').followUpInput;
    expect(findFollowUpInputRef(noInput, hints)).toBeNull();
  });

  it('does not match the main search combobox as a follow-up input', () => {
    const hints = getLabels('https://www.google.com/?hl=pt-BR').followUpInput;
    const snap = '- combobox "Pesquisar" [ref=e42]';
    expect(findFollowUpInputRef(snap, hints)).toBeNull();
  });
});
