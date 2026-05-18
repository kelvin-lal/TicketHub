(() => {
  const dcInput = document.getElementById("datacenter");
  const statusEl = document.getElementById("status");
  const summaryEl = document.getElementById("summary");
  const countEl = document.getElementById("count");
  const breakdownEl = document.getElementById("breakdown");
  const openSection = document.getElementById("open-section");
  const pendingSection = document.getElementById("pending-section");
  const openEl = document.getElementById("tickets-open");
  const pendingEl = document.getElementById("tickets-pending-hold");
  const cardTpl = document.getElementById("ticket-card");
  const progressPanel = document.getElementById("progress-panel");
  const progressBar = document.getElementById("progress-bar");
  const progressPhase = document.getElementById("progress-phase");
  const progressCounts = document.getElementById("progress-counts");

  const COUNT_PHASE_END = 0.1;
  const COUNT_PHASE_CAP = 0.09;
  const COUNT_PHASE_DURATION_MS = 30_000;
  const FETCH_PHASE_CAP = 0.99;
  const FETCH_PHASE_DURATION_MS = 60_000;

  progressBar.max = 1;

  let evtSource = null;
  let animationTimer = null;

  function showError(message) {
    statusEl.hidden = false;
    statusEl.className = "status error";
    statusEl.textContent = message;
  }

  function clearError() {
    statusEl.hidden = true;
    statusEl.textContent = "";
  }

  function setPhase(text) {
    progressPhase.textContent = text;
  }

  function setCounts(text) {
    progressCounts.textContent = text || "";
  }

  function setBar(fraction) {
    progressBar.value = Math.max(0, Math.min(1, fraction));
  }

  function stopAnimation() {
    if (animationTimer !== null) {
      clearInterval(animationTimer);
      animationTimer = null;
    }
  }

  function animateBar(fromFraction, toFraction, durationMs, capFraction) {
    stopAnimation();
    const start = performance.now();
    setBar(fromFraction);
    animationTimer = setInterval(() => {
      const elapsed = performance.now() - start;
      const ratio = Math.min(elapsed / durationMs, 1);
      const target = fromFraction + (toFraction - fromFraction) * ratio;
      const capped = Math.min(target, capFraction);
      setBar(capped);
      if (ratio >= 1) {
        stopAnimation();
      }
    }, 50);
  }

  function ticketStatus(t) {
    const raw = t.raw || {};
    const attrs = raw.attributes || {};
    return (attrs.status || raw.status || t.status || "unknown").toLowerCase();
  }

  function ticketSubject(t) {
    const raw = t.raw || {};
    const attrs = raw.attributes || {};
    return attrs.subject || raw.subject || t.subject || "(no subject)";
  }

  function renderBreakdown(tickets) {
    const counts = tickets.reduce((acc, t) => {
      const k = ticketStatus(t);
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

  function appendTicket(container, t) {
    const node = cardTpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".ticket-id").textContent = `#${t.id}`;
    const cardStatus = node.querySelector(".ticket-status");
    const statusKey = ticketStatus(t);
    cardStatus.textContent = statusKey;
    cardStatus.classList.add(`status-${statusKey}`);
    node.querySelector(".ticket-subject").textContent = ticketSubject(t);
    node.querySelector(".ticket-raw").textContent = JSON.stringify(
      t.raw || t,
      null,
      2
    );
    container.appendChild(node);
  }

  function renderTickets(tickets) {
    openEl.innerHTML = "";
    pendingEl.innerHTML = "";

    const open = [];
    const pending = [];
    for (const t of tickets) {
      if (ticketStatus(t) === "open") {
        open.push(t);
      } else {
        pending.push(t);
      }
    }

    for (const t of open) appendTicket(openEl, t);
    for (const t of pending) appendTicket(pendingEl, t);

    openSection.hidden = open.length === 0;
    pendingSection.hidden = pending.length === 0;
  }

  function startStream() {
    const dc = dcInput.value.trim() || "us1.prod.dog";
    dcInput.disabled = true;
    clearError();
    summaryEl.hidden = true;
    openEl.innerHTML = "";
    pendingEl.innerHTML = "";
    openSection.hidden = true;
    pendingSection.hidden = true;

    progressPanel.hidden = false;
    setPhase("Starting agent…");
    setCounts("");
    animateBar(0, COUNT_PHASE_END, COUNT_PHASE_DURATION_MS, COUNT_PHASE_CAP);

    if (evtSource) {
      evtSource.close();
    }
    evtSource = new EventSource(
      `/api/tickets/stream?datacenter=${encodeURIComponent(dc)}`
    );

    evtSource.addEventListener("phase", (e) => {
      const data = JSON.parse(e.data);
      if (data.phase === "counting") {
        setPhase(`Counting open tickets on ${data.datacenter}…`);
      } else if (data.phase === "fetching") {
        setPhase(`Fetching tickets from ${data.datacenter}…`);
      }
    });

    evtSource.addEventListener("total", (e) => {
      const data = JSON.parse(e.data);
      setCounts(`${data.total} ticket${data.total === 1 ? "" : "s"}`);
      stopAnimation();
      setBar(COUNT_PHASE_END);
      if (data.total > 0) {
        animateBar(
          COUNT_PHASE_END,
          1,
          FETCH_PHASE_DURATION_MS,
          FETCH_PHASE_CAP
        );
      }
    });

    evtSource.addEventListener("done", (e) => {
      const data = JSON.parse(e.data);
      stopAnimation();
      setBar(1);
      const tickets = data.tickets || [];
      countEl.textContent = data.count;
      renderBreakdown(tickets);
      renderTickets(tickets);
      summaryEl.hidden = false;
      progressPanel.hidden = true;
      if (data.count === 0) {
        statusEl.hidden = false;
        statusEl.className = "status idle";
        statusEl.textContent = `No open tickets on ${data.datacenter}.`;
      }
      stopStream();
    });

    evtSource.addEventListener("error", (e) => {
      stopAnimation();
      if (e.data) {
        try {
          const data = JSON.parse(e.data);
          showError(`Failed to fetch tickets:\n${data.error}`);
        } catch {
          showError("Connection error while fetching tickets.");
        }
      } else {
        showError("Connection error while fetching tickets.");
      }
      progressPanel.hidden = true;
      stopStream();
    });
  }

  function stopStream() {
    if (evtSource) {
      evtSource.close();
      evtSource = null;
    }
    dcInput.disabled = false;
  }

  dcInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startStream();
  });

  startStream();
})();
