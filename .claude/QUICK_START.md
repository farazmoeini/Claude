# Quick Start

```bash
pip install -r <app>/requirements.txt
cd <app> && python -m pytest -q        # streamcut, angebotsblitz
cd streamcut && uvicorn app:app --port 8000
cd angebotsblitz && uvicorn app:app --port 8200
cd tellerblick/backend && BILLING_MODE=off uvicorn app:app --port 8300
cd lernapp && python3 -m http.server 8101
cd satzbuch && python3 -m http.server 8411
```

Token-Check: `npx -y claude-token-optimizer measure` · Aufräumen: `npx -y claude-token-optimizer prune --yes`
