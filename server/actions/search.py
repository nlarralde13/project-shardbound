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

    events = [{"type":"log","text": msg}]
    # Shardgate discovery on search
    try:
        g = gate_at(WORLD, room_obj.x, room_obj.y)
    except Exception:
        g = None
    if g:
        events.append({"type":"log","text":"There is a Shardgate here."})
        try:
            if current_user.is_authenticated:
                user = db.session.get(User, current_user.user_id)
                if user and user.selected_character_id:
                    exists = CharacterDiscovery.query.filter_by(character_id=user.selected_character_id, shardgate_id=g.get('id')).first()
                    if not exists:
                        db.session.add(CharacterDiscovery(character_id=user.selected_character_id, shardgate_id=g.get('id')))
                        db.session.commit()
        except Exception:
            db.session.rollback()

    return {
        "ok": True,
        "events": events,
        "gains": found,
        "player": player.as_public(),
        "room_delta": {"searchables": room_obj.searchables},
    }
