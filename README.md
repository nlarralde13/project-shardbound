# Demo Warrior Scenario

## How to run the demo scenario
1. `python tools/db_cli.py seed-starter`
2. Start the Flask server: `python app.py`
3. Open the game in your browser and login.
4. Create a Warrior via `POST /api/game/characters` or use the UI.
5. Spawn at coordinates (12,15) and note the Enter Town option.
6. Enter the town and explore the 3x3 grid.
7. Find the shady figure and talk to accept the letter quest.
8. Leave town and move to (13,12) to trigger the goblin ambush.
9. Defeat the goblins, then travel to (14,9) to meet the Harbormaster.
10. Talk to the Harbormaster to complete the quest.
