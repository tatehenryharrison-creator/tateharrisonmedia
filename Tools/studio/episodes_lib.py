"""Reads and writes the episode Library item (Library/episodes.lbi) and keeps the
pages that embed it in sync -- the same job Dreamweaver's "Update Pages" does,
plus the fiddly file work (naming, thumbnail sizing, audio size) that normally
takes technical know-how."""
import datetime
import email.utils
import html
import os
import re
import shutil
import subprocess
from xml.sax.saxutils import escape as xml_escape

LIB_PATH = "Library/episodes.lbi"
PAGES = ["index.html", "episodes.html", "episode.html"]

ARTICLE_RE = re.compile(r'<article class="episode-entry(?P<extra>[^"]*)">.*?</article>', re.S)
LIB_BLOCK_RE = re.compile(
    r'(<!-- #BeginLibraryItem "/Library/episodes\.lbi" -->\n).*?(\n<!-- #EndLibraryItem -->)', re.S)

AUDIO_EXTS = {".mp3", ".m4a", ".wav", ".aac"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif", ".tif", ".tiff"}

# GitHub refuses any single file over 100 MB (and warns above 50 MB).
AUDIO_LIMIT = 90 * 1024 * 1024


def slug(text):
    return re.sub(r"(^-+|-+$)", "", re.sub(r"[^a-z0-9]+", "-", (text or "").lower()))


def esc(text):
    return html.escape(text or "", quote=False)


def clean(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", text or ""))).strip()


def is_real_link(href):
    return bool(href) and href != "#" and not re.search(r"PASTE|REPLACE", href, re.I)


# ---------------------------------------------------------------- reading --

def read_library(root):
    with open(os.path.join(root, LIB_PATH), encoding="utf-8") as fh:
        return fh.read()


def write_library(root, text):
    with open(os.path.join(root, LIB_PATH), "w", encoding="utf-8") as fh:
        fh.write(text)


def _token(css_class):
    """Match a whole class name, so "episode-number" doesn't also match "episode-number-line"."""
    return r"(?<![\w-])%s(?![\w-])" % re.escape(css_class)


def _attr_of(block, css_class, attr):
    tag = re.search(r'<[a-z0-9]+\b[^>]*\bclass="[^"]*%s[^"]*"[^>]*>' % _token(css_class), block)
    if not tag:
        return ""
    found = re.search(r'\b%s="([^"]*)"' % attr, tag.group(0))
    return html.unescape(found.group(1)) if found else ""


def _inner(block, css_class):
    found = re.search(r'class="[^"]*%s[^"]*"[^>]*>(.*?)</' % _token(css_class), block, re.S)
    return clean(found.group(1)) if found else ""


def parse_entries(text):
    """Every entry (including the hidden blank starter), in file order.

    The id is worked out exactly the way js/episodes.js does it, so the tool and
    the website always agree about which episode is which."""
    entries = []
    for index, match in enumerate(ARTICLE_RE.finditer(text)):
        block = match.group(0)
        number_text = _inner(block, "episode-number")
        number = int(number_text) if number_text.isdigit() else None
        audio = _attr_of(block, "episode-audio", "href")
        has_audio = is_real_link(audio)
        file_name = os.path.splitext(os.path.basename(audio.split("#")[0].split("?")[0]))[0] if has_audio else ""
        entry_id = slug(file_name) or ("episode-%d" % number if number is not None else "episode-%d" % (index + 1))
        entries.append({
            "id": entry_id,
            "number": number,
            "title": _inner(block, "episode-title"),
            "date": _inner(block, "episode-date"),
            "audio": audio if has_audio else "",
            "thumb": _attr_of(block, "episode-thumb", "src"),
            "blank": "episode-entry-blank" in match.group("extra"),
            "start": match.start(),
            "end": match.end(),
        })
    return entries


def list_episodes(text):
    found = [e for e in parse_entries(text) if not e["blank"]]
    found.sort(key=lambda e: (-(e["number"] if e["number"] is not None else -1), e["start"]))
    return found


def next_number(text):
    numbers = [e["number"] for e in list_episodes(text) if e["number"] is not None]
    return (max(numbers) + 1) if numbers else 1


# ---------------------------------------------------------------- writing --

def build_article(f):
    """One finished, plain-text entry -- the same markup an author would type
    into the Library item by hand."""
    number = int(f["number"])
    title = esc(f["title"].strip())

    line = 'Episode <span class="episode-number">%d</span>' % number
    if f.get("date"):
        line += ' &bull; <span class="episode-date">%s</span>' % esc(f["date"].strip())
    if f.get("length"):
        line += ' &bull; <span class="episode-length">%s</span>' % esc(f["length"].strip())

    description = esc(re.sub(r"\s+", " ", f["description"]).strip())

    links = []
    if f.get("youtube"):
        links.append('<a class="btn-youtube" href="%s">Watch on YouTube</a>' % html.escape(f["youtube"].strip(), quote=True))
    if f.get("audio_path"):
        links.append('<a class="episode-audio" href="%s">Download audio</a>' % html.escape(f["audio_path"], quote=True))

    thumb = f.get("thumb_path") or "/images/placeholder-thumb.svg"
    out = [
        '<article class="episode-entry">',
        '    <div class="episode-entry-thumb">',
        '        <img class="episode-thumb" src="%s" width="320" loading="lazy" decoding="async" alt="Thumbnail for %s">' % (
            html.escape(thumb, quote=True), html.escape(f["title"].strip(), quote=True)),
        '    </div>',
        '    <div class="episode-entry-body">',
        '        <p class="episode-number-line">%s</p>' % line,
        '        <h3 class="episode-title">%s</h3>' % title,
    ]
    if f.get("guest"):
        out.append('        <p class="episode-guest">%s</p>' % esc(f["guest"].strip()))
    out.append('        <p class="episode-desc">%s</p>' % description)
    if links:
        out.append('        <p class="episode-links">%s</p>' % " ".join(links))

    notes = [p.strip() for p in re.split(r"\n\s*\n", (f.get("notes") or "").strip()) if p.strip()]
    if notes:
        out.append('        <div class="episode-notes">')
        out.append('            <h4>Show Notes</h4>')
        for para in notes:
            out.append('            <p>%s</p>' % esc(para).replace("\n", "<br>\n"))
        out.append('        </div>')

    out.append('    </div>')
    out.append('</article>')
    return "\n".join(out)


def _has_markup(fragment):
    """True if the fragment holds formatting (links, bold...) that rewriting it from plain
    fields would lose. A line break is fine."""
    return bool(re.search(r"<(?!/?br\b)[a-z]", fragment or "", re.I))


def _plain(fragment):
    """Text with line breaks kept as new lines and everything else tidied."""
    lines = re.sub(r"<br\s*/?>", "\n", fragment or "", flags=re.I)
    lines = html.unescape(re.sub(r"<[^>]+>", "", lines))
    return "\n".join(re.sub(r"[ \t\r\f\v]+", " ", line).strip() for line in lines.split("\n")).strip()


def _raw(block, tag, css_class):
    found = re.search(r'<%s\b[^>]*class="[^"]*%s[^"]*"[^>]*>(.*?)</%s>' % (tag, _token(css_class), tag), block, re.S)
    return found.group(1) if found else None


def _words(block):
    """The visible words of an entry, minus the labels the tool itself writes."""
    text = clean(re.sub(r"<br\s*/?>", " ", block))
    for label in ("Watch on YouTube", "Download audio", "Show Notes", "Episode", "•"):
        text = text.replace(label, " ")
    return text.split()


def read_fields(block):
    """Pull an entry apart into the same plain fields the Studio form uses.

    "editable" says whether it is safe to write the entry back from those fields.
    Anything with extra formatting is left for Dreamweaver, so editing in the Studio
    can never quietly drop a link or a bold word."""
    audio = _attr_of(block, "episode-audio", "href")
    youtube = _attr_of(block, "btn-youtube", "href")
    notes_div = re.search(r'<div class="episode-notes">(.*?)</div>', block, re.S)
    note_paras = re.findall(r"<p\b[^>]*>(.*?)</p>", notes_div.group(1), re.S) if notes_div else []

    number_text = _inner(block, "episode-number")
    description_raw = _raw(block, "p", "episode-desc")
    guest_raw = _raw(block, "p", "episode-guest")
    title_raw = _raw(block, "h3", "episode-title")
    fields = {
        "number": int(number_text) if number_text.isdigit() else None,
        "date": _inner(block, "episode-date"),
        "length": _inner(block, "episode-length"),
        "title": _plain(title_raw),
        "guest": _plain(guest_raw) if guest_raw is not None else "",
        "description": re.sub(r"\s+", " ", _plain(description_raw)) if description_raw is not None else "",
        "notes": "\n\n".join(_plain(p) for p in note_paras if _plain(p)),
        "youtube": youtube if is_real_link(youtube) else "",
        "audio_path": audio if is_real_link(audio) else "",
        "thumb_path": _attr_of(block, "episode-thumb", "src"),
    }

    reason = ""
    if fields["number"] is None:
        reason = "it has no episode number"
    elif any(_has_markup(part) for part in [title_raw, guest_raw, description_raw] + note_paras):
        reason = "it has special formatting (a link or bold text)"
    elif len(re.findall(r"<a\b", block)) != len(re.findall(r'<a\b[^>]*class="[^"]*(?:btn-youtube|episode-audio)', block)):
        reason = "it has extra links"
    elif _words(block) != _words(build_article(dict(fields, number=fields["number"] or 0))):
        reason = "it has extra content the Studio doesn't know about"
    fields["editable"] = not reason
    fields["why_not"] = reason
    return fields


def replace_entry(text, entry, article):
    return text[:entry["start"]] + article + text[entry["end"]:]


def insert_entry(text, article):
    """Put a new entry right under the blank starter, so the newest sits near the top."""
    for entry in parse_entries(text):
        if entry["blank"]:
            return text[:entry["end"]] + "\n\n" + article + text[entry["end"]:]
    return article + "\n\n" + text


def remove_entry(text, entry):
    before = text[:entry["start"]].rstrip("\n")
    after = text[entry["end"]:].lstrip("\n")
    joined = before + ("\n\n" + after if after else "")
    return joined.rstrip("\n") + "\n"


def sync_pages(root):
    """Copy the Library item into every page that embeds it (Dreamweaver's
    "Update Pages", for people who'd rather not click through it)."""
    lbi = read_library(root).rstrip("\n")
    updated = []
    for name in PAGES:
        path = os.path.join(root, name)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            page = fh.read()
        new, count = LIB_BLOCK_RE.subn(lambda m: m.group(1) + lbi + m.group(2), page)
        if count and new != page:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(new)
            updated.append(name)
    if write_feed(root, read_library(root)):
        updated.append(FEED_PATH)
    return updated


# ------------------------------------------------------------ podcast feed --

SITE_URL = "https://tateharrisonmedia.com"
FEED_PATH = "feed.xml"
COVER_PATH = "images/podcast-cover.jpg"
SHOW_TITLE = "Human Motivation"
SHOW_DESCRIPTION = ("I'm Tate Harrison, and this is: Human Motivation; the podcast where we uncover the "
                    "mystery of living for the sake of it.")
AUDIO_TYPES = {".mp3": "audio/mpeg", ".m4a": "audio/x-m4a", ".aac": "audio/aac"}
MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september",
     "october", "november", "december"], 1)}


