# API Reference

This document summarizes the main HTTP endpoints exposed by the Shardbound server.
All examples assume the server is running locally on port `5000`.

## Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create a new user account. |
| POST | `/api/auth/login` | Log in with an existing account. |
| GET | `/api/auth/me` | Retrieve the currently logged in user. |
| PATCH | `/api/auth/update` | Update the logged in user's profile. |
| POST | `/api/auth/logout` | Log out the current session. |

**Example:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "user@example.com"}'
```

## Characters

Endpoints below require an authenticated session.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/classes` | List published character classes. |
| GET | `/api/characters` | List your active characters. |
| POST | `/api/characters` | Create a new character. |
| DELETE | `/api/characters/<character_id>` | Delete a character. |
| POST | `/api/characters/select` | Set the active character. |
| GET | `/api/characters/active` | Details of the active character. |

**Example:**
```bash
curl -X POST http://localhost:5000/api/characters \
  -H 'Content-Type: application/json' \
  -b cookies.txt -c cookies.txt \
  -d '{"name":"Aela","class_id":"warrior"}'
```

## Core Game

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/shards` | List available shards. |
| GET | `/api/world` | Retrieve world metadata. |
| POST | `/api/spawn` | Spawn the current player. |
| POST | `/api/move` | Move the player on the world grid. |
| POST | `/api/interact` | Interact with the point of interest in the current room. |
| GET | `/api/state` | Current player state and room data. |
| POST | `/api/action` | Execute a verb-based action (e.g. gather, attack). |

**Example:**
```bash
curl -X POST http://localhost:5000/api/move \
  -H 'Content-Type: application/json' \
  -b cookies.txt -c cookies.txt \
  -d '{"dx":1,"dy":0}'
```

## Item Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/items` | Create or update an item definition. |
| POST | `/api/item_instances` | Create an item instance. |
| POST | `/api/characters/<character_id>/inventory` | Grant an item to a character. |

## Admin API

Administrative endpoints require the admin guard.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | Paginated list of users. |
| GET | `/api/admin/users/<user_id>` | Details for a specific user. |
| GET | `/api/admin/characters` | Paginated list of characters. |
| GET | `/api/admin/characters/<character_id>` | Details for a specific character. |
| GET | `/api/admin/items` | Paginated list of items. |
| GET | `/api/admin/item_instances` | Paginated list of item instances. |
| GET | `/api/admin/characters/<character_id>/inventory` | Inventory for a character. |
| GET | `/api/admin/recipes` | List crafting recipes (if enabled). |
| GET | `/api/admin/resources` | List resource definitions (if enabled). |

**Example:**
```bash
curl -X GET 'http://localhost:5000/api/admin/users?limit=10' \
  -H 'Authorization: Bearer <admin-token>'
```

---

Use `-b cookies.txt -c cookies.txt` in curl commands to persist session cookies between requests.
