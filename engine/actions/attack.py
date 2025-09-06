from engine.actionRegistry import action
from engine.services.rooms import for_player
from engine.services import stamina
from engine import combat as combat_mod

@action("attack")
def attack(*, player, payload: dict) -> dict:
    target_id = payload.get("target_id")
    if not target_id:
        return {"ok": False, "events":[{"type":"log","text":"No target."}]}
    if not stamina.consume(player, 1):
        return {"ok": False, "events":[{"type":"log","text":"You're too tired to attack."}]}

    room_obj = for_player(player)

    if hasattr(combat_mod, "resolve_round"):
        result = combat_mod.resolve_round(player, target_id)
    else:
        result = {"events": [{"type": "log", "text": f"You strike {target_id} (stub)."}], "defeated_ids": []}

    result.setdefault("player", player.as_public())
    result.setdefault("room_delta", {"enemies": room_obj.enemies})
    result["ok"] = True
    return result
