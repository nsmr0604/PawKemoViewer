"""インストール済み診断版から公開投稿 API に到達することを確認する。"""

import os
from pathlib import Path
import re
import subprocess
import sys
import time


def main():
    executable = Path(sys.argv[1])
    if sys.platform == "win32":
        app_data = Path(os.environ["APPDATA"])
    else:
        app_data = Path.home() / "Library" / "Application Support"
    log_path = app_data / "com.nsmr0604.pawkemoviewer" / "logs" / "pawchive.log"
    offset = log_path.stat().st_size if log_path.exists() else 0
    response = re.compile(
        rb"RESPONSE method=GET url=https://pawchive\.pw/api/v1/posts[^ ]* "
        rb"status=(\d{3})[^\n]*bytes=([1-9]\d*)"
    )
    with subprocess.Popen([executable], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) as app:
        try:
            deadline = time.monotonic() + 100
            status = None
            while time.monotonic() < deadline and app.poll() is None:
                if log_path.exists():
                    with log_path.open("rb") as log:
                        log.seek(offset)
                        matches = response.findall(log.read())
                    if matches:
                        status = int(matches[-1][0])
                        if status == 200:
                            print("起動と公開投稿 API の応答を確認 (HTTP 200)")
                            return
                time.sleep(1)
            raise SystemExit(f"公開投稿 API の確認に失敗 (HTTP={status}, 終了コード={app.poll()})")
        finally:
            if app.poll() is None:
                app.terminate()
                try:
                    app.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    app.kill()
                    app.wait()


if __name__ == "__main__":
    main()
