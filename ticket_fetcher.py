"""Fetch open Zendesk tickets by driving the Claude Code CLI headlessly.

This module shells out to `claude -p` (print / non-interactive mode) with a
prompt that asks Claude to use its `aaa-governance-gts:supportdog` skill to
query Zendesk. We force a JSON-only response so Python can parse it back.

The CLI flow that this wraps is the one demonstrated interactively:
    claude  ->  /plugin install aaa-governance-gts@datadog-claude-plugins
            ->  "fetch my open zendesk tickets"
which under the hood runs:
    supportdog --datacenter us1.prod.dog zendesk get-my-zendesk-tickets
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from dataclasses import dataclass, asdict
from typing import Any


DEFAULT_DATACENTER = "us1.prod.dog"

CLAUDE_PROMPT_TEMPLATE = (
    "Use the aaa-governance-gts:supportdog skill to run "
    "`supportdog --datacenter {datacenter} zendesk get-my-zendesk-tickets` "
    "and return ONLY the raw JSON object it produces. "
    "Do not add commentary, markdown, or code fences."
)

CLAUDE_PROMPT_IDS_TEMPLATE = (
    "Use the aaa-governance-gts:supportdog skill to run "
    "`supportdog --datacenter {datacenter} zendesk get-my-zendesk-tickets`. "
    "Return ONLY a JSON object of the form "
    '{{"ids": [<ticket_id>, ...]}} containing every open ticket id. '
    "Do not add commentary, markdown, or code fences."
)



class TicketFetchError(RuntimeError):
    """Raised when the Claude CLI invocation fails or returns unparseable output."""


@dataclass
class Ticket:
    """Lightweight, GUI-friendly view of a Zendesk ticket."""

    id: int | str
    subject: str
    status: str
    raw: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _ensure_claude_available() -> str:
    """Return the resolved path to the `claude` binary or raise."""
    path = shutil.which("claude")
    if not path:
        raise TicketFetchError(
            "`claude` CLI not found on PATH. Install Claude Code and run "
            "`/plugin install aaa-governance-gts@datadog-claude-plugins` first."
        )
    return path


def _extract_json(text: str) -> dict[str, Any]:
    """Pull the first JSON object out of arbitrary CLI output."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        return json.loads(fence.group(1))

    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last != -1 and last > first:
        return json.loads(text[first : last + 1])

    raise TicketFetchError(f"Could not parse JSON from Claude output:\n{text}")


def fetch_tickets(
    datacenter: str = DEFAULT_DATACENTER,
    timeout: int = 180,
) -> list[Ticket]:
    """Invoke `claude -p` and return the parsed list of tickets."""
    claude_bin = _ensure_claude_available()
    prompt = CLAUDE_PROMPT_TEMPLATE.format(datacenter=datacenter)

    try:
        proc = subprocess.run(
            [claude_bin, "-p", prompt],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise TicketFetchError(f"claude -p timed out after {timeout}s") from exc

    if proc.returncode != 0:
        raise TicketFetchError(
            f"claude -p exited {proc.returncode}\nstderr:\n{proc.stderr.strip()}"
        )

    payload = _extract_json(proc.stdout)
    rows = payload.get("data", payload if isinstance(payload, list) else [])

    tickets: list[Ticket] = []
    for row in rows:
        tickets.append(
            Ticket(
                id=row.get("id") or row.get("ticket_id") or "",
                subject=row.get("subject") or row.get("title") or "(no subject)",
                status=row.get("status") or "unknown",
                raw=row,
            )
        )
    return tickets


def fetch_tickets_as_dicts(datacenter: str = DEFAULT_DATACENTER) -> list[dict[str, Any]]:
    """Convenience wrapper that returns plain dicts (handy for JSON APIs)."""
    return [t.to_dict() for t in fetch_tickets(datacenter=datacenter)]


def _run_claude(prompt: str, timeout: int) -> str:
    claude_bin = _ensure_claude_available()
    try:
        proc = subprocess.run(
            [claude_bin, "-p", prompt],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise TicketFetchError(f"claude -p timed out after {timeout}s") from exc
    if proc.returncode != 0:
        raise TicketFetchError(
            f"claude -p exited {proc.returncode}\nstderr:\n{proc.stderr.strip()}"
        )
    return proc.stdout


def fetch_ticket_ids(
    datacenter: str = DEFAULT_DATACENTER,
    timeout: int = 180,
) -> list[int | str]:
    """Phase 1: ask Claude for just the open ticket ids."""
    payload = _extract_json(
        _run_claude(
            CLAUDE_PROMPT_IDS_TEMPLATE.format(datacenter=datacenter),
            timeout=timeout,
        )
    )
    ids = payload.get("ids")
    if ids is None and isinstance(payload.get("data"), list):
        ids = [row.get("id") or row.get("ticket_id") for row in payload["data"]]
    if not isinstance(ids, list):
        raise TicketFetchError(f"Could not find ticket ids in payload: {payload!r}")
    return [i for i in ids if i not in (None, "")]