def audio_seconds(path):
    """Length in seconds from the file itself (macOS afinfo, else ffprobe)."""
    if shutil.which("afinfo"):
        found = re.search(r"estimated duration:\s*([\d.]+)", _run(["afinfo", path]).stdout)
        if found:
            return int(round(float(found.group(1))))
    if shutil.which("ffprobe"):
        out = _run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "default=nw=1:nk=1", path]).stdout.strip()
        try:
            return int(round(float(out)))
        except ValueError:
            pass
    return None


def parse_date(text, fallback):
    """"October 2026", "Oct 2026", "October 15, 2026" or "2026" -> a datetime. Month-only
    dates land on the 1st at noon UTC; anything unreadable uses the fallback."""
    words = re.findall(r"[A-Za-z]+|\d+", text or "")
    year = next((int(w) for w in words if len(w) == 4 and w.isdigit()), None)
    if year is None:
        return fallback
    month = next((MONTHS[w.lower()] for w in words if w.lower() in MONTHS), None)
    if month is None:
        month = next((MONTHS[k] for w in words for k in MONTHS if len(w) >= 3 and k.startswith(w.lower())), 1)
    day = next((int(w) for w in words if w.isdigit() and len(w) <= 2 and 1 <= int(w) <= 28), 1)
    return datetime.datetime(year, month, day, 12, 0, tzinfo=datetime.timezone.utc)


