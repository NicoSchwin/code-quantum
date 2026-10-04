"""Serveur local de test : sert l'application et enregistre les exports POSTés
sur /__save?name=fichier.xlsx dans le dossier donné en argument (tests auto)."""
import http.server
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "exports-test"


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        OUT.mkdir(parents=True, exist_ok=True)
        data = self.rfile.read(int(self.headers["Content-Length"]))
        (OUT / Path(q["name"][0]).name).write_bytes(data)
        self.send_response(200)
        self.end_headers()


http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
