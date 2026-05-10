import Plugin from "@core/plugins";

export default class ElimPlugin extends Plugin {
	
	private readonly MAX_LIVES: int = 3;
	private readonly SURVIVOR_PERCENTAGE: float = 0.8;
	
	private enabled: boolean;
	private isWarmup: boolean;
	
	private onBeginRaceHandler: any;
	private onBeginRoundHandler: any;
	private onEndRoundHandler: any;

	constructor() {
		super();

		this.enabled = false;
		this.isWarmup = false;

		this.onBeginRaceHandler = this.onBeginRace.bind(this);
		this.onBeginRoundHandler = this.onBeginRound.bind(this);
		this.onEndRoundHandler = this.onEndRound.bind(this);
	}

	async onLoad() {
		tmc.addCommand(
			"//elim start",
			this.onElimStart.bind(this),
			"admin",
			"Enable KO plugin"
		);
		tmc.addCommand(
			"//elim setlives",
			this.onElimSetLives.bind(this),
			"admin",
			"Set lives for target player"
		);
		tmc.addCommand(
			"//elim stop",
			this.onElimStop.bind(this),
			"admin",
			"Disable KO plugin"
		);
		tmc.server.addListener("Trackmania.BeginMap", this.onBeginRaceHandler);
		tmc.server.addListener("Trackmania.BeginRound", this.onBeginRoundHandler);
		tmc.server.addListener("Trackmania.EndRound", this.onEndRoundHandler);

		tmc.chat("ElimPlugin loaded. To begin KO type: //elim start");
	}

	async onUnload() {
		tmc.removeCommand("//elim start");
		tmc.removeCommand("//elim setlives");
		tmc.removeCommand("//elim stop");

		tmc.server.removeListener("Trackmania.BeginMap", this.onBeginRaceHandler);
		tmc.server.removeListener("Trackmania.BeginRound", this.onBeginRoundHandler);
		tmc.server.removeListener("Trackmania.EndRound", this.onEndRoundHandler);

		await this.onElimStop();
	}

	/* =======================
	   Commands
	======================= */

	private async onElimStart(_login: string): Promise<void> {
		if (this.enabled) {
			tmc.chat("¤error¤KO already started!", login);
			return;
		}

		this.enabled = true;
		this.isWarmup = true;

		var playersRemain = await this.setScoresSetFullLives(this.MAX_LIVES);
		await this.setRoundPoints(playersRemain);

		tmc.chat("$oKO mode started!");
		tmc.chat("Everyone has " + this.MAX_LIVES + " lives. Bottom " + Math.round((1 - this.SURVIVOR_PERCENTAGE) * 100) + "% players each round will lose a life.");
		tmc.server.call("ForceEndRound");
	}
	
	private async onElimSetLives(login: string, params: string[]): Promise<void> {
		if (!this.enabled) {
			return;
		}
		const targetLogin: string = params[0]
        const targetLives: int = parseInt(params[1], 10);
        
        if (!targetLogin || isNaN(targetLives) || targetLives <= 0) {
            tmc.chat("¤cmd¤Usage: //elim setlives <login> <lives>", login);
			return;
        }
		
		var ranking = await tmc.server.call("GetCurrentRanking", -1, 0);
		var playerScores: any[] = [];
		for (var i = 0; i < ranking.length; i++) {
			playerScores.push({
				PlayerId: ranking[i].PlayerId,
				Score: (ranking[i].Login === targetLogin) ? targetLives : ranking[i].Score
			});
		}

		await tmc.server.call("ForceScores", playerScores, true);
	}

	private async onElimStop(_login: string): Promise<void> {
		if (!this.enabled) {
			return;
		}

		this.enabled = false;
		tmc.chat("$oKO finished!");
		await this.unforceSpec();
	}

	/* =======================
	   Events
	======================= */

	private async onBeginRace(_data: any) {
		if (!this.enabled) {
			return;
		}
		await this.subtractLives();
	}

	private async onBeginRound() {
		if (!this.enabled) {
			return;
		}

		this.isWarmup = await tmc.server.call("GetWarmUp");
		await this.forceSpecForEliminated();
	}

	private async onEndRound() {
		if (!this.enabled) {
			return;
		}

		var matchState = await tmc.server.call("CheckEndMatchCondition");
		if (this.isWarmup || matchState === "ChangeMap") {
			return;
		}

		await this.subtractLives();
	}

	/* =======================
	   Core Logic
	======================= */

	private async subtractLives() {
		console.log("Applying -1 point penalty!");

		var playersRemain = await this.setScoresSubstractLife();
		await this.setRoundPoints(playersRemain);

		if (playersRemain <= 1) {
			tmc.chat("$oGG! We have a winner!");
			this.onElimStop();
		}
	}

	private async setScoresSubstractLife(): Promise<number> {
		var ranking = await tmc.server.call("GetCurrentRanking", -1, 0);

		var playersInGame = 0;
		var playerScores: any[] = [];

		for (var i = 0; i < ranking.length; i++) {
			var player = ranking[i];
			var score = player.Score;

			if (score <= 0) {
				continue;
			}

			if (score === 1) {
				tmc.chat("$oEliminated: " + player.NickName);
			} else {
				playersInGame++;
			}

			playerScores.push({
				PlayerId: player.PlayerId,
				Score: score - 1,
			});
		}

		await tmc.server.call("ForceScores", playerScores, true);
		return playersInGame;
	}

	private async setScoresSetFullLives(livesNo: number): Promise<number> {
		var players = await tmc.server.call("GetPlayerList", -1, 0);
		var playerScores: any[] = [];

		for (var i = 0; i < players.length; i++) {
			playerScores.push({
				PlayerId: players[i].PlayerId,
				Score: livesNo,
			});
		}

		await tmc.server.call("ForceScores", playerScores, false);
		return players.length;
	}

	private async setRoundPoints(playersRemain: number): Promise<number> {
		var survivors = Math.max(1, Math.min(playersRemain - 1, Math.floor(playersRemain * this.SURVIVOR_PERCENTAGE)));

		var roundPoints: number[] = [];
		for (var i = 0; i < survivors; i++) {
			roundPoints.push(1);
		}
		roundPoints.push(0);

		tmc.server.call("SetRoundCustomPoints", roundPoints, false);
		tmc.chat("Next round is going to have " + survivors + " survivors...");

		return survivors;
	}

	/* =======================
	   Spectator Handling
	======================= */

	private async unforceSpec() {
		var players = await tmc.server.call("GetPlayerList", -1, 0);

		for (var i = 0; i < players.length; i++) {
			tmc.server.call("ForceSpectatorId", players[i].PlayerId, 2);
		}
	}

	private async forceSpecForEliminated() {
		var ranking = await tmc.server.call("GetCurrentRanking", -1, 0);
		var activePlayers = await tmc.server.call("GetPlayerList", -1, 0);

		for (var i = 0; i < activePlayers.length; i++) {
			var active = activePlayers[i];

			for (var j = 0; j < ranking.length; j++) {
				if (ranking[j].Login === active.Login && ranking[j].Score === 0) {
					tmc.server.call("ForceSpectatorId", active.PlayerId, 1);
					break;
				}
			}
		}
	}
}
