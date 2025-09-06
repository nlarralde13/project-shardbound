# API Mapping

All endpoints assume the server is running on `http://localhost:5000`. Replace placeholder values like `<ID>` as needed.

## Auth API (`/api/auth`)

- `POST /api/auth/register` – create a user.
  ```bash
  curl -X POST http://localhost:5000/api/auth/register \
       -H "Content-Type: application/json" \
       -d '{"email":"user@example.com","display_name":"User","handle":"user","age":18}'
  ```
- `POST /api/auth/login` – start a session.
  ```bash
  curl -X POST http://localhost:5000/api/auth/login \
       -H "Content-Type: application/json" \
       -d '{"email":"user@example.com"}'
  ```
- `GET /api/auth/me` – current user info.
  ```bash
  curl http://localhost:5000/api/auth/me
  ```
- `PATCH /api/auth/update` – update profile.
  ```bash
  curl -X PATCH http://localhost:5000/api/auth/update \
       -H "Content-Type: application/json" \
       -d '{"display_name":"New Name"}'
  ```
- `POST /api/auth/logout` – end session.
  ```bash
  curl -X POST http://localhost:5000/api/auth/logout
  ```

## Gameplay API (`/api/game`)

- `GET /api/game/characters` – list characters.
  ```bash
  curl http://localhost:5000/api/game/characters
  ```
- `POST /api/game/characters` – create character.
  ```bash
  curl -X POST http://localhost:5000/api/game/characters \
       -H "Content-Type: application/json" \
       -d '{"name":"Hero"}'
  ```
- `DELETE /api/game/characters/<ID>` – delete character.
  ```bash
  curl -X DELETE http://localhost:5000/api/game/characters/CHAR_ID
  ```
- `POST /api/game/characters/select` – set active character.
  ```bash
  curl -X POST http://localhost:5000/api/game/characters/select \
       -H "Content-Type: application/json" \
       -d '{"character_id":"CHAR_ID"}'
  ```
- `GET /api/game/characters/active` – fetch selected character.
  ```bash
  curl http://localhost:5000/api/game/characters/active
  ```
- `POST /api/game/characters/autosave` – merge partial state.
  ```bash
  curl -X POST http://localhost:5000/api/game/characters/autosave \
       -H "Content-Type: application/json" \
       -d '{"state":{}}'
  ```
- `POST /api/game/characters/<ID>/enter_town` – enter town.
  ```bash
  curl -X POST http://localhost:5000/api/game/characters/CHAR_ID/enter_town
  ```
- `POST /api/game/characters/<ID>/leave_town` – leave town.
  ```bash
  curl -X POST http://localhost:5000/api/game/characters/CHAR_ID/leave_town
  ```
- `POST /api/game/characters/<ID>/town_move` – move inside town.
  ```bash
  curl -X POST http://localhost:5000/api/game/characters/CHAR_ID/town_move \
       -H "Content-Type: application/json" \
       -d '{"dx":1,"dy":0}'
  ```
- `POST /api/game/characters/<ID>/talk` – talk to NPC.
  ```bash
  curl -X POST http://localhost:5000/api/game/characters/CHAR_ID/talk \
       -H "Content-Type: application/json" \
       -d '{"npc_id":"NPC"}'
  ```
- `POST /api/game/characters/<ID>/move` – move on world map.
  ```bash
  curl -X POST http://localhost:5000/api/game/characters/CHAR_ID/move \
       -H "Content-Type: application/json" \
       -d '{"dx":1,"dy":0}'
  ```
- `POST /api/game/encounters/start` – start encounter.
  ```bash
  curl -X POST http://localhost:5000/api/game/encounters/start \
       -H "Content-Type: application/json" \
       -d '{"encounter_id":"E1"}'
  ```
- `POST /api/game/encounters/turn` – play encounter turn.
  ```bash
  curl -X POST http://localhost:5000/api/game/encounters/turn \
       -H "Content-Type: application/json" \
       -d '{"action":"attack"}'
  ```

## Core Game API (`/api`)

- `GET /api/shards` – list available shards.
  ```bash
  curl http://localhost:5000/api/shards
  ```
- `GET /api/world` – world metadata.
  ```bash
  curl http://localhost:5000/api/world
  ```
- `POST /api/spawn` – spawn player.
  ```bash
  curl -X POST http://localhost:5000/api/spawn
  ```
- `POST /api/move` – move player.
  ```bash
  curl -X POST http://localhost:5000/api/move \
       -H "Content-Type: application/json" \
       -d '{"dx":1,"dy":0}'
  ```
- `POST /api/interact` – interact at current tile.
  ```bash
  curl -X POST http://localhost:5000/api/interact
  ```
- `GET /api/state` – snapshot of player and room.
  ```bash
  curl http://localhost:5000/api/state
  ```
- `GET /api/discoveries` – shardgate discoveries for selected character.
  ```bash
  curl http://localhost:5000/api/discoveries
  ```

## Action API (`/api/action`)

- `POST /api/action` – dispatch a verb-based action.
  ```bash
  curl -X POST http://localhost:5000/api/action \
       -H "Content-Type: application/json" \
       -d '{"verb":"search","action_id":"1","payload":{}}'
  ```

## Inventory API (`/api/characters/<ID>`) 

- `GET /api/characters/<ID>/inventory` – fetch inventory.
  ```bash
  curl http://localhost:5000/api/characters/CHAR_ID/inventory
  ```
