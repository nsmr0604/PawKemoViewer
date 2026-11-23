"""Exercise the installed diagnostic DEB in a fresh graphical session."""

import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

import pyatspi


def has_home_search(node):
    pending = [node]
    while pending:
        item = pending.pop()
        if item.getRole() == pyatspi.ROLE_ENTRY and "投稿を検索" in (item.name or ""):
            return True
        pending.extend(item.getChildAtIndex(index) for index in range(item.childCount))
    return False


def run():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        env = dict(os.environ)
        for kind in ("CONFIG", "CACHE", "DATA"):
            path = root / kind.lower()
            path.mkdir()
            env[f"XDG_{kind}_HOME"] = str(path)
        env["WEBKIT_DISABLE_DMABUF_RENDERER"] = "1"
        logfile = root / "output.log"
        with logfile.open("wb") as output:
            app = subprocess.Popen(["/usr/bin/pawkemoviewer"], env=env, stdout=output, stderr=output)
            try:
                deadline = time.monotonic() + 90
                webview_ready = False
                api_status = None
                while time.monotonic() < deadline and app.poll() is None:
                    if not webview_ready:
                        try:
                            webview_ready = has_home_search(pyatspi.Registry.getDesktop(0))
                        except (AttributeError, RuntimeError):
                            pass  # WebKit can replace nodes while the document loads.
                    log = logfile.read_text(errors="replace")
                    matches = re.findall(
                        r"RESPONSE method=GET url=https://pawchive\.pw/api/v1/posts[^ ]* status=(\d{3})[^\n]*bytes=([1-9]\d*)",
                        log,
                    )
                    if matches:
                        api_status = int(matches[-1][0])
                    if webview_ready and api_status == 200:
                        print("PASS: installed Linux WebView shows Home and the native public posts request returned HTTP 200")
                        return
                    time.sleep(1)
                raise SystemExit(
                    f"Smoke failed: home_webview={webview_ready}, posts_http={api_status}, app_exit={app.poll()}"
                )
            finally:
                if app.poll() is None:
                    app.terminate()
                    try:
                        app.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        app.kill()
                        app.wait()


if __name__ == "__main__":
    run()
