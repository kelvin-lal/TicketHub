"""ticket-hub: Python wrapper around Claude Code for Zendesk ticket queries."""

from ticket_fetcher import (
    DEFAULT_DATACENTER,
    Ticket,
    TicketFetchError,
    fetch_tickets,
    fetch_tickets_as_dicts,
)

__all__ = [
    "DEFAULT_DATACENTER",
    "Ticket",
    "TicketFetchError",
    "fetch_tickets",
    "fetch_tickets_as_dicts",
]