def _clock(seconds):
    return "%d:%02d:%02d" % (seconds // 3600, (seconds % 3600) // 60, seconds % 60)


def feed_items(root, text):
    """Entries that belong in the podcast feed: real audio on disk, and not a sample."""
    items = []
    for entry in list_episodes(text):
        fields = read_fields(text[entry["start"]:entry["end"]])
        audio = fields["audio_path"]
        if not audio or "replace me" in fields["title"].lower():
            continue
        path = os.path.join(root, audio.lstrip("/"))
        ext = os.path.splitext(path)[1].lower()
        if not os.path.isfile(path) or ext not in AUDIO_TYPES:
            continue
        mtime = datetime.datetime.fromtimestamp(os.path.getmtime(path), datetime.timezone.utc)
        items.append(dict(fields, id=entry["id"], path=path, type=AUDIO_TYPES[ext], size=os.path.getsize(path),
                          seconds=audio_seconds(path), published=parse_date(fields["date"], mtime)))
    items.sort(key=lambda i: (i["published"], i["number"] or 0), reverse=True)
    return items


def build_feed(root, text=None):
    """The podcast's RSS feed, written the same way every time (no "built at" stamp), so
    pressing Publish with nothing new never shows a change."""
    text = read_library(root) if text is None else text
    items = feed_items(root, text)
    e = xml_escape
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" '
           'xmlns:atom="http://www.w3.org/2005/Atom">',
           '<channel>',
           '  <title>%s</title>' % e(SHOW_TITLE),
           '  <link>%s/</link>' % SITE_URL,
           '  <atom:link href="%s/%s" rel="self" type="application/rss+xml"/>' % (SITE_URL, FEED_PATH),
           '  <description>%s</description>' % e(SHOW_DESCRIPTION),
           '  <language>en-us</language>',
           '  <copyright>%s</copyright>' % e("Tate Harrison Media LLC"),
           '  <itunes:author>Tate Harrison</itunes:author>',
           '  <itunes:summary>%s</itunes:summary>' % e(SHOW_DESCRIPTION),
           '  <itunes:explicit>false</itunes:explicit>',
           '  <itunes:type>episodic</itunes:type>',
           '  <itunes:category text="Society &amp; Culture"/>',
           '  <itunes:owner><itunes:name>Tate Harrison</itunes:name><itunes:email>info@tateharrisonmedia.com</itunes:email></itunes:owner>']
    if os.path.isfile(os.path.join(root, COVER_PATH)):
        out.append('  <itunes:image href="%s/%s"/>' % (SITE_URL, COVER_PATH))
    if items:
        out.append('  <lastBuildDate>%s</lastBuildDate>' % email.utils.format_datetime(items[0]["published"]))
    for item in items:
        link = "%s/episode.html?ep=%s" % (SITE_URL, item["id"])
        body = [item["description"]] + [p for p in item["notes"].split("\n\n") if p.strip()]
        out += ['  <item>',
                '    <title>%s</title>' % e(item["title"]),
                '    <link>%s</link>' % e(link),
                '    <guid isPermaLink="true">%s</guid>' % e(link),
                '    <pubDate>%s</pubDate>' % email.utils.format_datetime(item["published"]),
                '    <description>%s</description>' % e("\n\n".join(body)),
                '    <enclosure url="%s%s" length="%d" type="%s"/>' % (e(SITE_URL), e(item["audio_path"]), item["size"], item["type"]),
                '    <itunes:episodeType>full</itunes:episodeType>']
        if item["number"] is not None:
            out.append('    <itunes:episode>%d</itunes:episode>' % item["number"])
        if item["seconds"]:
            out.append('    <itunes:duration>%s</itunes:duration>' % _clock(item["seconds"]))
        if item["guest"]:
            out.append('    <itunes:subtitle>%s</itunes:subtitle>' % e(item["guest"]))
        out.append('  </item>')
    out += ['</channel>', '</rss>', '']
    return "\n".join(out)


