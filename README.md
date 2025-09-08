# Shardbound Demo & Admin Tools

## Run the Server

1. Install dependencies: `pip install -r requirements.txt`
2. Seed demo data: `python db_cli.py seed-starter`
3. Start the server: `python api.py`
4. Visit `http://localhost:5000`

To access admin features set an admin passphrase before running the server:
```
export ADMIN_PANEL_PASSWORD="your-passphrase"
```

Logged-in users whose `role` is `admin` or `dev` skip the passphrase screen and
are automatically issued an admin token when visiting `/admin/login`.

## Admin Interfaces

### UIs
- **/admin/login** – enter the passphrase to access tools.
- **/admin** – main panel with token generator and links to other tools.
- **/vault** – browse users, characters, items, instances, inventory, recipes, resources and teleport characters.
- **/itemForge** – item editor.
- **/admin/console** – web console for running admin commands.

### API Endpoints
All endpoints require an admin token in `Authorization: Bearer <TOKEN>`.

Users:
- `GET /api/admin/users`
- `GET /api/admin/users/<id>`
- `POST /api/admin/users`
- `PATCH /api/admin/users/<id>`
- `DELETE /api/admin/users/<id>`

Characters:
- `GET /api/admin/characters`
- `GET /api/admin/characters/<id>`
- `POST /api/admin/characters`
- `PATCH /api/admin/characters/<id>`
- `DELETE /api/admin/characters/<id>`
- `POST /api/admin/characters/<id>/teleport`
- `GET /api/admin/characters/<id>/inventory`

Items:
- `GET /api/admin/items`
- `GET /api/admin/items/<id>`
- `POST /api/admin/items`
- `PATCH /api/admin/items/<id>`
- `DELETE /api/admin/items/<id>`
- `GET /api/admin/item_instances`

Optional Domains:
- `GET /api/admin/recipes`
- `GET /api/admin/resources`

Admin Console:
- `POST /api/admin/console/exec`

Classes Admin:
- `POST /api/classes-admin/init`
- `GET /api/classes-admin/list`
- `GET /api/classes-admin/get/<cid>`
- `POST /api/classes-admin/new`
- `PATCH/POST /api/classes-admin/save`
- `POST /api/classes-admin/validate`
- `POST /api/classes-admin/publish`
- `POST /api/classes-admin/yank`

### Admin Console Commands
Accessible via the web console or the `POST /api/admin/console/exec` endpoint.

- `help` – list available commands.
- `char:move <character_id> --x INT --y INT [--note NOTE | --snap-to-spawn | --town TOWN_ID]`

### DB CLI Commands
Run `python db_cli.py <command>`.

Users/Characters:
- `users`, `user`, `characters`

DB Inspection:
- `tables` – list table names with row counts
- `head <table>` – show rows from a table (`--limit`, `--id`, `--where`)
- `sql`, `export`

Items/Inventory:
- `items`, `item`, `item-upsert`, `instances`, `mint`, `inventory`, `grant`,
  `validate-items`, `items-export`, `items-import`, `bulk-grant`

World & Gameplay Helpers:
- `seed-world`, `list-shards`, `seed-starter`, `quest-reset`

## Demo Warrior Scenario
1. `python db_cli.py seed-starter`
2. Start the Flask server: `python api.py`
3. Open the game and log in.
4. Create a Warrior (`POST /api/game/characters` or via UI).
5. Spawn at (12,15) and note the Enter Town option.
6. Enter the town and explore the 3x3 grid.
7. Find the shady figure and accept the letter quest.
8. Leave town and move to (13,12) to trigger the goblin ambush.
9. Defeat the goblins, then travel to (14,9) to meet the Harbormaster.
10. Talk to the Harbormaster to complete the quest.

## Inventory API & UI Demo

This repo now includes a tiny inventory system wired end-to-end.

### Setup
1. Apply migrations (uses SQLite by default):
   ```
   FLASK_APP=api.py flask db upgrade
   ```
2. Start the development server:
   ```
   python api.py
   ```
3. Visit [http://localhost:5000/play](http://localhost:5000/play).
4. A panel near the bottom shows the inventory for `demo-character-id`.
   Use the **Add Potion** and **Remove Potion** buttons to test the
   `/api/characters/<id>/inventory` endpoints.

