# Project Shardbound

**Project Shardbound** is a modular 2D isometric MMORPG engine inspired by MUDs, classic RPGs, and modern sandbox games.
Each "shard" represents a region of the world and consists of individual tile-based "rooms" containing dynamic story elements,
interactions, and turn-based combat.

## Core Concepts

- Region-first world design: Each shard (region) is created, edited, and saved independently.
- Tile = Room: Each map tile can contain narrative, events, encounters, or crafting stations.
- Modular gameplay systems: Combat, crafting, exploration, and dialogue.
- Flexible UI and dev tooling for live world-building and DM-style control.

## Planned Features

- Character builder and player stat system
- Overworld exploration with a player token
- Narrative rooms with branching choices
- Turn-based JRPG-style combat system
- Region-wide and per-tile encounters
- Blacksmithing, engineering, and multi-discipline crafting
- Fog-of-war, weather, and dynamic world events

## Development Plan

Milestone 0.1: Core shard loading, viewport rendering, dev tools  
Milestone 0.2: Room system for tile-level interaction  
Milestone 0.3: Player flow and introductory quest  
Milestone 0.4: Combat system stub  
Milestone 0.5: Crafting systems  
Milestone 0.6+: Settlements, world stitching, multiplayer foundations

## Folder Structure

See `src/` for system modules:
- `shards/`: Region loading and rendering
- `rooms/`: Tile interactions and narrative scenes
- `players/`: Player stats, inventory, and save state
- `combat/`: Turn-based battle system
- `crafting/`: Crafting recipes and logic
- `ui/`: All interface renderers and overlays
- `items/`: Weapons, tools, armor, etc.
- `utils/`: Shared helpers and utilities
