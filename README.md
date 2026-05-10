# TMF Minicontrol custom gamemodes repository


Collection of alternate gamemodes for Minicontrol. Written for TrackMania Nations/United Forever.

Paste a directory `userdata_<PLUGIN_NAME>` into `minicontrol/userdata`.

Each plugin is "dormant" when server starts. As an admin you usually need to paste a command `//<PLUGIN> start` to start a mini-gamemode.


# Contents


## Boss Plugin

Rally up as entire server to defeat the boss!
This is the fun gamemode, with everybody working together to slay the giant enemy.
Each checkpoints deals 1 HP and finish deals 3 HP.
Boss health bar is shown to everyone at the top.


`//boss spawn <BOSS_NAME> <STARTING_HP>` starts the boss fight, replace spaces with `_`

`//boss despawn` immediately stop boss fight

`//boss multi <MULT>` boss takes X times the damage

`//boss heals <HP>` boss heals X HP per second, negative values hurts him instead


**Polish level:** Decent, usually works fine, could use nicer text effects and add better damage tracking.


## Elimnation Plugin

Classic multiple-lives knockout mode. Usable only in **cup mode**.
After each round bottom 20% players loses a life. Warmup rounds do not subtract lives.
After 3 lives lost player is eliminated. If player has 0 lives or joins mid-game it is forced to spectator.
Plugin abuses Cup scoretable, so no UI needed.


`//elim start` starts the elimination. Sets all players to 3 points. Ends the current round

`//elim stop` stops the elimination. After that set `//rpoints` to regular distribution

`//elim setlives <LOGIN> <LIVES>` manually adjust player's score


**Polish level:** Low, not adjusted to other gamemodes. Not configurable from command line. Does not track eliminated players.
By the nature of "hacky" abusing scoretable has some edge cases (joining mid-game, subtraction at map start, etc.)


## ManiaTeam2 Plugin

Remember the old ManiaTeam gamemode played on StarTrack campaign?
Time to relive this moments! ManiaTeam2 is a gamemode where the players join up teams (in this case countries) and fight for the best score on given map.
The better time and the more players the better score.
Scores are presisted in local server database, so on reload you can see the best results.
Recommended in rounds mode.


`//maniateam start` starts the gamemode

`//maniateam stop` stops the gamemode


**Polish level:** High, still need a bit of testing and possibly can move database to external system in the future.


## Tournament Plugin

Adds up points for each map (30,27,25,...,1) to a total displayed on the right UI panel.
Use to sum up points and have live scoring results.
Compatibilie with all gamemodes.


`//tournament start` start counting points

`//tournament stop` stops counting points


**Polish level:** Medium, might improve UI and add customizable scoretable.


# Q&A


**Q:** Are plugins working for TM2020?

**A:** No, although Minicontrol is supposed to be hybrid between TMF/TM2020 these are written for TM2020.
They could be rewritten with different event names and newer Manialink syntax.


**Q:** Are these plugins final/production-grade code?

**A:** No, they cover basic gameplay loop and require a bit of work to cover all edge cases and if there is a need from a community I could polish them.
I mostly created them at the go when I felt like pushing an idea to realization.