#!/usr/bin/env python3
"""
tests/mock-render.py — servidor falso da API do Render.

Serve para testar `scripts/render-deploy.sh` sem depender do Render real e
sem gastar deploy de verdade. Reproduz os endpoints que o script usa:

  GET   /v1/services
  GET   /v1/services/{id}
  PATCH /v1/services/{id}
  GET   /v1/services/{id}/env-vars
  PUT   /v1/services/{id}/env-vars
  POST  /v1/services/{id}/deploys
  GET   /v1/services/{id}/deploys/{deployId}

A resposta de /api/health vem de um segundo servidor (o "app"), para que o
script valide o healthcheck de verdade.

USO (nos testes):
    python3 tests/mock-render.py --port 8799 --health-port 8798
"""
import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

SERVICE = {
    "id": "srv-mock-001",
    "name": "essencia-backend",
    "slug": "essencia-backend-mock",
    "type": "web",
    "repo": "https://github.com/Nexus-HUB57/Essencia_do_Cuidar",
    "branch": "main",
    "rootDir": "backend",
    "autoDeployTrigger": "commit",
    "serviceDetails": {
        "buildCommand": "npm install --omit=dev",
        "startCommand": "node src/index.js",
    },
}

ENV_VARS = [
    {"key": "NODE_ENV", "value": "production"},
    {"key": "JWT_SECRET", "value": "abc123"},
]

STATE = {"deploy_status": "created", "polls": 0, "patched": [], "env_put": None}


class RenderHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/v1/services":
            return self._json(200, [SERVICE])
        if path == f"/v1/services/{SERVICE['id']}":
            return self._json(200, SERVICE)
        if path == f"/v1/services/{SERVICE['id']}/env-vars":
            # devolve o que foi gravado no PUT (o mock guarda o estado real)
            return self._json(200, STATE["env_put"] if STATE["env_put"] is not None else ENV_VARS)
        if path.startswith(f"/v1/services/{SERVICE['id']}/deploys/"):
            STATE["polls"] += 1
            # simula o deploy concluindo na 3ª consulta
            if STATE["polls"] >= 3:
                STATE["deploy_status"] = "live"
            return self._json(200, {
                "id": "dep-mock-001",
                "status": STATE["deploy_status"],
                "commit": {"id": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b"},
                "trigger": "api",
            })
        return self._json(404, {"message": "not found"})

    def do_PATCH(self):
        path = urlparse(self.path).path
        body = self._body()
        if path == f"/v1/services/{SERVICE['id']}":
            STATE["patched"].append(body)
            for k, v in body.items():
                if k == "serviceDetails":
                    SERVICE.setdefault("serviceDetails", {}).update(v)
                else:
                    SERVICE[k] = v
            return self._json(200, SERVICE)
        return self._json(404, {"message": "not found"})

    def do_PUT(self):
        path = urlparse(self.path).path
        body = self._body()
        if path == f"/v1/services/{SERVICE['id']}/env-vars":
            STATE["env_put"] = body
            return self._json(200, body)
        return self._json(404, {"message": "not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        if path == f"/v1/services/{SERVICE['id']}/deploys":
            STATE["deploy_status"] = "build_in_progress"
            return self._json(201, {"id": "dep-mock-001", "status": "created"})
        return self._json(404, {"message": "not found"})


class HealthHandler(BaseHTTPRequestHandler):
    """Finge ser o backend: /api/health devolve JSON."""

    def log_message(self, *_args):
        pass

    def do_HEAD(self):
        if urlparse(self.path).path == "/api/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin",
                             "https://essenciadocuidar.netlify.app")
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        if urlparse(self.path).path == "/api/health":
            body = json.dumps({"ok": True, "db": "sqlite", "version": "1.4.2"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin",
                             "https://essenciadocuidar.netlify.app")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8799)
    ap.add_argument("--health-port", type=int, default=8798)
    args = ap.parse_args()

    h = ThreadingHTTPServer(("127.0.0.1", args.port), RenderHandler)
    a = ThreadingHTTPServer(("127.0.0.1", args.health_port), HealthHandler)
    threading.Thread(target=h.serve_forever, daemon=True).start()
    threading.Thread(target=a.serve_forever, daemon=True).start()
    print(f"mock render em :{args.port} | health em :{args.health_port}", flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
