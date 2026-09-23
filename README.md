# Tate Harrison Media — Site Framework

A framework-first site built to be finished in **Adobe Dreamweaver's visual
UI**, not in code. It centers on a video/podcast episode series rather than
selling services. Plain HTML/CSS/minimal JS — no build step, no frameworks —
so every file opens and previews normally in Dreamweaver.

## Folder structure

```
/index.html          Home page
/episodes.html        Grid of all episodes
/about.html            About / bio page
/contact.html          Contact / subscribe page
/episodes/
    episode-001.html    Example filled-in episode
    episode-template.html  Blank starter — duplicate this for each new episode
/Templates/
    main.dwt            The Dreamweaver Template — nav, footer, <head> boilerplate
/css/style.css         One global stylesheet (all colors, fonts, layout)
/js/main.js            Tiny optional hero effect
/images/               Photos, thumbnails, logos (currently placeholder-*.svg)
/video/                Video files (currently empty)
/services/             The OLD service-sales site, self-contained, standalone
                        HTML/CSS/media — lives at tateharrisonmedia.com/services.
                        Not part of the Dreamweaver Template system above and
                        not linked from the main nav (see note below).
CNAME                  Custom domain for GitHub Pages (tateharrisonmedia.com)
```

### About /services

This is the old videography-services site (formerly
`tatehenryharrison-creator.github.io` / `www.harrisonmediallc.com`), copied in
as plain files so it keeps working at **tateharrisonmedia.com/services** even
after the new site goes live at the root domain. It's intentionally separate
from the Dreamweaver Template used everywhere else — it has its own inline
styles and nav, exactly as it did on the old domain. It's on purpose *not*
linked from the new site's main nav, since the redesign centers on the
episode series rather than service sales; it's still reachable by anyone with
the direct URL or an old bookmark/backlink.

## Colors & fonts

These match the real, current live design on
`tatehenryharrison-creator.github.io` (pulled from its GitHub repo directly —
an earlier pass at this framework used a months-stale local copy of that repo
and got the palette wrong; this has since been corrected sitewide):

- Fonts, self-hosted in `/fonts/` and loaded via `css/fonts.css`:
  **Cinzel** (h1/h2 titles), **EB Garamond** (nav, labels, subtext),
  **IM Fell English** (body copy)
- Page background: `#f5f4f0` (parchment/cream)
- Body text: `#1C1A14` (near-black); muted text `#635f51`; faint/secondary
  text `#a8a49c`
- Accent colors available but not yet used much: gold `#C9A84C`,
  blue-gray `#5C6E82`

All of this lives in `css/style.css`, organized into numbered sections
(nav, hero, episode cards, etc.) with plain hex values so Dreamweaver's
CSS Designer color-swatch picker works directly on every rule.

Note: `/services/` (see above) is **not** part of this palette — it's a
snapshot of the old site's *previous* dark/Inter look, copied before this
correction. It should eventually be redone from the live repo's current
`origin/main` if you want it to match the real current services site.

## How the Dreamweaver Template works

`Templates/main.dwt` holds everything that should be **identical on every
page**: the nav bar, the footer, the `<head>` boilerplate. Every page
(`index.html`, `episodes.html`, each episode page, etc.) is a Dreamweaver
**Template Instance** of it — that's what the `InstanceBeginEditable` /
`InstanceEndEditable` comments in each file mean.

- To change the nav or footer sitewide: open `Templates/main.dwt` in
  Dreamweaver, edit it, save. Dreamweaver will offer to **"Update Pages"**
  — say yes, and it rewrites every page automatically.
- To edit a single page's content: open that page directly and edit inside
  the editable region (the area between the `InstanceBeginEditable
  name="content"` / `InstanceEndEditable` comments). Everything outside
  that region is locked, so you can't accidentally break the nav/footer.

## Adding a new episode

1. In Dreamweaver's Files panel, duplicate `episodes/episode-template.html`
   and rename it (e.g. `episode-002.html`).
2. Open it, fill in the title, thumbnail, video/audio, and show notes
   inside the editable region.
3. Open `episodes.html` (and optionally `index.html`), copy one
   `<a class="episode-card">...</a>` block, and update its thumbnail,
   title, teaser text, and link to point at your new page.

## Adding real media

The `images/` and `video/` folders are currently placeholders
(`placeholder-*.svg`). Once you've picked which folder of old media you
want to bring over, tell Claude its name/location and it will help you
move the right files in and repoint the `<img>`/`<video>` tags — no need
to touch CSS.

---

## Setting this up in Dreamweaver

1. **Site menu → New Site...**
2. Site name: `Tate Harrison Media` (anything you like).
3. Local site folder: point it at this folder
   (`.../Harrison Media LLC/tateharrisonmedia`).
4. Click Save. Dreamweaver will scan the folder and recognize
   `Templates/main.dwt` automatically.
5. Open any page from the Files panel and start editing in Design or
   Live view.

Because links use **site-root-relative paths** (starting with `/`, e.g.
`/css/style.css`), pages work correctly no matter how deep they are in
folders (root pages vs. `/episodes/*.html`) — Dreamweaver just needs the
site root defined correctly in step 3 for previews/links to resolve.

## Connecting this repo to Claude Code

Point a Claude Code session at this folder instead of the old repo:

```bash
cd "/Users/tateharrison/Desktop/Harrison Media LLC/tateharrisonmedia"
claude
```

Any Claude session started from inside this folder will read and edit
these files. If you're continuing from a Claude Code session that's
still pointed at the old repo, ask it to switch its working directory
to this one.

## Publishing to GitHub Pages (tateharrisonmedia.com)

Dreamweaver edits files locally — it doesn't push to GitHub. After
editing in Dreamweaver, commit and push from a terminal (or a Git client
like GitHub Desktop):

```bash
cd "/Users/tateharrison/Desktop/Harrison Media LLC/tateharrisonmedia"
git add -A
git commit -m "Update site"
git push
```

One-time setup, when you're ready to go live:

1. Create a new **empty** repo on GitHub (e.g. `tateharrisonmedia`).
2. `git remote add origin <the new repo's URL>` then `git push -u origin main`.
3. In the GitHub repo → **Settings → Pages**, set the source to the `main`
   branch, root folder.
4. In your domain registrar's DNS settings for `tateharrisonmedia.com`,
   add the records GitHub's Pages docs specify (an `A`/`ALIAS` record for
   the apex domain, or a `CNAME` record if you use a `www` subdomain) —
   GitHub's Pages settings page will show you exactly what it's expecting
   once the `CNAME` file in this repo is detected.
5. The old site at `tatehenryharrison-creator.github.io` /
   `www.harrisonmediallc.com` keeps running untouched until you decide to
   retire it — this is a separate repo, nothing here affects it.
