# ticket-hub: split tickets by status, fix subject/status extraction

## Context

The ticket-hub Flask GUI today renders every ticket returned by `supportdog ... get-my-zendesk-tickets` into a single grid (`#tickets`). Two problems make it nearly unusable:

1. **Status badges all read "UNKNOWN"** — `app.js` falls back to `"unknown"` when `t.status` is falsy (app.js:94), and `ticket_fetcher.py` defaults to `"unknown"` when `row.get("status")` is missing (ticket_fetcher.py:124). The actual supportdog payload appears to carry `status` at a different key path than the top level of each row.
2. **Subjects all read "(no subject)"** — same shape: `row.get("subject") or row.get("title") or "(no subject)"` (ticket_fetcher.py:123) misses the real subject location.

In addition, the user wants two stacked sections instead of one undifferentiated grid:
- **Open tickets** — `status == "open"` only
- **Pending / On Hold** — `status in {"pending", "hold"}` (rendered below the Open section, no clickable tabs)

And the status badge colors need to change to **red = open, blue = pending, green = on hold** (currently blue / amber / gray in style.css:270–288).

## Approach

### Step 0 — Identify the real payload key paths (one-time inspection)

Before editing extraction logic, run the existing app and inspect a real raw payload:
```sh
python -m front_end.server
```
Open `http://localhost:5000`, expand a ticket card's `<details>Raw payload</details>` block, and note where `subject` and `status` actually live inside `t.raw` (e.g. nested under `raw.ticket.subject`, or under a key like `raw.fields.status`).

Apply the discovered key path in the changes below. Pseudo-paths used in this spec (`raw.<...>.subject` / `raw.<...>.status`) are placeholders.

### Step 1 — `ticket_fetcher.py`: robust field extraction

Replace lines 119–127 of `ticket_fetcher.py` with extraction that walks common nested locations before giving up. Concretely, add small helpers `_pluck_subject(row)` and `_pluck_status(row)` that try, in order:

- `row["subject"]`, `row["title"]`
- `row["ticket"]["subject"]`, `row["ticket"]["title"]` (if Zendesk wraps each row in a `ticket` object)
- `row["fields"]["subject"]` (defensive)
- whichever key path Step 0 confirmed

Same pattern for status. Only fall back to `"(no subject)"` / `"unknown"` if every path is empty.

The `Ticket` dataclass (lines 47–57) and `to_dict()` payload shape stay unchanged — only the extraction logic moves.

### Step 2 — `front_end/templates/index.html`: split into two sections

Replace the single `#tickets` section (line 42) with two sibling sections, each with its own heading. Keep the existing `<template id="ticket-card">` (lines 45–57) as-is — it'll be cloned into either section.

```html
<section id="open-section" class="tickets-section" hidden>
  <h2 class="section-title">Open tickets</h2>
  <div id="tickets-open" class="tickets"></div>
</section>

<section id="pending-section" class="tickets-section" hidden>
  <h2 class="section-title">Pending / On Hold</h2>
  <div id="tickets-pending-hold" class="tickets"></div>
</section>
```

Each section is hidden by default and revealed only when it has at least one ticket — keeps the layout clean when one bucket is empty.

### Step 3 — `front_end/static/app.js`: partition rendering

In `renderTickets()` (lines 88–106), partition the tickets array by status, then render each bucket into its own container. Reuse the existing `cardTpl` cloning logic — just route to the right parent node.

