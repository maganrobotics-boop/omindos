# SPDX-License-Identifier: GPL-3.0-only
"""Temporary loopback-only preview; never changes file permissions or Nginx."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import urlsplit

FILES = {"index.html": "text/html; charset=utf-8", "preview.json": "application/json",
         "simulation.csv": "text/csv; charset=utf-8", "simulation.mp4": "video/mp4", "poster.jpg": "image/jpeg"}


def handler(root):
    class Preview(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_file()

        def do_HEAD(self):
            self.send_file(head=True)

        def do_POST(self):
            self.send_error(405)

        def send_file(self, head=False):
            path = urlsplit(self.path).path
            if path == "/quadruped":
                self.send_response(308)
                self.send_header("Location", "/quadruped/")
                self.end_headers()
                return
            name = "index.html" if path == "/quadruped/" else path.removeprefix("/quadruped/")
            if not path.startswith("/quadruped/") or name not in FILES:
                self.send_error(404)
                return
            file = root / name
            if not file.is_file():
                self.send_error(404)
                return
            size = file.stat().st_size
            start, end, status = 0, size - 1, 200
            requested = self.headers.get("Range")
            if requested:
                match = re.fullmatch(r"bytes=(\d+)-(\d*)", requested)
                if not match:
                    self.send_error(416)
                    return
                start = int(match[1])
                end = min(int(match[2]) if match[2] else end, end)
                if start > end:
                    self.send_error(416)
                    return
                status = 206
            self.send_response(status)
            self.send_header("Content-Type", FILES[name])
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; frame-ancestors 'self'; base-uri 'self'")
            if status == 206:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            if not head:
                with file.open("rb") as stream:
                    stream.seek(start)
                    remaining = end - start + 1
                    try:
                        while remaining:
                            data = stream.read(min(remaining, 65536))
                            if not data:
                                break
                            self.wfile.write(data)
                            remaining -= len(data)
                    except (BrokenPipeError, ConnectionResetError):
                        pass

        def log_message(self, *args):
            pass
    return Preview


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--port", type=int, default=18092)
    args = parser.parse_args()
    ThreadingHTTPServer(("127.0.0.1", args.port), handler(args.directory)).serve_forever()
