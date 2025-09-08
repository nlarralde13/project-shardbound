# Developer Documentation

## Database Tables by Model

| Model | Table |
| ----- | ----- |
| `api.models.towns.Town` | `towns` |
| `api.models.users.User` | `users` |
| `api.models.gameplay.Town` | `towns` |
| `api.models.gameplay.TownRoom` | `town_rooms` |
| `api.models.gameplay.NPC` | `npcs` |
| `api.models.gameplay.Quest` | `quests` |
| `api.models.gameplay.QuestState` | `quest_states` |
| `api.models.gameplay.CharacterState` | `character_states` |
| `api.models.gameplay.EncounterTrigger` | `encounter_triggers` |
| `api.models.gameplay.CharacterDiscovery` | `character_discoveries` |
| `api.models.audit.AdminAuditLog` | `admin_audit_logs` |
| `api.models.crafting.Recipe` | `recipes` |
| `api.models.items.Item` | `items` |
| `api.models.characters.Character` | `character` |
| `api.models.inventory_v2.StarterLoadout` | `starter_loadouts` |
| `api.models.inventory_v2.CharacterItem` | `character_items` |

## API Paths

### Auth (`/api/auth`)
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PATCH /api/auth/update`
- `POST /api/auth/logout`

### Catalog (`/api`)
- `POST /api/items`
- `PATCH /api/items/<slug>`
- `GET /api/items`
- `GET /api/starter-loadouts`

### Core Game (`/api`)
- `GET /api/shards`
- `GET /api/world`
- `POST /api/spawn`
- `POST /api/move`
- `POST /api/interact`
- `GET /api/state`
- `GET /api/discoveries`

### Actions (`/api`)
- `POST /api/action`

### Inventory (`/api`)
- `GET /api/characters/<character_id>/inventory`
- `POST /api/characters/<character_id>/equip`
- `POST /api/characters/<character_id>/unequip`
- `GET /api/characters/<character_id>/equipment`

### Gameplay (`/api/game`)
- `GET /api/game/characters`
- `POST /api/game/characters`
- `DELETE /api/game/characters/<character_id>`
- `POST /api/game/characters/select`
- `GET /api/game/characters/active`
- `POST /api/game/characters/autosave`
- `POST /api/game/characters/<char_id>/enter_town`
- `POST /api/game/characters/<char_id>/leave_town`
- `POST /api/game/characters/<char_id>/town_move`
- `POST /api/game/characters/<char_id>/talk`
- `POST /api/game/characters/<char_id>/move`
- `POST /api/game/encounters/start`
- `POST /api/game/encounters/turn`

### Admin (`/api/admin`)
- `GET /api/admin/users`
- `GET /api/admin/users/<user_id>`
- `POST /api/admin/users`
- `PATCH /api/admin/users/<user_id>`
- `DELETE /api/admin/users/<user_id>`
- `GET /api/admin/characters`
- `GET /api/admin/characters/<character_id>`
- `POST /api/admin/characters`
- `PATCH /api/admin/characters/<character_id>`
- `DELETE /api/admin/characters/<character_id>`
- `GET /api/admin/items`
- `GET /api/admin/items/<item_id>`
- `POST /api/admin/items`
- `PATCH /api/admin/items/<item_id>`
- `DELETE /api/admin/items/<item_id>`
- `GET /api/admin/characters/<character_id>/inventory`
- `GET /api/admin/recipes`
- `GET /api/admin/resources`
- `POST /api/admin/characters/<character_id>/teleport`
- `POST /api/admin/console/exec`

### Classes Admin (`/api/classes-admin`)
- `POST /api/classes-admin/init`
- `GET /api/classes-admin/list`
- `GET /api/classes-admin/get/<cid>`
- `POST /api/classes-admin/new`
- `PATCH/POST /api/classes-admin/save`
- `POST /api/classes-admin/validate`
- `POST /api/classes-admin/publish`
- `POST /api/classes-admin/yank`

### Console (`/api/console`)
- `POST /api/console/exec`

### Shards (`/api/shards`)
- `GET /api/shards`
- `GET /api/shards/<name>`
- `PUT /api/shards/<name>`

### Items API
- `POST /api/items`
- `POST /api/game/characters/<character_id>/inventory`

### Inventory Shapes
- Inventory item: `{ item_id, slug, display_name, icon_url, quantity, stackable, max_stack, rarity, description, slot?, equipped }`
- Equip body: `{ character_item_id?: int, slug?: string, slot: string }`
