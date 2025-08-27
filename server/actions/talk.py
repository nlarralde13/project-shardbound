from server.actionRegistry import action
from server.services.rooms import for_player
from server.player_engine import QuestState


@action("talk")
def talk(*, player, payload: dict) -> dict:
    target_id = payload.get("target_id")
    if not target_id:
        return {"ok": False, "events": [{"type": "log", "text": "No target."}]}

    room_obj = for_player(player)
    npc = next((n for n in room_obj.npcs if n.get("id") == target_id), None)
    if not npc:
        return {"ok": False, "events": [{"type": "log", "text": "No one by that name here."}]}

    log: list[str] = []
    quest_id = npc.get("gives_quest")
    if quest_id == "LETTER_QUEST":
        if quest_id not in player.quests_active and quest_id not in player.quests_done:
            player.quests_active[quest_id] = QuestState(id=quest_id, data={"target": (14, 9)})
            log.append("Villager: Please deliver this letter to the harbormaster in the port village north of here.")
        else:
            log.append("Villager: Thank you again for helping out.")
    elif npc.get("accepts_quest") == "LETTER_QUEST":
        q = player.quests_active.get("LETTER_QUEST")
        if q and q.status == "active":
            q.status = "complete"
            player.quests_done.add(q.id)
            player.quests_active.pop(q.id, None)
            player.gold += 10
            player.xp += 20
            log.append("Harbormaster: Ah, a letter for me? Thank you! (Quest complete)")
        else:
            log.append("Harbormaster: Safe travels, adventurer.")
    else:
        name = npc.get("name", "Someone")
        log.append(f"{name}: Hello there.")

    return {"ok": True, "events": [{"type": "log", "text": m} for m in log], "player": player.as_public()}
