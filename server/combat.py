# server/combat.py
import random

ENEMIES = {
    "plains":[{"id":"bandit","hp":12,"atk":4,"def":1,"spd":3}],
    "forest":[{"id":"wolf","hp":10,"atk":3,"def":1,"spd":4}],
    "hills":[ {"id":"kobold","hp":8,"atk":3,"def":1,"spd":3}],
}

def maybe_spawn(biome: str, on_road: bool) -> dict | None:
    table = ENEMIES.get(biome, [])
    if not table:
        return None
    # Roads are safer
    chance = 0.07 if on_road else 0.15
    if random.random() < chance:
        e = dict(random.choice(table))
        e["hp_now"] = e["hp"]
        return e
    return None

def resolve_combat(player, enemy) -> list[str]:
    log = [f"A wild {enemy['id']} appears!"]
    php = player.hp
    ehp = enemy["hp_now"]
    while php > 0 and ehp > 0:
        # player turn (placeholder stats)
        ehp -= max(1, 3 - enemy["def"])
        log.append(f"You hit {enemy['id']}. ({max(ehp,0)} HP left)")
        if ehp <= 0:
            break
        # enemy turn
        php -= max(1, enemy["atk"] - 1)
        log.append(f"{enemy['id']} hits you. ({max(php,0)} HP left)")
    player.hp = max(0, php)
    if ehp <= 0:
        log.append(f"You defeated the {enemy['id']}!")
        player.xp += 10
    else:
        log.append("You were defeated…")
    return log
