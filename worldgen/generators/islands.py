# server/worldgen/generators/island.py
import random, math
from typing import List, Tuple

def radial_island_mask(w, h, falloff=1.8):
  cx, cy = (w-1)/2, (h-1)/2
  maxd = math.hypot(cx, cy)
  mask = []
  for y in range(h):
    row=[]
    for x in range(w):
      d = math.hypot(x-cx, y-cy)/maxd
      v = max(0.0, 1 - d**falloff)  # 1 center → 0 edges
      row.append(v)
    mask.append(row)
  return mask

def generate(cfg) -> dict:
  w,h = cfg.size
  rnd = random.Random(cfg.seed)

  mask = radial_island_mask(w,h,cfg.landmass.falloff)
  # pick land threshold to hit target land %
  vals = sorted(v for row in mask for v in row)
  thresh = vals[int((1-cfg.landmass.percent)*len(vals))]
  grid = []
  for y in range(h):
    row=[]
    for x in range(w):
      is_land = mask[y][x] >= thresh
      # sprinkle alt biome on land
      if is_land and rnd.random()<0.35:
        row.append(cfg.biomes.land_secondary)
      else:
        row.append(cfg.biomes.land_primary if is_land else cfg.biomes.water)
    grid.append(row)

  # volcano near center land
  cx, cy = w//2, h//2
  vx, vy = cx, cy
  best = 0
  for _ in range(128):
    x = min(w-1,max(0,int(rnd.gauss(cx, (1-cfg.features.volcano.center_bias)*w*0.3))))
    y = min(h-1,max(0,int(rnd.gauss(cy, (1-cfg.features.volcano.center_bias)*h*0.3))))
    if grid[y][x] != cfg.biomes.water: vx,vy = x,y; break
  grid[vy][vx] = "Volcano"

  # utility to test coast
  def is_coast(x,y):
    if grid[y][x]==cfg.biomes.water: return False
    for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
      nx,ny=x+dx,y+dy
      if 0<=nx<w and 0<=ny<h and grid[ny][nx]==cfg.biomes.water: return True
    return False

  sites=[]
  # settlements
  placed=[]
  for _ in range(cfg.features.settlements.count):
    for _try in range(200):
      x,y = rnd.randrange(w), rnd.randrange(h)
      if grid[y][x]==cfg.biomes.water or (x,y) in placed: continue
      if cfg.biomes.land_primary not in cfg.features.settlements.prefer_biomes and grid[y][x] not in cfg.features.settlements.prefer_biomes: continue
      if any(abs(x-px)+abs(y-py) < cfg.features.settlements.min_distance for px,py in placed): continue
      placed.append((x,y)); sites.append({"type":"settlement","name":"Town "+str(len(placed)),"pos":[x,y]}); break

  # ports
  pc=0
  for _ in range(cfg.features.ports.count*5):
    x,y = rnd.randrange(w), rnd.randrange(h)
    if grid[y][x]==cfg.biomes.water: continue
    if not is_coast(x,y): continue
    sites.append({"type":"port","name":"Port "+str(pc+1),"pos":[x,y]}); pc+=1
    if pc>=cfg.features.ports.count: break

  sites.append({"type":"volcano","name":"Basalt Crown","pos":[vx,vy]})

  # spawn near settlement if possible
  sx,sy = sites[0]["pos"] if sites else (vx,vy)

  return {"name": cfg.name, "size":[w,h], "spawn":[sx,sy], "grid":grid, "sites":sites}