```js
const openSection = document.getElementById("open-section");
const pendingSection = document.getElementById("pending-section");
const openEl = document.getElementById("tickets-open");
const pendingEl = document.getElementById("tickets-pending-hold");

function renderTickets(tickets) {
  openEl.innerHTML = "";
  pendingEl.innerHTML = "";

  const open = tickets.filter(t => (t.status || "").toLowerCase() === "open");
  const pending = tickets.filter(t => {
    const s = (t.status || "").toLowerCase();
    return s === "pending" || s === "hold";
  });

  for (const t of open) appendTicket(openEl, t);
  for (const t of pending) appendTicket(pendingEl, t);

  openSection.hidden = open.length === 0;
  pendingSection.hidden = pending.length === 0;
}

function appendTicket(container, t) {
  const node = cardTpl.content.firstElementChild.cloneNode(true);
  node.querySelector(".ticket-id").textContent = `#${t.id}`;
  const cardStatus = node.querySelector(".ticket-status");
  const statusKey = (t.status || "unknown").toLowerCase();
  cardStatus.textContent = statusKey;
  cardStatus.classList.add(`status-${statusKey}`);
  node.querySelector(".ticket-subject").textContent = t.subject || "(no subject)";
  node.querySelector(".ticket-raw").textContent = JSON.stringify(t.raw || t, null, 2);
  container.appendChild(node);
}
```

The old `ticketsEl` reference (app.js:7) is removed; replace any other usages (app.js:113) with both `openEl.innerHTML = ""` and `pendingEl.innerHTML = ""` (or extract a helper).

Tickets with statuses outside `{open, pending, hold}` (e.g. `solved`, `closed`) are dropped from the view. If they need to be preserved, add a third bucket — but per the spec they're excluded.

### Step 4 — `front_end/static/style.css`: recolor status badges

Update the existing status classes (lines 270–288) to match the spec exactly:

```css
.ticket-status.status-open {
  color: var(--danger);                  /* red */
  border-color: rgba(239, 68, 68, 0.4);
}

.ticket-status.status-pending {
  color: var(--info);                    /* blue */
  border-color: rgba(56, 189, 248, 0.4);
}

.ticket-status.status-hold {
  color: var(--ok);                      /* green */
  border-color: rgba(34, 197, 94, 0.4);
}
```

Leave `.status-solved` / `.status-closed` as-is. Also add a light style for `.section-title` and `.tickets-section` spacing if the existing grid CSS doesn't already accommodate the wrapper.

## Files to modify

| File | Change |
|---|---|
| `ticket_fetcher.py` | Extend subject/status extraction to handle nested key paths (lines 119–127) |
| `front_end/templates/index.html` | Replace single `#tickets` section with two stacked sections + headings (line 42) |
| `front_end/static/app.js` | Partition tickets by status; render into two containers; show/hide sections (lines 7, 88–106, 113) |
| `front_end/static/style.css` | Recolor `.status-open` red, `.status-pending` blue, `.status-hold` green (lines 270–288) |

No changes needed in `front_end/server.py`, `main.py`, or `__init__.py` — the data contract (`{id, subject, status, raw}`) is unchanged.

## Verification

1. **Start the server**: `python -m front_end.server`, then open `http://localhost:5000`.
2. **Subject check**: Every ticket card should display its real Zendesk subject. No card should read "(no subject)" unless the underlying ticket genuinely has no subject.
3. **Status check**: Every ticket card should display a real status (`open`, `pending`, or `hold`). No card should read "unknown".
4. **Section split**:
   - Tickets with `status == "open"` appear only in the **Open tickets** section.
   - Tickets with `status` in `{"pending", "hold"}` appear only in the **Pending / On Hold** section.
   - Sections with zero tickets are hidden.
5. **Color check** (visual): open badge is red, pending badge is blue, on-hold badge is green.
6. **Edge cases**:
   - If supportdog returns no tickets, both sections stay hidden and the existing "No open tickets on …" idle message still appears (app.js:161–165).
   - If a ticket has a status outside the three handled values, it is currently dropped — confirm with the user whether that's acceptable, or add a third "Other" bucket.

## Open questions for review

- **Step 0 inspection**: the exact nested key for `subject` / `status` in the supportdog payload is unknown without running the app. The plan assumes it lives somewhere reachable from `row` — confirm during implementation.
- **Solved/closed tickets**: dropped from view by default. Acceptable, or surface in a third section?
