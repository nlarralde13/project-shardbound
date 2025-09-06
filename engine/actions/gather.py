from engine.actionRegistry import action
from engine.services.rooms import for_player
from engine.services import resources, stamina

@action("gather")
def gather_node(*, player, payload: dict) -> dict:
    node_id = payload.get("node_id")
    if not node_id:
        return {"ok": False, "events":[{"type":"log","text":"No target selected."}]}

    room_obj = for_player(player)
    node = next((n for n in room_obj.resources if n.get("id") == node_id), None)
    if not node:
        return {"ok": False, "events":[{"type":"log","text":"Nothing to gather there."}]}
    if not resources.available(node):
        return {"ok": False, "events":[{"type":"log","text":"This resource is depleted."}]}
    if not stamina.consume(player, 3):
        return {"ok": False, "events":[{"type":"log","text":"Too tired to gather."}]}

    qty = resources.harvest_amount(player, node)
    # apply_harvest signature kept; it only uses node & player effectively
    resources.apply_harvest(room_obj.__dict__, node, qty, player)

    return {
        "ok": True,
        "events":[{"type":"log","text": f"You gather {qty} {node['type']}."}],
        "player": player.as_public(),
        "room_delta": {"resources": room_obj.resources},
    }
