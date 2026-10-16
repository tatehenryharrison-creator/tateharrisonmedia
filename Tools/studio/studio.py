#!/usr/bin/env python3
"""Website Studio -- a small control panel that runs only on this computer.

It lets someone with no technical skill add and remove podcast episodes, preview
the site, and publish it, without a terminal, git, or hand-written HTML.

Start it by double-clicking "Website Studio.command". Everything it serves is
reachable only from this computer (127.0.0.1)."""
import argparse
import glob
import json
import mimetypes
import os
import re
import secrets
import shutil
import sys
import threading
import time
import urllib.parse
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import episodes_lib as E  # noqa: E402
import publish_lib as P  # noqa: E402

for _ext, _type in ((".mp3", "audio/mpeg"), (".m4a", "audio/mp4"), (".svg", "image/svg+xml"),
                    (".woff2", "font/woff2"), (".ttf", "font/ttf"), (".webp", "image/webp"),
                    (".lbi", "text/plain"), (".dwt", "text/plain")):
    mimetypes.add_type(_type, _ext)

MAX_UPLOAD = 2 * 1024 * 1024 * 1024
TOKEN_RE = re.compile(r"^[0-9a-f]{32}$")


class UserError(Exception):
    """A problem worth explaining to the person using the tool."""


class Handler(BaseHTTPRequestHandler):
    server_version = "WebsiteStudio/1.0"

    def log_message(self, *args):
        pass

    # ---------------------------------------------------------------- basics --
    def _send(self, code, body=b"", ctype="text/plain; charset=utf-8", extra=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj), "application/json; charset=utf-8")

    def _host_ok(self):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
        return host in ("localhost", "127.0.0.1", "::1")

    def _authorized(self):
        supplied = self.headers.get("X-Studio-Token") or ""
        return secrets.compare_digest(supplied, self.server.token)

    def _body_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > 5 * 1024 * 1024:
            raise UserError("That request was too large.")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8") or "{}")
        except ValueError:
            raise UserError("Couldn't read that request.")

    # ---------------------------------------------------------------- routing --
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        if not self._host_ok():
            return self._send(403, "Forbidden")
        path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)

        if path == "/__studio":
            with open(os.path.join(HERE, "studio.html"), encoding="utf-8") as fh:
                page = fh.read().replace("__TOKEN__", self.server.token)
            return self._send(200, page, "text/html; charset=utf-8")
        if path == "/__api/state":
            return self._api(self._state)
        if path == "/__api/episode":
            return self._api(self._get_episode)
        if path.startswith("/__"):
            return self._send(404, "Not found")
        self._serve_static(path)

    def do_PUT(self):
        if not self._host_ok():
            return self._send(403, "Forbidden")
        if urllib.parse.urlparse(self.path).path == "/__api/upload":
            return self._api(self._upload)
        self._send(404, "Not found")

    def do_POST(self):
        if not self._host_ok():
            return self._send(403, "Forbidden")
        routes = {
            "/__api/episode": self._create_episode,
            "/__api/update": self._update_episode,
            "/__api/remove": self._remove_episode,
            "/__api/restore": self._restore_episode,
            "/__api/publish": self._publish,
            "/__api/quit": self._quit,
        }
        handler = routes.get(urllib.parse.urlparse(self.path).path)
        if not handler:
            return self._send(404, "Not found")
        self._api(handler)

    def _api(self, handler):
        if not self._authorized():
            return self._json({"ok": False, "message": "Please reload this page."}, 403)
        try:
            with self.server.lock:
                result = handler()
            if result is not None:
                self._json(result)
        except UserError as err:
            self._json({"ok": False, "message": str(err)}, 400)
        except Exception as err:  # keep the tool alive, tell the person something useful
            self._json({"ok": False, "message": "Something unexpected went wrong.", "detail": repr(err)}, 500)

    # ----------------------------------------------------------- static files --
    def _serve_static(self, path):
        root = os.path.realpath(self.server.root)
        parts = [p for p in path.split("/") if p not in ("", ".")]
        if any(p == ".." or p.startswith(".") for p in parts):
            return self._send(404, "Not found")
        full = os.path.realpath(os.path.join(root, *parts))
        if full != root and not full.startswith(root + os.sep):
            return self._send(404, "Not found")

        if os.path.isdir(full):
            if not path.endswith("/"):
                return self._send(301, "", extra={"Location": path + "/"})
            full = os.path.join(full, "index.html")
        if not os.path.isfile(full):
            return self._send(404, "Not found")

        size = os.path.getsize(full)
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"

        start, end, status = 0, size - 1, 200
        requested = self.headers.get("Range") or ""
        if requested.startswith("bytes="):
            first, _, last = requested[6:].split(",")[0].strip().partition("-")
            try:
                if first == "":
                    start = max(0, size - int(last))
                else:
                    start = int(first)
                    end = int(last) if last else size - 1
            except ValueError:
                start, end = 0, size - 1
            if start >= size or start > end:
                return self._send(416, "", extra={"Content-Range": "bytes */%d" % size})
            end = min(end, size - 1)
            status = 206

        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        if status == 206:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.end_headers()
        if self.command == "HEAD":
            return
        try:
            with open(full, "rb") as fh:
                fh.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    chunk = fh.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    # -------------------------------------------------------------------- API --
    def _state(self):
        root = self.server.root
        text = E.read_library(root)
        files = P.changed_files(root)
        episodes = []
        for e in E.list_episodes(text):
            fields = E.read_fields(text[e["start"]:e["end"]])
            episodes.append({
                "id": e["id"], "number": e["number"], "title": e["title"], "date": e["date"],
                "thumb": e["thumb"], "url": "/episode.html?ep=" + urllib.parse.quote(e["id"]),
                "editable": fields["editable"], "why_not": fields["why_not"],
            })
        return {
            "ok": True,
            "episodes": episodes,
            "removed": self._removed_list(),
            "next_number": E.next_number(text),
            "default_date": time.strftime("%B %Y"),
            "changes": {"total": len(files), "groups": P.summarize(files)},
            "site_url": P.SITE_URL,
        }

    def _find_episode(self, text, episode_id):
        target = next((e for e in E.list_episodes(text) if e["id"] == episode_id), None)
        if not target:
            raise UserError("That episode couldn't be found. It may have been removed.")
        return target

    def _get_episode(self):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        text = E.read_library(self.server.root)
        target = self._find_episode(text, (query.get("id") or [""])[0])
        fields = E.read_fields(text[target["start"]:target["end"]])
        fields.update(ok=True, id=target["id"])
        return fields

    def _tmp_file(self, token):
        if not token or not TOKEN_RE.match(token):
            raise UserError("That upload expired. Please choose the file again.")
        found = glob.glob(os.path.join(self.server.tmp_dir, token + ".*"))
        if not found:
            raise UserError("That upload expired. Please choose the file again.")
        return found[0]

    def _stash(self, path):
        """Move a file into Tools/.trash instead of deleting it, so nothing is ever lost."""
        if os.path.exists(path):
            folder = os.path.join(self.server.trash_dir, time.strftime("%Y-%m-%d_%H%M%S"))
            os.makedirs(folder, exist_ok=True)
            kept = os.path.join(folder, os.path.basename(path))
            shutil.move(path, kept)
            return kept
        return None

    def _upload(self):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        kind = (query.get("kind") or [""])[0]
        name = os.path.basename((query.get("name") or ["file"])[0])
        ext = os.path.splitext(name)[1].lower()
        allowed = E.AUDIO_EXTS if kind == "audio" else E.IMAGE_EXTS if kind == "thumb" else None
        if allowed is None or ext not in allowed:
            raise UserError("That kind of file isn't supported. Audio: mp3, m4a, wav. Pictures: jpg, png, heic, webp.")

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_UPLOAD:
            raise UserError("That file is empty or too large.")

        token = uuid.uuid4().hex
        dest = os.path.join(self.server.tmp_dir, token + ext)
        remaining = length
        with open(dest, "wb") as out:
            while remaining > 0:
                chunk = self.rfile.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                out.write(chunk)
                remaining -= len(chunk)
        if remaining:
            os.remove(dest)
            raise UserError("The upload was interrupted. Please try again.")

        result = {"ok": True, "token": token, "name": name, "size": os.path.getsize(dest)}

        if kind == "audio":
            # WAV files are huge, and anything near GitHub's 100 MB limit can't be published.
            if ext == ".wav" or result["size"] > E.AUDIO_LIMIT:
                converted = os.path.join(self.server.tmp_dir, uuid.uuid4().hex + ".mp3")
                if E.compress_audio(dest, converted):
                    os.remove(dest)
                    token = os.path.splitext(os.path.basename(converted))[0]
                    dest = converted
                    result.update(token=token, size=os.path.getsize(dest),
                                  note="Your audio was large, so it was compressed to a web-friendly mp3.")
                else:
                    os.remove(dest)
                    raise UserError("That audio file is too large to publish (GitHub's limit is 100 MB) and "
                                    "it couldn't be compressed here. Export it as an mp3 and try again.")
            result["minutes"] = E.audio_minutes(dest)
        return result

    # --------------------------------------------------- add / edit / remove --
    def _clean_form(self, data):
        """Checks shared by adding and editing. Returns the tidy values."""
        title = (data.get("title") or "").strip()
        description = (data.get("description") or "").strip()
        if not title:
            raise UserError("Please give the episode a title.")
        if not description:
            raise UserError("Please add a description.")
        youtube = (data.get("youtube") or "").strip()
        if youtube and not re.match(r"^https?://", youtube, re.I):
            raise UserError("The YouTube link should start with https://")
        return title, description, youtube

    def _place_files(self, root, base, data, undo):
        """Move the uploaded audio and picture into the site under the episode's tidy
        name. Anything they replace goes to the trash. `undo` collects what is needed
        to put everything back if a later step fails."""
        audio_path, thumb_path = "", ""
        if data.get("audio_token"):
            src = self._tmp_file(data["audio_token"])
            dest = os.path.join(root, "audio", base + os.path.splitext(src)[1].lower())
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            kept = self._stash(dest)
            if kept:
                undo["restore"].append((kept, dest))
            shutil.move(src, dest)
            undo["created"].append(dest)
            audio_path = "/audio/" + os.path.basename(dest)

        if data.get("thumb_token"):
            src = self._tmp_file(data["thumb_token"])
            images = os.path.join(root, "images")
            for old in glob.glob(os.path.join(images, base + ".*")):
                kept = self._stash(old)
                if kept:
                    undo["restore"].append((kept, old))
            thumb_path = E.process_thumbnail(src, images, base)
            undo["created"].append(os.path.join(root, thumb_path.lstrip("/")))
            os.remove(src)
        return audio_path, thumb_path

    def _roll_back(self, root, text, undo):
        E.write_library(root, text)
        E.sync_pages(root)
        for path in undo["created"]:
            if os.path.exists(path):
                os.remove(path)
        for kept, dest in undo["restore"]:
            if os.path.exists(kept):
                shutil.move(kept, dest)

    def _create_episode(self):
        data = self._body_json()
        root = self.server.root
        text = E.read_library(root)

        try:
            number = int(str(data.get("number", "")).strip())
        except ValueError:
            raise UserError("The episode number needs to be a whole number, like 4.")
        if number < 1:
            raise UserError("The episode number needs to be 1 or higher.")
        title, description, youtube = self._clean_form(data)
        if number in {e["number"] for e in E.list_episodes(text)}:
            raise UserError("Episode %d already exists. Pick a different number, or remove that one first." % number)

        base = "episode-%03d" % number
        undo = {"created": [], "restore": []}
        try:
            audio_path, thumb_path = self._place_files(root, base, data, undo)
            article = E.build_article({
                "number": number, "date": data.get("date"), "length": data.get("length"),
                "title": title, "guest": data.get("guest"), "description": description,
                "notes": data.get("notes"), "youtube": youtube,
                "audio_path": audio_path, "thumb_path": thumb_path,
            })
            E.write_library(root, E.insert_entry(text, article))
            E.sync_pages(root)
        except Exception:
            self._roll_back(root, text, undo)
            raise

        added = [e for e in E.list_episodes(E.read_library(root)) if e["number"] == number]
        episode_id = added[0]["id"] if added else base
        return {"ok": True, "id": episode_id, "number": number,
                "url": "/episode.html?ep=" + urllib.parse.quote(episode_id)}

    def _update_episode(self):
        data = self._body_json()
        root = self.server.root
        text = E.read_library(root)
        target = self._find_episode(text, data.get("id"))
        current = E.read_fields(text[target["start"]:target["end"]])
        if not current["editable"]:
            raise UserError("This episode can't be edited here because %s. Open Library/episodes.lbi in "
                            "Dreamweaver to change it." % current["why_not"])
        title, description, youtube = self._clean_form(data)
        number = current["number"]

        base = "episode-%03d" % number
        undo = {"created": [], "restore": []}
        try:
            audio_path, thumb_path = self._place_files(root, base, data, undo)
            article = E.build_article({
                "number": number, "date": data.get("date"), "length": data.get("length"),
                "title": title, "guest": data.get("guest"), "description": description,
                "notes": data.get("notes"), "youtube": youtube,
                "audio_path": audio_path or current["audio_path"],
                "thumb_path": thumb_path or current["thumb_path"],
            })
            E.write_library(root, E.replace_entry(text, target, article))
            E.sync_pages(root)
        except Exception:
            self._roll_back(root, text, undo)
            raise

        saved = [e for e in E.list_episodes(E.read_library(root)) if e["number"] == number]
        episode_id = saved[0]["id"] if saved else target["id"]
        return {"ok": True, "id": episode_id, "number": number,
                "url": "/episode.html?ep=" + urllib.parse.quote(episode_id)}

    def _remove_episode(self):
        data = self._body_json()
        root = self.server.root
        text = E.read_library(root)
        episodes = E.list_episodes(text)
        target = self._find_episode(text, data.get("id"))

        # Everything needed to bring the episode back goes into one trash folder.
        bundle = os.path.join(self.server.trash_dir, "%s_%s" % (time.strftime("%Y-%m-%d_%H%M%S"), target["id"]))
        os.makedirs(bundle, exist_ok=True)

        in_use = set()
        for other in episodes:
            if other["start"] != target["start"]:
                in_use.update((other["audio"], other["thumb"]))
        moved = []
        for path in (target["audio"], target["thumb"]):
            # Only this tool's own numbered files are ever moved; shared pictures stay put.
            if path and path not in in_use and re.match(r"^/(audio|images)/episode-\d+", path):
                source = os.path.join(root, path.lstrip("/"))
                if os.path.exists(source):
                    shutil.move(source, os.path.join(bundle, os.path.basename(path)))
                    moved.append(path)

        with open(os.path.join(bundle, "entry.html"), "w", encoding="utf-8") as fh:
            fh.write(text[target["start"]:target["end"]])
        with open(os.path.join(bundle, "meta.json"), "w", encoding="utf-8") as fh:
            json.dump({"number": target["number"], "title": target["title"], "files": moved}, fh)

        E.write_library(root, E.remove_entry(text, target))
        E.sync_pages(root)
        return {"ok": True}

    def _removed_list(self):
        found = []
        trash = self.server.trash_dir
        for name in sorted(os.listdir(trash), reverse=True) if os.path.isdir(trash) else []:
            meta = os.path.join(trash, name, "meta.json")
            if os.path.isfile(meta):
                try:
                    with open(meta, encoding="utf-8") as fh:
                        info = json.load(fh)
                    found.append({"bundle": name, "number": info.get("number"), "title": info.get("title", "")})
                except (OSError, ValueError):
                    continue
        return found[:8]

    def _restore_episode(self):
        data = self._body_json()
        root = self.server.root
        name = str(data.get("bundle") or "")
        if not re.match(r"^[A-Za-z0-9_.-]+$", name):
            raise UserError("That episode couldn't be found in the trash.")
        bundle = os.path.join(self.server.trash_dir, name)
        meta_path = os.path.join(bundle, "meta.json")
        if not os.path.isfile(meta_path):
            raise UserError("That episode has already been brought back, or its files are gone.")
        with open(meta_path, encoding="utf-8") as fh:
            info = json.load(fh)
        with open(os.path.join(bundle, "entry.html"), encoding="utf-8") as fh:
            article = fh.read()

        text = E.read_library(root)
        if info.get("number") in {e["number"] for e in E.list_episodes(text)}:
            raise UserError("There's already an Episode %s on your site. Remove or renumber it first, then "
                            "bring this one back." % info.get("number"))

        undo = {"created": [], "restore": []}
        try:
            for path in info.get("files", []):
                source = os.path.join(bundle, os.path.basename(path))
                dest = os.path.join(root, path.lstrip("/"))
                if os.path.exists(source):
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    kept = self._stash(dest)
                    if kept:
                        undo["restore"].append((kept, dest))
                    shutil.move(source, dest)
                    undo["created"].append(dest)
            E.write_library(root, E.insert_entry(text, article))
            E.sync_pages(root)
        except Exception:
            self._roll_back(root, text, undo)
            raise
        os.replace(meta_path, os.path.join(bundle, "meta.restored.json"))

        restored = [e for e in E.list_episodes(E.read_library(root)) if e["number"] == info.get("number")]
        return {"ok": True, "number": info.get("number"),
                "url": "/episode.html?ep=" + urllib.parse.quote(restored[0]["id"]) if restored else "/"}

    def _publish(self):
        data = self._body_json()
        return P.publish(self.server.root, data.get("note", ""))

    def _quit(self):
        self._json({"ok": True})
        threading.Thread(target=self.server.shutdown, daemon=True).start()
        return None


