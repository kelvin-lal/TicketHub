# ticket-hub

Python tool that queries Zendesk tickets by driving the **Claude Code** CLI
(`claude -p`) with the `aaa-governance-gts:supportdog` plugin/skill, plus a
small Flask GUI for browsing them locally.

## Prerequisites

1. [`claude` CLI](https://docs.claude.com/) installed and signed in.
2. Install the supportdog skill once:
   ```
   claude plugin marketplace add https://github.com/DataDog/claude-marketplace
   /plugin install aaa-governance-gts@datadog-claude-plugins
   ```
3. Be on VPN / AppGate so the datacenter is reachable.
4. Python 3.10+.

Install Python deps:

```
pip install -r requirements.txt
```

## CLI usage

```
python main.py                          # pretty table, prod (us1.prod.dog)
python main.py --json                   # raw JSON
python main.py --datacenter us1.staging.dog
```

## Local GUI

```
python front_end/server.py
```

Then open <http://localhost:5050>.

## Layout

```
ticket-hub/
├── __init__.py
├── main.py             # CLI entrypoint
├── ticket_fetcher.py   # Core: spawns `claude -p`, parses JSON
├── requirements.txt
└── front_end/
    ├── server.py       # Flask app
    ├── templates/index.html
    └── static/{style.css,app.js}
```
