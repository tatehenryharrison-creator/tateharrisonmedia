# Tate Harrison Media — Site Framework

A framework-first site built to be finished in **Adobe Dreamweaver's visual
UI**, not in code. It centers on a video/podcast episode series rather than
selling services. Plain HTML/CSS/minimal JS — no build step, no frameworks —
so every file opens and previews normally in Dreamweaver.

## Folder structure

```
/index.html           Home page (shows the newest 3 episodes)
/episodes.html         The full list of episodes, newest first
/episode.html          Every episode's own page (filled in automatically — don't edit)
/about.html            About / bio page
/contact.html          Contact page
/Library/
    episodes.lbi        EVERY EPISODE LIVES HERE — the one file you edit to add episodes
/Templates/
    main.dwt            The Dreamweaver Template — nav, footer, mini-player, <head>
/css/style.css         One global stylesheet (all colors, fonts, layout)
/js/episodes.js         Builds the episode list and episode pages from the Library item
/js/player.js           The site-wide audio player (keeps playing across pages)
/js/main.js             Reserved for future site-wide JS (currently empty)
/images/               Photos and episode thumbnails
/audio/                Episode mp3 files
/video/                (unused — video lives on YouTube; you just paste the link)
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

## Adding an episode (the whole workflow)

You only ever edit **one file**: `Library/episodes.lbi`. The home page, the
Episodes list, and each episode's own page all read from it, so there is
nothing to copy between pages.

**Before your first episode — one-time Dreamweaver setting:** Site →
Manage Sites → edit this site → Advanced Settings → Local Info → set
*Links relative to* **Site Root**. (That way picking a file with the folder
icon always writes `/audio/episode-004.mp3`, which is what the site expects.)

1. **Drop your files in.** In the Files panel, drag the episode's mp3 into
   `audio/` and its thumbnail picture into `images/`.
2. **Open the Library item.** Assets panel → Library → double-click
   `episodes`. (Or open `Library/episodes.lbi` from the Files panel.)
3. **Copy the blank starter.** The first block is a NEW EPISODE STARTER with
   step-by-step instructions printed right on it. Click inside it, click the
   `<article>` tag at the bottom of the window (that selects the whole
   episode block), Copy, and Paste it just below. The starter never shows on
   the website, so you can reuse it every time.
4. **Fill in your copy** — it's all ordinary, visible text:
   - double-click the picture → choose the thumbnail
   - type the **episode number** (newest = highest number), **date**, **title**
   - type the **full description** — any length. The site shortens it to
     about 100 characters (finishing the word, then "…" and a "more" link)
     on the lists, and shows all of it on the episode's own page
   - click **Download audio** → Properties panel → Link → folder icon → pick
     the mp3 from `audio/`
   - click **Watch on YouTube** → Properties panel → Link → paste the video's
     address
   - type the **show notes** (optional — delete that block if you don't want
     any; they only show on the episode's own page)
5. **Save.** Dreamweaver asks to update pages that use the Library item —
   click **Update**. Done: the new episode is first in the list, on the home
   page, and has its own page.
6. Publish: commit and push (see "Publishing" below).

Good to know:

- **Order is automatic.** Episodes sort by number, highest first, wherever you
  paste them.
- **Unfinished entries are safe.** If an entry still has the `PASTE-...`
  placeholder for its audio, it shows without a play button; the same goes for
  the YouTube button. Nothing breaks.
- **To change or remove an episode,** edit or delete its block in the same
  Library file, save, and click Update.
- **Home page count:** the home page shows the newest 3. To change it, set
  `data-limit="3"` on the `<div id="episodeList">` in `index.html`.
- **"Watch the Latest Episode"** on the home page points at the newest
  episode by itself.
- **Each episode's own page** is `episode.html?ep=<audio file name>`, e.g.
  `episode.html?ep=episode-004`, filled in by `js/episodes.js`. Because it is
  one shared page, every episode shares the same social-media link preview.
- In the Library file's Design view the entries look plain/unstyled — that's
  normal (Library files can't carry the site's stylesheet). Open `episodes.html`
  in Live view to see them styled.

## The site-wide audio player

One audio player is built into every page (the dark bar at the bottom, hidden
until something plays), defined once in `Templates/main.dwt` and driven by
`js/player.js`. The play button on each episode's thumbnail is added by
`js/episodes.js` automatically — you never create or edit it.

**"Keeps playing across pages"** works by saving the playing episode and its
position in the browser's local storage, then picking it back up on the next
page. A full page navigation always interrupts audio for an instant — that's how
plain multi-page sites work; avoiding it would mean turning the site into a
single-page app — but the player resumes at the same spot automatically.
Browsers sometimes block that automatic resume (their "autoplay" rules); when
that happens the mini-player still appears, paused at the right spot, ready for
one click.

**Real audio files:** `audio/episode-001.mp3` and `episode-002.mp3` are short
*silent* placeholders so the player works end-to-end. Replace them (or delete
them along with the two sample entries) when you add real episodes.

## Adding real media

The `images/` folder still holds placeholders (`placeholder-*.svg`) for the
podcast cover art on the home page and the About photo. Swap those in
Dreamweaver the normal way — double-click the picture, choose the new file.
Episode thumbnails are chosen the same way inside the Library item (see
"Adding an episode").

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