def main():
    parser = argparse.ArgumentParser(description="Website Studio")
    parser.add_argument("--root", default=os.path.dirname(os.path.dirname(HERE)))
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args()

    root = os.path.abspath(args.root)
    if not os.path.exists(os.path.join(root, E.LIB_PATH)):
        print("This doesn't look like the website folder (missing %s):\n  %s" % (E.LIB_PATH, root))
        sys.exit(1)

    tools_dir = os.path.join(root, "Tools")
    tmp_dir = os.path.join(tools_dir, ".tmp")
    shutil.rmtree(tmp_dir, ignore_errors=True)
    os.makedirs(tmp_dir, exist_ok=True)

    httpd = None
    for port in ([args.port] if args.port else range(8765, 8800)):
        try:
            httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            break
        except OSError:
            continue
    if httpd is None:
        print("Couldn't find a free port to run on. Close other copies of Website Studio and try again.")
        sys.exit(1)

    httpd.daemon_threads = True
    httpd.root = root
    httpd.tmp_dir = tmp_dir
    httpd.trash_dir = os.path.join(tools_dir, ".trash")
    httpd.token = secrets.token_hex(16)
    httpd.lock = threading.Lock()

    url = "http://localhost:%d/__studio" % httpd.server_address[1]
    print("")
    print("  Website Studio is running.")
    print("  It should open in your browser. If it doesn't, go to:  %s" % url)
    print("")
    print("  Leave this window open while you work.")
    print("  When you're done, press 'Quit Studio' on the page, or just close this window.")
    print("")
    if not args.no_open:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        shutil.rmtree(tmp_dir, ignore_errors=True)
        print("  Website Studio stopped.")


if __name__ == "__main__":
    main()
