# Developer Guide

This document helps new contributors get the Shardbound demo and admin tools running locally and understand the code structure.

## Getting Started

1. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```
2. **Seed starter data**
   ```bash
   python db_cli.py seed-starter
   ```
3. **Run migrations (optional for new databases)**
   ```bash
   FLASK_APP=api.py flask db upgrade
   ```
4. **Start the development server**
   ```bash
   python api.py
   ```
   The server listens on `http://localhost:5000`.

## Project Layout

| Path | Purpose |
|------|---------|
| `api/` | Flask blueprints, models, and services. |
| `client/` | Static client assets and templates. |
| `engine/` | Game mechanics and world generation logic. |
| `shardEngine/` | Experimental shard generation service. |
| `tests/` | Automated tests run with `pytest`. |
| `db_cli.py` | Utility commands for seeding and inspecting the database. |

## Running Tests

Use `pytest` to run the test suite:
```bash
pytest
```

## API Reference

A full list of HTTP endpoints with `curl` examples is available in
[`API_MAPPING.md`](API_MAPPING.md).

