(() => {
  const dcInput = document.getElementById("datacenter");
  const statusEl = document.getElementById("status");
  const summaryEl = document.getElementById("summary");
  const countEl = document.getElementById("count");
  const breakdownEl = document.getElementById("breakdown");
  const ticketsEl = document.getElementById("tickets");
  const cardTpl = document.getElementById("ticket-card");
  const progressPanel = document.getElementById("progress-panel");
  const progressBar = document.getElementById("progress-bar");
  const progressPhase = document.getElementById("progress-phase");
  const progressCounts = document.getElementById("progress-counts");

  let evtSource = null;
  let receivedTickets = [];

  function showError(message) {
    statusEl.hidden = false;
    statusEl.textContent = message;
  }

  function clearError() {
    statusEl.hidden = true;
    statusEl.textContent = "";
  }

  function setPhase(text) {
    progressPhase.textContent = text;
  }

  function setCounts(current, total) {
    if (total > 0) {
      progressCounts.textContent = `${current} / ${total}`;
    } else {
      progressCounts.textContent = "";
    }
  }

  function setProgress(current, total) {
    progressBar.max = total > 0 ? total : 1;
    progressBar.value = current;
    progressBar.classList.toggle("indeterminate", total === 0);
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

  function appendTicketCard(t) {
    const node = cardTpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".ticket-id").textContent = `#${t.id}`;
    const cardStatus = node.querySelector(".ticket-status");
    const statusKey = (t.status || "unknown").toLowerCase();
    cardStatus.textContent = statusKey;
    cardStatus.classList.add(`status-${statusKey}`);
    node.querySelector(".ticket-subject").textContent =
      t.subject || "(no subject)";
    node.querySelector(".ticket-raw").textContent = JSON.stringify(
      t.raw || t,
      null,
      2
    );
    ticketsEl.appendChild(node);
  }

  function startStream() {
    const dc = dcInput.value.trim() || "us1.prod.dog";
    dcInput.disabled = true;
    clearError();
    summaryEl.hidden = true;
    ticketsEl.innerHTML = "";
    receivedTickets = [];

    progressPanel.hidden = false;
    setPhase("Starting agent…");
    setCounts(0, 0);
    setProgress(0, 0);

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
      }
    });

    evtSource.addEventListener("total", (e) => {
      const data = JSON.parse(e.data);
      setPhase(`Fetching tickets from ${data.datacenter}`);
      setCounts(0, data.total);
      setProgress(0, data.total);
      if (data.total === 0) {
        finishStream(data.datacenter, 0);
      }
    });

    evtSource.addEventListener("ticket", (e) => {
      const data = JSON.parse(e.data);
      receivedTickets.push(data.ticket);
      appendTicketCard(data.ticket);
      setCounts(data.index, data.total);
      setProgress(data.index, data.total);
    });

    evtSource.addEventListener("done", (e) => {
      const data = JSON.parse(e.data);
      finishStream(data.datacenter, data.count);
    });

    evtSource.addEventListener("error", (e) => {
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
      stopStream();
    });
  }

  function finishStream(datacenter, count) {
    countEl.textContent = count;
    renderBreakdown(receivedTickets);
    summaryEl.hidden = false;
    progressPanel.hidden = true;
    if (count === 0) {
      showError(`No open tickets on ${datacenter}.`);
      statusEl.className = "status idle";
    }
    stopStream();
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
