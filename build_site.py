#!/usr/bin/env python3
"""Genera `index.html`, la pagina statica della rassegna, a partire dai file Markdown.

Lo script non ha dipendenze esterne: legge le edizioni elencate in `EDITIONS`,
ne estrae titolo, data e notizie e produce una singola pagina HTML autonoma
(CSS e JavaScript inclusi) pubblicabile con GitHub Pages.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python < 3.9
    ZoneInfo = None

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "index.html"
REPO_URL = "https://github.com/mauro-midolo/italian_news"

EDITIONS = [
    {"slug": "globale", "icon": "🌍", "label": "Globale", "file": "news_global.md"},
    {
        "slug": "san-lazzaro",
        "icon": "📍",
        "label": "San Lazzaro di Savena",
        "file": "news_san_lazzaro_di_savena.md",
    },
]

LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
SOURCE_RE = re.compile(r"^Fonte:\s*(.+)$", re.IGNORECASE)


@dataclass
class Story:
    section: str
    title: str
    paragraphs: list[str] = field(default_factory=list)
    source_label: str = ""
    source_url: str = ""


@dataclass
class Edition:
    slug: str
    icon: str
    label: str
    title: str
    date: str
    stories: list[Story]
    disclaimer: str


def strip_inline_markdown(text: str) -> str:
    """Rimuove la formattazione inline (link, grassetto, corsivo) da una riga."""
    text = LINK_RE.sub(r"\1", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    return text.strip()


def split_section(heading: str) -> tuple[str, str]:
    """Separa l'eventuale prefisso di sezione ("Politica: ...") dal titolo."""
    if ":" in heading:
        candidate, rest = heading.split(":", 1)
        if rest.strip() and len(candidate) <= 40 and "http" not in candidate:
            title = rest.strip()
            # Il prefisso di sezione finisce nel chip: il titolo residuo
            # ("prorogati di altri...") riparte quindi dalla maiuscola.
            return candidate.strip(), title[:1].upper() + title[1:]
    return "", heading.strip()


def split_title_and_date(heading: str) -> tuple[str, str]:
    """Separa il titolo dell'edizione dalla data ("Rassegna – Lunedì 31 agosto 2026")."""
    for separator in ("–", "—", " - "):
        if separator in heading:
            title, date = heading.split(separator, 1)
            return title.strip(), date.strip()
    return heading.strip(), ""


def parse_edition(config: dict) -> Edition | None:
    path = ROOT / config["file"]
    if not path.exists():
        return None

    lines = path.read_text(encoding="utf-8").splitlines()
    heading = ""
    disclaimer = ""
    stories: list[Story] = []
    current: Story | None = None
    after_rule = False

    for raw in lines:
        line = raw.strip()

        if line.startswith("# ") and not heading:
            heading = line[2:].strip()
            continue

        if set(line) == {"-"} and len(line) >= 3:
            after_rule = True
            current = None
            continue

        if line.startswith("### "):
            after_rule = False
            section, title = split_section(strip_inline_markdown(line[4:]))
            current = Story(section=section, title=title)
            stories.append(current)
            continue

        if not line:
            continue

        if after_rule:
            disclaimer = strip_inline_markdown(line)
            continue

        if current is None:
            continue

        source = SOURCE_RE.match(line)
        if source:
            match = LINK_RE.search(source.group(1))
            if match:
                current.source_label = match.group(1).strip()
                current.source_url = match.group(2).strip()
            else:
                current.source_label = strip_inline_markdown(source.group(1))
            continue

        current.paragraphs.append(line)

    title, date = split_title_and_date(heading)
    return Edition(
        slug=config["slug"],
        icon=config["icon"],
        label=config["label"],
        title=title or config["label"],
        date=date,
        stories=stories,
        disclaimer=disclaimer,
    )


def render_paragraph(text: str) -> str:
    """Converte i link Markdown di un paragrafo in ancore HTML."""
    parts: list[str] = []
    cursor = 0
    for match in LINK_RE.finditer(text):
        parts.append(html.escape(text[cursor : match.start()]))
        label = html.escape(match.group(1))
        url = html.escape(match.group(2), quote=True)
        parts.append(f'<a href="{url}" target="_blank" rel="noopener">{label}</a>')
        cursor = match.end()
    parts.append(html.escape(text[cursor:]))
    rendered = "".join(parts)
    rendered = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", rendered)
    rendered = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", rendered)
    return rendered