def write_feed(root, text=None):
    """Returns True if feed.xml changed."""
    new = build_feed(root, text)
    path = os.path.join(root, FEED_PATH)
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if new == old:
        return False
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(new)
    return True


# ------------------------------------------------------------ file helpers --

def _run(args):
    return subprocess.run(args, capture_output=True, text=True)


def audio_minutes(path):
    """Length in minutes, read from the file itself (macOS afinfo, else ffprobe)."""
    seconds = None
    if shutil.which("afinfo"):
        found = re.search(r"estimated duration:\s*([\d.]+)", _run(["afinfo", path]).stdout)
        if found:
            seconds = float(found.group(1))
    if seconds is None and shutil.which("ffprobe"):
        out = _run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "default=nw=1:nk=1", path]).stdout.strip()
        try:
            seconds = float(out)
        except ValueError:
            pass
    return max(1, int(round(seconds / 60.0))) if seconds else None


def compress_audio(src, dest_mp3):
    """Re-encode as a smaller mp3 so it fits under GitHub's file-size limit.
    Tries 128, then 96, then 64 kbit/s (mono) until it fits. Returns True on success."""
    if not shutil.which("ffmpeg"):
        return False
    for bitrate, extra in (("128k", []), ("96k", []), ("64k", ["-ac", "1"])):
        result = _run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vn",
                       "-codec:a", "libmp3lame", "-b:a", bitrate] + extra + [dest_mp3])
        if result.returncode == 0 and os.path.getsize(dest_mp3) <= AUDIO_LIMIT:
            return True
    return False


