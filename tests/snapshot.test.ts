import { describe, it, expect } from 'vitest';
import { findSearchBoxInSnapshot } from '../src/search/snapshot.js';

const ptSnapshot = `
- banner
  - combobox "Pesquisar" [ref=e42]
  - button "Pesquisa Google" [ref=e51]
`;

const enSnapshot = `
- banner
  - combobox "Search" [ref=e7]
`;

describe('findSearchBoxInSnapshot', () => {
  it('finds the pt-BR combobox by default', () => {
    expect(findSearchBoxInSnapshot(ptSnapshot)).toBe('e42');
  });

  it('finds the en-US combobox when given en labels', () => {
    expect(findSearchBoxInSnapshot(enSnapshot, ['Search', 'Pesquisar'])).toBe('e7');
  });

  it('still matches the secondary label in the list', () => {
    expect(findSearchBoxInSnapshot(ptSnapshot, ['Search', 'Pesquisar'])).toBe('e42');
  });

  it('returns null when no combobox is present', () => {
    expect(findSearchBoxInSnapshot('- button "Foo" [ref=e1]', ['Search'])).toBeNull();
  });
});