def render_story(story: Story) -> str:
    chip = ""
    if story.section:
        chip = (
            f'<span class="chip" data-section="{html.escape(story.section, quote=True)}">'
            f"{html.escape(story.section)}</span>"
        )

    body = "\n".join(
        f"<p>{render_paragraph(paragraph)}</p>" for paragraph in story.paragraphs
    )

    source = ""
    if story.source_url:
        source = (
            '<p class="source">Fonte: '
            f'<a href="{html.escape(story.source_url, quote=True)}" target="_blank" rel="noopener">'
            f"{html.escape(story.source_label or story.source_url)}</a></p>"
        )
    elif story.source_label:
        source = f'<p class="source">Fonte: {html.escape(story.source_label)}</p>'

    return f"""        <article class="story" data-section="{html.escape(story.section, quote=True)}">
          {chip}
          <h3>{html.escape(story.title)}</h3>
          {body}
          {source}
        </article>"""


def render_edition(edition: Edition, index: int) -> str:
    sections: list[str] = []
    for story in edition.stories:
        if story.section and story.section not in sections:
            sections.append(story.section)

    filters = ""
    if len(sections) > 1:
        buttons = "\n".join(
            f'            <button type="button" class="filter" '
            f'data-filter="{html.escape(section, quote=True)}">{html.escape(section)}</button>'
            for section in sections
        )
        filters = f"""        <div class="filters" role="group" aria-label="Filtra per sezione">
            <button type="button" class="filter is-active" data-filter="*">Tutte</button>
{buttons}
        </div>"""

    if edition.stories:
        stories_html = "\n".join(render_story(story) for story in edition.stories)
        count = len(edition.stories)
        count_label = "1 notizia" if count == 1 else f"{count} notizie"
    else:
        stories_html = '        <p class="empty">Nessuna notizia disponibile per questa edizione.</p>'
        count_label = "nessuna notizia"

    hidden = "" if index == 0 else " hidden"
    date = f'<p class="edition-date">{html.escape(edition.date)}</p>' if edition.date else ""

    return f"""      <section class="edition" id="edizione-{edition.slug}" data-edition="{edition.slug}"{hidden}>
        <header class="edition-header">
          <h2>{edition.icon} {html.escape(edition.title)}</h2>
          {date}
          <p class="count">{count_label}</p>
        </header>
{filters}
        <div class="stories">
{stories_html}
        </div>
      </section>"""


CSS = """
:root {
  color-scheme: light dark;
  --bg: #f5f6f8;
  --surface: #ffffff;
  --border: #e2e5ea;
  --text: #16181d;
  --muted: #5f6672;
  --accent: #0b7a3b;
  --accent-soft: #e6f2ea;
  --shadow: 0 1px 2px rgba(16, 20, 28, .06), 0 8px 24px rgba(16, 20, 28, .05);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101317;
    --surface: #181c22;
    --border: #262c35;
    --text: #e8eaee;
    --muted: #99a1ae;
    --accent: #4ec27d;
    --accent-soft: #17301f;
    --shadow: none;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
}

.wrap { max-width: 820px; margin: 0 auto; padding: 32px 20px 64px; }

.masthead { text-align: center; margin-bottom: 28px; }
.masthead h1 { margin: 0; font-size: 2rem; letter-spacing: -.02em; }
.masthead .tagline { margin: 8px 0 0; color: var(--muted); }
.masthead .updated { margin: 4px 0 0; color: var(--muted); font-size: .85rem; }

.tabs {
  display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
  margin: 24px 0 28px;
}
.tab {
  font: inherit; cursor: pointer;
  padding: 9px 18px; border-radius: 999px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
}
.tab:hover { border-color: var(--accent); }
.tab.is-active { background: var(--accent); border-color: var(--accent); color: #fff; }

.edition-header { margin-bottom: 16px; }
.edition-header h2 { margin: 0; font-size: 1.35rem; }
.edition-date { margin: 4px 0 0; color: var(--muted); }
.count { margin: 2px 0 0; color: var(--muted); font-size: .85rem; }

.filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
.filter {
  font: inherit; font-size: .82rem; cursor: pointer;
  padding: 5px 12px; border-radius: 999px;
  border: 1px solid var(--border); background: transparent; color: var(--muted);
}
.filter:hover { color: var(--text); border-color: var(--accent); }
.filter.is-active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }

.stories { display: flex; flex-direction: column; gap: 16px; }

.story {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 22px;
  box-shadow: var(--shadow);
}
.story h3 { margin: 8px 0 10px; font-size: 1.08rem; line-height: 1.4; }
.story p { margin: 0 0 10px; }
.story p:last-child { margin-bottom: 0; }

.chip {
  display: inline-block; font-size: .72rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: .04em;
  color: var(--accent); background: var(--accent-soft);
  padding: 3px 9px; border-radius: 999px;
}

.source { font-size: .88rem; color: var(--muted); }
.empty { color: var(--muted); }

a { color: var(--accent); }
a:hover { text-decoration: none; }

.disclaimer {
  margin-top: 32px; padding: 16px 18px;
  border: 1px dashed var(--border); border-radius: 12px;
  color: var(--muted); font-size: .88rem;
}
.disclaimer p { margin: 0 0 8px; }
.disclaimer p:last-child { margin-bottom: 0; }

footer { margin-top: 28px; text-align: center; color: var(--muted); font-size: .85rem; }

@media (max-width: 540px) {
  .wrap { padding: 24px 14px 48px; }
  .masthead h1 { font-size: 1.6rem; }
  .story { padding: 16px; }
}
"""

