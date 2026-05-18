(() => {
  const refreshBtn = document.getElementById("refresh");
  const dcInput = document.getElementById("datacenter");
  const statusEl = document.getElementById("status");
  const summaryEl = document.getElementById("summary");
  const countEl = document.getElementById("count");
  const breakdownEl = document.getElementById("breakdown");
  const ticketsEl = document.getElementById("tickets");
  const cardTpl = document.getElementById("ticket-card");

  function setStatus(kind, message) {
    statusEl.className = `status ${kind}`;
    statusEl.textContent = message;
  }

  function renderBreakdown(tickets) {
    const counts = tickets.reduce((acc, t) => {
      const k = (t.status || "unknown").toLowerCase();
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    breakdownEl.innerHTML = "";
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, n]) => {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = `${status}: ${n}`;
        breakdownEl.appendChild(pill);
      });
  }

  function renderTickets(tickets) {
    ticketsEl.innerHTML = "";
    for (const t of tickets) {
      const node = cardTpl.content.firstElementChild.cloneNode(true);
      node.querySelector(".ticket-id").textContent = `#${t.id}`;
      const statusEl = node.querySelector(".ticket-status");
      const statusKey = (t.status || "unknown").toLowerCase();
      statusEl.textContent = statusKey;
      statusEl.classList.add(`status-${statusKey}`);
      node.querySelector(".ticket-subject").textContent =
        t.subject || "(no subject)";
      node.querySelector(".ticket-raw").textContent = JSON.stringify(
        t.raw || t,
        null,
        2
      );
      ticketsEl.appendChild(node);
    }
  }

  async function fetchTickets() {
    const dc = dcInput.value.trim() || "us1.prod.dog";
    refreshBtn.disabled = true;
    summaryEl.hidden = true;
    ticketsEl.innerHTML = "";
    setStatus(
      "loading",
      `Querying ${dc} via Claude… (this can take 30-90s while claude -p spins up)`
    );

    try {
      const res = await fetch(
        `/api/tickets?datacenter=${encodeURIComponent(dc)}`
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const tickets = body.tickets || [];
      countEl.textContent = tickets.length;
      renderBreakdown(tickets);
      renderTickets(tickets);
      summaryEl.hidden = false;
      if (tickets.length === 0) {
        setStatus("idle", `No open tickets on ${body.datacenter}.`);
      } else {
        setStatus(
          "idle",
          `Fetched ${tickets.length} ticket(s) from ${body.datacenter}.`
        );
      }
    } catch (err) {
      setStatus("error", `Failed to fetch tickets:\n${err.message}`);
    } finally {
      refreshBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener("click", fetchTickets);
  dcInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") fetchTickets();
  });
})();
