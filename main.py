"""ticket-hub entrypoint.

Run directly to print the current user's open Zendesk tickets to stdout:

    python main.py
    python main.py --datacenter us1.staging.dog
    python main.py --json
"""

from __future__ import annotations

import argparse
import json
import sys

from ticket_fetcher import (
    DEFAULT_DATACENTER,
    TicketFetchError,
    fetch_tickets,
)


def _format_table(tickets) -> str:
    if not tickets:
        return "No open tickets."

    id_w = max(len("ID"), max(len(str(t.id)) for t in tickets))
    status_w = max(len("Status"), max(len(t.status) for t in tickets))
    header = f"{'ID':<{id_w}}  {'Status':<{status_w}}  Subject"
    sep = "-" * len(header)
    lines = [header, sep]
    for t in tickets:
        lines.append(f"{str(t.id):<{id_w}}  {t.status:<{status_w}}  {t.subject}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Print open Zendesk tickets via Claude.")
    parser.add_argument(
        "--datacenter",
        default=DEFAULT_DATACENTER,
        help=f"supportdog datacenter (default: {DEFAULT_DATACENTER})",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit raw JSON instead of a formatted table.",
    )
    args = parser.parse_args(argv)

    try:
        tickets = fetch_tickets(datacenter=args.datacenter)
    except TicketFetchError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps([t.to_dict() for t in tickets], indent=2))
    else:
        print(_format_table(tickets))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