- `POST /api/characters/<ID>/inventory/add` – add item.
  ```bash
  curl -X POST http://localhost:5000/api/characters/CHAR_ID/inventory/add \
       -H "Content-Type: application/json" \
       -d '{"item_id":"itm_potion","qty":1}'
  ```
- `POST /api/characters/<ID>/inventory/remove` – remove item.
  ```bash
  curl -X POST http://localhost:5000/api/characters/CHAR_ID/inventory/remove \
       -H "Content-Type: application/json" \
       -d '{"item_id":"itm_potion","qty":1}'
  ```
- `POST /api/characters/<ID>/equip` – equip item.
  ```bash
  curl -X POST http://localhost:5000/api/characters/CHAR_ID/equip \
       -H "Content-Type: application/json" \
       -d '{"item_id":"itm_sword"}'
  ```
- `POST /api/characters/<ID>/unequip` – unequip item.
  ```bash
  curl -X POST http://localhost:5000/api/characters/CHAR_ID/unequip \
       -H "Content-Type: application/json" \
       -d '{"slot":"weapon"}'
  ```
- `GET /api/characters/<ID>/equipment` – equipped items.
  ```bash
  curl http://localhost:5000/api/characters/CHAR_ID/equipment
  ```

## Catalog API (`/api`)

- `POST /api/items` – create catalog item.
  ```bash
  curl -X POST http://localhost:5000/api/items \
       -H "Content-Type: application/json" \
       -d '{"name":"Potion"}'
  ```
- `PATCH /api/items/<SLUG>` – update item.
  ```bash
  curl -X PATCH http://localhost:5000/api/items/potion \
       -H "Content-Type: application/json" \
       -d '{"stackable":true}'
  ```
- `GET /api/items` – list catalog items.
  ```bash
  curl http://localhost:5000/api/items
  ```
- `GET /api/starter-loadouts` – starter gear templates.
  ```bash
  curl http://localhost:5000/api/starter-loadouts
  ```

## Console API (`/api/console`)

- `POST /api/console/exec` – execute console command.
  ```bash
  curl -X POST http://localhost:5000/api/console/exec \
       -H "Content-Type: application/json" \
       -d '{"line":"look"}'
  ```

## Legacy Items API (`/api`)

- `POST /api/items` – legacy item create/update.
- `POST /api/item_instances` – create item instance.
- `POST /api/game/characters/<ID>/inventory` – grant item to character.
  ```bash
  curl -X POST http://localhost:5000/api/game/characters/CHAR_ID/inventory \
       -H "Content-Type: application/json" \
       -d '{"slot_index":0,"item_id":"itm","instance_id":"inst","qty":1,"equipped":false}'
  ```

## Admin API (`/api/admin`)

- `GET /api/admin/users`
- `GET /api/admin/users/<USER_ID>`
- `POST /api/admin/users`
- `PATCH /api/admin/users/<USER_ID>`
- `DELETE /api/admin/users/<USER_ID>`
- `GET /api/admin/characters`
- `GET /api/admin/characters/<CHAR_ID>`
- `POST /api/admin/characters`
- `PATCH /api/admin/characters/<CHAR_ID>`
- `DELETE /api/admin/characters/<CHAR_ID>`
- `GET /api/admin/items`
- `GET /api/admin/items/<ITEM_ID>`
- `POST /api/admin/items`
- `PATCH /api/admin/items/<ITEM_ID>`
- `DELETE /api/admin/items/<ITEM_ID>`
- `GET /api/admin/item_instances`
- `GET /api/admin/characters/<CHAR_ID>/inventory`
- `GET /api/admin/recipes`
- `GET /api/admin/resources`
- `POST /api/admin/characters/<CHAR_ID>/teleport`
- `POST /api/admin/console/exec`

Example call with admin token:
```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:5000/api/admin/users
```

## Classes Admin API (`/api/classes-admin`)

- `POST /api/classes-admin/init`
- `GET /api/classes-admin/list`
- `GET /api/classes-admin/get/<CID>`
- `POST /api/classes-admin/new`
- `PATCH /api/classes-admin/save` (also accepts `POST`)
- `POST /api/classes-admin/validate`
- `POST /api/classes-admin/publish`
- `POST /api/classes-admin/yank`

Example:
```bash
curl -X POST http://localhost:5000/api/classes-admin/init
```

## Shard File API (`/api/shards`)

- `GET /api/shards` – list shard JSON files.
- `GET /api/shards/<NAME>` – fetch shard file.
- `PUT /api/shards/<NAME>` – save shard file.

Example:
```bash
curl http://localhost:5000/api/shards
```

## Shard Engine (`/api/shard-gen-v2` and `/api/shard-engine`)

**V2 Generator**
- `GET /api/shard-gen-v2/` – info.
- `POST /api/shard-gen-v2/plan` – plan shard.
- `POST /api/shard-gen-v2/generate` – generate shard.
- `GET /api/shard-gen-v2/tiers` – list tier templates.

**General Engine API**
- `GET /api/shard-engine/registry`
- `GET /api/shard-engine/shards`
- `GET /api/shard-engine/shards/<NAME>`
- `POST /api/shard-engine/generate_shard`
- `GET /api/shard-engine/player`
- `PATCH /api/shard-engine/player`
- `GET /api/shard-engine/inventory`
- `POST /api/shard-engine/inventory`
- `DELETE /api/shard-engine/inventory`
- `GET /api/shard-engine/catalog`
- `POST /api/shard-engine/catalog/refresh`
- `GET /api/shard-engine/debug/routes`

Example:
```bash
curl -X POST http://localhost:5000/api/shard-gen-v2/plan -H "Content-Type: application/json" -d '{}'
```