def _dims(path):
    out = _run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path]).stdout
    width = re.search(r"pixelWidth:\s*(\d+)", out)
    height = re.search(r"pixelHeight:\s*(\d+)", out)
    return (int(width.group(1)), int(height.group(1))) if width and height else None


def process_thumbnail(src, images_dir, base):
    """Turn whatever picture was dropped in into a tidy 16:9 JPEG, 1280px wide, so
    nobody has to crop, resize, or convert anything. Returns the web path."""
    out = os.path.join(images_dir, base + ".jpg")
    if shutil.which("sips"):
        try:
            size = _dims(src)
            if size:
                width, height = size
                if width / float(height) > 16 / 9.0:
                    crop_w, crop_h = int(round(height * 16 / 9.0)), height
                else:
                    crop_w, crop_h = width, int(round(width * 9 / 16.0))
                tmp = out + ".tmp.jpg"
                _run(["sips", "-c", str(crop_h), str(crop_w), "-s", "format", "jpeg",
                      "-s", "formatOptions", "82", src, "--out", tmp])
                _run(["sips", "-Z", "1280", tmp, "--out", out])
                if os.path.exists(tmp):
                    os.remove(tmp)
                if os.path.exists(out) and os.path.getsize(out) > 0:
                    return "/images/%s.jpg" % base
        except OSError:
            pass
    ext = os.path.splitext(src)[1].lower() or ".jpg"
    shutil.copyfile(src, os.path.join(images_dir, base + ext))
    return "/images/%s%s" % (base, ext)
