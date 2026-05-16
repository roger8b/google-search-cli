// src/parser/links.ts
// Search result link extraction.

import { runMaybe } from '../browser/agent.js';

export interface SearchLink {
  title: string;
  url: string;
  snippet?: string;
}

function parseEvalJson(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) return null;

  const first = JSON.parse(trimmed);
  if (typeof first === 'string') {
    return JSON.parse(first);
  }

  return first;
}

// Eval JS extrai title + snippet do container ancestor de cada result (h3 + descricao).
// Sobe ate 5 niveis procurando container com texto util alem do titulo.
// Filtra anuncios: ancestor com data-text-ad ou aria-label de anuncio em
// EN/PT/ES/FR (Sponsored, Ad, Anúncio/Anuncio, Publicidade, Patrocinado,
// Annonce, Sponsorisé, Publicité).
const EXTRACT_JS = `JSON.stringify(Array.from(document.querySelectorAll("a[href]")).filter(a => a.querySelector("h3")).filter(a => {
  let n = a;
  for (let i = 0; i < 6 && n; i++) {
    if (n.hasAttribute) {
      if (n.hasAttribute("data-text-ad")) return false;
      const al = n.getAttribute("aria-label") || "";
      if (/^(sponsored|sponsoris[ée]+|ad|an[uú]ncio|annonce|patrocinad[oa]|publicidad[e]?|publicit[ée])$/i.test(al.trim())) return false;
    }
    n = n.parentElement;
  }
  return true;
}).map(a => {
  const h3 = a.querySelector("h3");
  const title = ((h3 && h3.innerText) || "").trim();
  let container = a.parentElement;
  for (let i = 0; i < 5 && container; i++) {
    const txt = ((container.innerText || "").replace(title, "")).trim();
    if (txt.length > 60) break;
    container = container.parentElement;
  }
  const fullText = ((container && container.innerText) || "").trim();
  let snippet = fullText.split(/\\r?\\n/).map(l => l.trim()).filter(l => l && l !== title && l.length > 25).join(" ").trim();
  if (snippet.length > 300) snippet = snippet.substring(0, 300);
  return {href: a.href, text: (a.innerText || a.textContent || "").trim(), title, snippet};
}))`;

export function extractSearchLinks(
  bin: string,
  port: number,
  maxLinks: number
): SearchLink[] {
  const raw = runMaybe(bin, ['--cdp', String(port), 'eval', EXTRACT_JS], port);

  const parsed = parseEvalJson(raw);
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const links: SearchLink[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as { href?: unknown; text?: unknown; title?: unknown; snippet?: unknown };
    const href = typeof candidate.href === 'string' ? candidate.href.trim() : '';
    const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
    const explicitTitle = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const snippet = typeof candidate.snippet === 'string' ? candidate.snippet.trim() : '';
    const title = explicitTitle || text.split(/\r?\n/)[0]?.trim() || href;

    if (!href || !title) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const link: SearchLink = { title, url: href };
    if (snippet) link.snippet = snippet;
    links.push(link);

    if (links.length >= maxLinks) break;
  }

  return links;
}

export function formatNumberedLinks(links: SearchLink[]): string {
  return links
    .map((link, index) => {
      const head = `${index + 1}. ${link.title} — ${link.url}`;
      return link.snippet ? `${head}\n   ${link.snippet}` : head;
    })
    .join('\n');
}