from server.actionRegistry import action
from server.services.rooms import for_player, player_room_id
from server.services import stamina, cooldowns, loot

@action("search")
def search_room(*, player, payload: dict) -> dict:
    room_obj = for_player(player)
    room_id = player_room_id(player)

    if not stamina.consume(player, 2):
        return {"ok": False, "events":[{"type":"log","text":"Too tired to search."}]}

    if not cooldowns.consume(player.id, f"search:{room_id}", seconds=5):
        return {"ok": False, "events":[{"type":"log","text":"You find nothing new…"}]}

    found = []
    new_searchables = []
    for s in list(room_obj.searchables):
        roll = loot.roll_table(s.get("table", "meadow_common"))
        if roll:
            found.append(roll)
            if hasattr(player, "add_item"):
                player.add_item(roll["item_id"], roll["qty"])
            if s.get("once"):
                continue
        new_searchables.append(s)

    room_obj.searchables = new_searchables

    msg = ("You rummage around… You found " +
           ", ".join(f"{x['qty']} × {x['name']}" for x in found) + "!"
           ) if found else "You rummage around… nothing of value."

    return {
        "ok": True,
        "events":[{"type":"log","text": msg}],
        "gains": found,
        "player": player.as_public(),
        "room_delta": {"searchables": room_obj.searchables},
    }
