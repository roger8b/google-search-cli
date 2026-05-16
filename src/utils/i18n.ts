// src/utils/i18n.ts
// Locale-aware UI labels. Google renders the search box, the AI Mode button,
// the "new conversation" affordance and consent buttons in the account/UI
// language. We derive the locale from the `hl=` query param of the configured
// Google URL and fall back to pt-BR (the historic default) when unknown.

export interface LocaleLabels {
  /** Accessibility name of the search combobox. */
  searchbox: string[];
  /** Visible text of the "AI Mode" entry button. */
  aiModeButton: string;
  /** Visible text of the "new conversation / new thread" button in AI Mode. */
  newThreadButton: string[];
  /** Visible text of the consent "accept" button. */
  consentAccept: string[];
  /**
   * Case-insensitive substrings that appear in the accessible name /
   * placeholder of the inline AI Mode follow-up input. Used to keep a
   * multi-turn conversation on the same page (chat-like) instead of
   * navigating to a fresh URL and losing the visible thread.
   */
  followUpInput: string[];
}

const LABELS: Record<string, LocaleLabels> = {
  'pt-BR': {
    searchbox: ['Pesquisar', 'Search'],
    aiModeButton: 'Modo IA',
    newThreadButton: ['Nova conversa', 'Novo chat', 'Limpar'],
    consentAccept: ['Aceitar tudo', 'Aceito', 'Concordo'],
    followUpInput: ['pergunt', 'acompanhamento', 'modo ia', 'mais alguma'],
  },
  'en-US': {
    searchbox: ['Search', 'Pesquisar'],
    aiModeButton: 'AI Mode',
    newThreadButton: ['New conversation', 'New chat', 'Clear'],
    consentAccept: ['Accept all', 'I agree', 'Accept'],
    followUpInput: ['ask', 'follow-up', 'follow up', 'anything'],
  },
  'es-ES': {
    searchbox: ['Buscar', 'Search'],
    aiModeButton: 'Modo de IA',
    newThreadButton: ['Nueva conversación', 'Nuevo chat', 'Borrar'],
    consentAccept: ['Aceptar todo', 'Acepto'],
    followUpInput: ['pregunt', 'seguimiento', 'algo más'],
  },
  'fr-FR': {
    searchbox: ['Rechercher', 'Search'],
    aiModeButton: 'Mode IA',
    newThreadButton: ['Nouvelle conversation', 'Effacer'],
    consentAccept: ['Tout accepter', "J'accepte"],
    followUpInput: ['poser', 'question', 'suivi'],
  },
};

const DEFAULT_LOCALE = 'pt-BR';

export function detectLocale(googleUrl: string): string {
  try {
    const u = new URL(googleUrl);
    const hl = u.searchParams.get('hl');
    if (!hl) return DEFAULT_LOCALE;
    if (LABELS[hl]) return hl;
    // Match by language prefix: "en" → "en-US", "pt" → "pt-BR".
    const lang = hl.split('-')[0].toLowerCase();
    const byPrefix = Object.keys(LABELS).find((k) => k.split('-')[0].toLowerCase() === lang);
    return byPrefix ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function getLabels(googleUrl: string): LocaleLabels {
  return LABELS[detectLocale(googleUrl)] ?? LABELS[DEFAULT_LOCALE];
}
