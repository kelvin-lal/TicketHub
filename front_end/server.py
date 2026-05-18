"""Flask GUI for ticket-hub.

Serves a single-page UI at `/` and exposes `/api/tickets` which proxies
`ticket_fetcher.fetch_tickets()`. Run:

    python front_end/server.py
    # or: python front_end/server.py --port 5050 --datacenter us1.staging.dog
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from flask import Flask, jsonify, render_template, request

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ticket_fetcher import (  # noqa: E402  (import after sys.path tweak)
    DEFAULT_DATACENTER,
    TicketFetchError,
    fetch_tickets,
)


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder=str(Path(__file__).parent / "templates"),
        static_folder=str(Path(__file__).parent / "static"),
    )
    app.config["DEFAULT_DATACENTER"] = os.environ.get(
        "TICKET_HUB_DATACENTER", DEFAULT_DATACENTER
    )

    @app.get("/")
    def index():
        return render_template(
            "index.html",
            default_datacenter=app.config["DEFAULT_DATACENTER"],
        )

    @app.get("/api/tickets")
    def api_tickets():
        dc = request.args.get("datacenter") or app.config["DEFAULT_DATACENTER"]
        try:
            tickets = fetch_tickets(datacenter=dc)
        except TicketFetchError as exc:
            return jsonify({"error": str(exc), "datacenter": dc}), 502
        return jsonify(
            {
                "datacenter": dc,
                "count": len(tickets),
                "tickets": [t.to_dict() for t in tickets],
            }
        )

    return app


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ticket-hub local GUI server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5050)
    parser.add_argument("--datacenter", default=DEFAULT_DATACENTER)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args(argv)

    os.environ["TICKET_HUB_DATACENTER"] = args.datacenter
    app = create_app()
    print(f"ticket-hub GUI listening on http://{args.host}:{args.port}  (datacenter={args.datacenter})")
    app.run(host=args.host, port=args.port, debug=args.debug)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