JS = """
document.querySelectorAll('.tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    var target = tab.dataset.target;
    document.querySelectorAll('.tab').forEach(function (other) {
      other.classList.toggle('is-active', other === tab);
      other.setAttribute('aria-selected', String(other === tab));
    });
    document.querySelectorAll('.edition').forEach(function (edition) {
      edition.hidden = edition.dataset.edition !== target;
    });
    if (history.replaceState) {
      history.replaceState(null, '', '#edizione-' + target);
    }
  });
});

document.querySelectorAll('.filters').forEach(function (group) {
  var edition = group.closest('.edition');
  group.addEventListener('click', function (event) {
    var button = event.target.closest('.filter');
    if (!button) { return; }
    var value = button.dataset.filter;
    group.querySelectorAll('.filter').forEach(function (other) {
      other.classList.toggle('is-active', other === button);
    });
    edition.querySelectorAll('.story').forEach(function (story) {
      story.hidden = value !== '*' && story.dataset.section !== value;
    });
  });
});

var hash = window.location.hash.replace('#edizione-', '');
if (hash) {
  var initial = document.querySelector('.tab[data-target="' + CSS.escape(hash) + '"]');
  if (initial) { initial.click(); }
}
"""


def build() -> str:
    editions = [
        edition
        for edition in (parse_edition(config) for config in EDITIONS)
        if edition is not None
    ]

    tabs = "\n".join(
        f'        <button type="button" class="tab{" is-active" if i == 0 else ""}" '
        f'role="tab" aria-selected="{"true" if i == 0 else "false"}" '
        f'data-target="{edition.slug}">{edition.icon} {html.escape(edition.label)}</button>'
        for i, edition in enumerate(editions)
    )

    body = "\n".join(render_edition(edition, i) for i, edition in enumerate(editions))

    disclaimers = [e.disclaimer for e in editions if e.disclaimer]
    disclaimer = disclaimers[0] if disclaimers else (
        "Questa rassegna è generata automaticamente da un'intelligenza artificiale "
        "e non è verificata da un redattore umano."
    )

    latest_date = next((e.date for e in editions if e.date), "")
    # "Lunedì 31 agosto 2026" -> "lunedì 31 agosto 2026", per leggere
    # naturalmente dopo "Edizione di".
    if latest_date:
        latest_date = latest_date[:1].lower() + latest_date[1:]
    now = datetime.now(ZoneInfo("Europe/Rome")) if ZoneInfo else datetime.now()
    generated = now.strftime("%d/%m/%Y alle %H:%M")

    return f"""<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Italian News – Rassegna stampa quotidiana</title>
<meta name="description" content="Rassegna stampa quotidiana generata automaticamente da un'intelligenza artificiale: edizione globale ed edizione locale di San Lazzaro di Savena.">
<meta name="generator" content="build_site.py">
<meta property="og:title" content="Italian News – Rassegna stampa quotidiana">
<meta property="og:description" content="Le notizie del giorno, edizione globale e locale, generate automaticamente da un'AI.">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><text y='14' font-size='14'>📰</text></svg>">
<style>{CSS}</style>
</head>
<body>
  <div class="wrap">
    <header class="masthead">
      <h1>🇮🇹 Italian News</h1>
      <p class="tagline">Rassegna stampa quotidiana generata da un'intelligenza artificiale</p>
      <p class="updated">Edizione di {html.escape(latest_date) if latest_date else "oggi"} · pagina generata il {generated}</p>
    </header>

    <nav class="tabs" role="tablist" aria-label="Edizioni">
{tabs}
    </nav>

    <main>
{body}
    </main>

    <aside class="disclaimer">
      <p>{html.escape(disclaimer)}</p>
      <p>Verifica sempre le notizie sulle fonti originali. I diritti sui contenuti
      restano dei rispettivi editori: qui sono presenti solo sintesi e rimandi.</p>
    </aside>

    <footer>
      <p>Realizzato da <a href="https://github.com/mauro-midolo">Mauro Midolo</a> ·
      <a href="{REPO_URL}">codice sorgente</a> ·
      <a href="{REPO_URL}/commits/main">archivio delle edizioni</a></p>
    </footer>
  </div>
<script>{JS}</script>
</body>
</html>
"""


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(f"Scritto {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
