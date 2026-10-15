"""Reads and writes the episode Library item (Library/episodes.lbi) and keeps the
pages that embed it in sync -- the same job Dreamweaver's "Update Pages" does,
plus the fiddly file work (naming, thumbnail sizing, audio size) that normally
takes technical know-how."""
import html
import os
import re
import shutil
import subprocess

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
        '        <img class="episode-thumb" src="%s" width="320" alt="Thumbnail for %s">' % (
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
    return updated


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
