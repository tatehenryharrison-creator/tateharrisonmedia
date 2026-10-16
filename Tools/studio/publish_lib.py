"""Publishing the website to GitHub, with plain-English results instead of git."""
import os
import re
import subprocess
import time

import episodes_lib as E

SITE_URL = "https://tateharrisonmedia.com"
MAX_FILE = 95 * 1024 * 1024  # GitHub rejects files over 100 MB


def git(root, *args):
    result = subprocess.run(["git"] + list(args), cwd=root, capture_output=True, text=True)
    return result.returncode, (result.stdout + result.stderr).rstrip()


def changed_files(root):
    """Paths git sees as new, changed, or deleted (every file listed individually)."""
    code, out = git(root, "status", "--porcelain", "-uall")
    files = []
    if code == 0:
        for line in out.splitlines():
            if len(line) > 3:
                path = line[3:].split(" -> ")[-1].strip().strip('"')
                files.append((line[:2].strip() or "?", path))
    return files


def summarize(files):
    """Group changed files into things a person recognizes."""
    groups = [
        ("Episode list", lambda p: p.startswith("Library/")),
        ("Podcast feed", lambda p: p == "feed.xml"),
        ("Audio files", lambda p: p.startswith("audio/")),
        ("Pictures", lambda p: p.startswith("images/")),
        ("Pages", lambda p: p.endswith(".html")),
        ("Design and scripts", lambda p: p.startswith(("css/", "js/", "fonts/", "Templates/"))),
    ]
    counts = {}
    for _, path in files:
        label = "Other files"
        for name, test in groups:
            if test(path):
                label = name
                break
        counts[label] = counts.get(label, 0) + 1
    return [{"label": k, "count": v} for k, v in counts.items()]


def _friendly_push_error(text):
    low = text.lower()
    if "exceeds github's file size limit" in low or "pre-receive hook declined" in low or "large files detected" in low:
        found = re.search(r"File (\S.*?) is ([\d.]+ MB)", text)
        which = " (%s, %s)" % (found.group(1), found.group(2)) if found else ""
        return ("One of your files is too big for GitHub%s. Audio files must be under 100 MB. "
                "Add the episode again in Website Studio and it will compress the audio for you." % which)
    if any(s in low for s in ("could not resolve host", "unable to access", "network is unreachable", "timed out")):
        return "Couldn't reach GitHub. Check your internet connection and try Publish again. Nothing was lost."
    if any(s in low for s in ("authentication", "403", "could not read username", "permission denied", "denied to")):
        return ("GitHub didn't accept the saved sign-in. Open GitHub Desktop (or ask Claude) to sign in again, "
                "then press Publish again.")
    return "Publishing didn't finish. Your work is saved on this computer. Press Publish again, and if it keeps happening, copy the details below to Claude."


def publish(root, note=""):
    """Sync the pages, then save and upload everything. Returns a dict for the UI."""
    E.sync_pages(root)

    files = changed_files(root)
    if not files:
        return {"ok": True, "nothing": True, "message": "Everything is already published. There's nothing new to send."}

    for _, path in files:
        full = os.path.join(root, path)
        if os.path.isfile(full) and os.path.getsize(full) > MAX_FILE:
            mb = os.path.getsize(full) / (1024.0 * 1024.0)
            return {"ok": False,
                    "message": "%s is %.0f MB, which is over GitHub's 100 MB limit. Remove it, or add the episode "
                               "through Website Studio so the audio is compressed for you." % (path, mb)}

    message = (note or "").strip() or ("Site update " + time.strftime("%B %d, %Y %I:%M %p").replace(" 0", " "))
    message = message.splitlines()[0][:200]

    code, out = git(root, "add", "-A")
    if code != 0:
        return {"ok": False, "message": "Couldn't gather your changes.", "detail": out}
    code, out = git(root, "commit", "-m", message)
    if code != 0:
        return {"ok": False, "message": "Couldn't save your changes.", "detail": out}

    branch = git(root, "rev-parse", "--abbrev-ref", "HEAD")[1].strip()
    code, out = git(root, "fetch", "origin")
    if code != 0:
        return {"ok": False, "message": _friendly_push_error(out), "detail": out}

    code, counts = git(root, "rev-list", "--left-right", "--count", "HEAD...origin/%s" % branch)
    behind = int(counts.split()[1]) if code == 0 and len(counts.split()) == 2 else 0
    if behind:
        code, out = git(root, "pull", "--rebase", "origin", branch)
        if code != 0:
            git(root, "rebase", "--abort")
            return {"ok": False,
                    "message": ("The live website has changes this computer doesn't have yet, and they overlap with "
                                "yours. Nothing was lost. Ask Claude to merge them."),
                    "detail": out}

    code, out = git(root, "push", "origin", branch)
    if code != 0:
        return {"ok": False, "message": _friendly_push_error(out), "detail": out}

    return {"ok": True, "published": True, "files": len(files), "url": SITE_URL,
            "message": "Published! Your changes will show up at %s in about a minute or two." % SITE_URL}
