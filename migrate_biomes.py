# tools/migrate_biomes.py
import json, sys
from pathlib import Path

MAP = {
  "ocean":"Ocean","sea":"Ocean",
  "coast":"Coast","beach":"Coast","shore":"Coast",
  "reef":"Reef","coral":"Reef","lagoon":"Reef",
  "river":"River","stream":"River","brook":"River",
  "lake":"Lake","pond":"Lake",
  "wetland":"Wetland","marsh":"Wetland","swamp":"Wetland","mangrove":"Wetland",
  "grassland":"Plains","prairie":"Plains","steppe":"Plains",
  "savanna":"Savanna","savannah":"Savanna",
  "shrubland":"Shrubland","scrub":"Shrubland","chaparral":"Shrubland",
  "forest":"Forest","woodland":"Forest",
  "taiga":"Taiga","boreal":"Taiga",
  "jungle":"Jungle","rainforest":"Jungle","tropic_forest":"Jungle",
  "hills":"Hills","highland":"Hills",
  "mountain":"Mountains","mountains":"Mountains","range":"Mountains",
  "alpine":"Alpine","snowline":"Alpine",
  "glacier":"Glacier","icecap":"Glacier","ice":"Glacier",
  "tundra":"Tundra",
  "desert":"DesertSand","desert_sand":"DesertSand","dune":"DesertSand",
  "desert_rock":"DesertRock","badlands":"DesertRock","mesa":"DesertRock",
  "volcanic":"Volcano","volcano":"Volcano",
  "lava":"LavaField","ash_field":"LavaField","basalt_flow":"LavaField",
  "cave":"Cave","cavern":"Cave","underground":"Cave",
  "urban":"Urban","city":"Urban","town":"Urban",
}

CANON = set([
 "Ocean","Coast","Reef","River","Lake","Wetland",
 "Plains","Savanna","Shrubland","Forest","Taiga","Jungle",
 "Hills","Mountains","Alpine","Glacier","Tundra",
 "DesertSand","DesertRock","Volcano","LavaField","Urban","Cave"
])

def canon(v):
    if v in CANON: return v
    k = str(v).strip().lower()
    if k in MAP: return MAP[k]
    raise ValueError(f"Unknown biome '{v}'")

def fix_grid(obj):
    tiles = obj.get("grid") or obj.get("tiles")
    if not isinstance(tiles, list) or not tiles or not isinstance(tiles[0], list):
        return False
    changed = False
    for y,row in enumerate(tiles):
        for x,cell in enumerate(row):
            name = cell["biome"] if isinstance(cell, dict) else cell
            c = canon(name)
            if isinstance(cell, dict):
                if cell.get("biome") != c:
                    cell["biome"] = c; changed = True
            else:
                if row[x] != c:
                    row[x] = c; changed = True
    if "grid" in obj: obj["grid"] = tiles
    else: obj["tiles"] = tiles
    return changed

def main(folder="static/public/shards"):
    any_changed = False
    for p in Path(folder).glob("*.json"):
        data = json.loads(p.read_text(encoding="utf-8"))
        if fix_grid(data):
            p.with_suffix(p.suffix+".bak").write_text(json.dumps(data, indent=2), encoding="utf-8")
            p.write_text(json.dumps(data, separators=(",",":")), encoding="utf-8")
            print("Updated", p.name)
            any_changed = True
    if not any_changed:
        print("No changes needed.")

if __name__ == "__main__":
    main(*sys.argv[1:])
