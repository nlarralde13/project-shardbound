# Project Shardbound

**Project Shardbound** is a modular, browser-based 2D isometric MMORPG engine built with a Flask backend and a JavaScript frontend. Inspired by classic MUDs and JRPGs, it blends grid-based overworld exploration with narrative-driven rooms and turn-based combat.

## 🔧 Architecture

- **Frontend**: Modular JS (ES Modules), rendered in the browser
- **Backend**: Flask (Python) handles shards, room data, player state
- **Data Layer**: JSON-based storage with room for DB evolution

## 🧠 Core Concepts

- **Shard-Based World**: The world is built from independent region files ("shards")
- **Tile = Room**: Each tile has its own interactive narrative or encounter
- **Modular Systems**: Combat, crafting, dialogue, and events are all plug-in systems
- **Text+Token Gameplay**: Navigate the overworld, then zoom into interactive narrative scenes
- **Turn-Based Combat**: Inspired by Pokémon and JRPGs

## 🔄 Project Status

This is version 0.1 of Project Shardbound. All work so far is scaffolded around clean modular growth. We will proceed via iterative milestones toward a feature-complete v1.0.

## 📁 Directory Structure

```
/static/src/       → All frontend JavaScript systems
/templates/         → Jinja2 templates (e.g., index.html)
/server/            → Flask app, routes, models, and helpers
/public/shards/     → JSON-based shard files
```

## 🔜 Upcoming Milestones

- v0.1: Shard rendering, player intro, single room interaction
- v0.2: Room system, enter/exit logic, JSON-driven narrative scenes
- v0.3: Combat system stub with frontend battle UI
- v0.4: Crafting professions and recipes
- v0.5+: Shard stitching, world persistence, multiplayer prep

