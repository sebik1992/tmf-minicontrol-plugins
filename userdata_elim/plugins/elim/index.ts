import Plugin from "@core/plugins";

export default class ElimPlugin extends Plugin {

	private configMaxLives: number = 3;
	private configSurvivorPercentage: number = 0.85;
	private configGoldenRoundEnabled: boolean = true;

	private enabled: boolean;
	private isWarmup: boolean;
	private isGoldenRound: boolean;
	private currentSurvivors: number = 0;
	private currentRoundsThisMap: number = 0;
	private currentRoundsPerMap: number = 0;

	private onBeginRaceHandler: any;
	private onBeginRoundHandler: any;
	private onEndRoundHandler: any;

	constructor() {
		super();

		this.enabled = false;
		this.isWarmup = false;
		this.isGoldenRound = false;

		this.onBeginRaceHandler = this.onBeginRace.bind(this);
		this.onBeginRoundHandler = this.onBeginRound.bind(this);
		this.onEndRoundHandler = this.onEndRound.bind(this);
	}

	async onLoad() {
		tmc.addCommand("//elim start", this.onElimStart.bind(this), "Enable KO plugin");
		tmc.addCommand("//elim setlives", this.onElimSetLives.bind(this), "Set lives for target player <login> <lives>");
		tmc.addCommand("//elim stop", this.onElimStop.bind(this), "Disable KO plugin");
		tmc.addCommand("//elim config lives", this.onElimConfigLives.bind(this), "Set max lives per player <lives>");
		tmc.addCommand("//elim config percentage", this.onElimConfigSurvivors.bind(this), "Set survivor percentage per round <percentage>");
		tmc.addCommand("//elim config golden", this.onElimConfigGolden.bind(this), "Enable/disable golden rounds <true/false>");

		tmc.server.addListener("Trackmania.BeginMap", this.onBeginRaceHandler);
		tmc.server.addListener("Trackmania.BeginRound", this.onBeginRoundHandler);
		tmc.server.addListener("Trackmania.EndRound", this.onEndRoundHandler);

		tmc.chat("ElimPlugin loaded. To begin KO type: //elim start");
	}

	async onUnload() {
		tmc.removeCommand("//elim start");
		tmc.removeCommand("//elim setlives");
		tmc.removeCommand("//elim stop");
		tmc.removeCommand("//elim config lives");
		tmc.removeCommand("//elim config percentage");
		tmc.removeCommand("//elim config golden");

		tmc.server.removeListener("Trackmania.BeginMap", this.onBeginRaceHandler);
		tmc.server.removeListener("Trackmania.BeginRound", this.onBeginRoundHandler);
		tmc.server.removeListener("Trackmania.EndRound", this.onEndRoundHandler);

		await this.onElimStop();
	}

	private async onElimStart(login: string): Promise<void> {
		if (this.enabled) {
			tmc.chat("¤error¤KO already started!", login);
			return;
		}

		const gameMode = await tmc.server.call("GetGameMode");
		if (gameMode !== 0 && gameMode !== 5) {
			tmc.chat("¤error¤KO requires Rounds (0) or Cup (5) mode. Current: " + gameMode, login);
			return;
		}

		this.enabled = true;
		this.isWarmup = true;
		this.currentRoundsThisMap = 0;
		this.currentRoundsPerMap = (await tmc.server.call("GetCupRoundsPerChallenge")).CurrentValue;
		this.isGoldenRound = this.computeIsGoldenRound();

		const playersRemain = await this.setScoresSetFullLives(this.configMaxLives);
		await this.setRoundPoints(playersRemain, false);

		tmc.chat("¤white¤KO mode started!");
		tmc.chat("¤info¤Everyone has ¤white¤" + this.configMaxLives + "¤info¤ lives. Bottom ¤white¤" + Math.round((1 - this.configSurvivorPercentage) * 100) + "%¤info¤ players each round will lose a life.");
		tmc.server.call("ForceEndRound");
	}

	private async onElimSetLives(login: string, params: string[]): Promise<void> {
		if (!this.enabled) return;

		const targetLogin = params[0];
		const targetLives = Number(params[1]);

		if (!targetLogin || isNaN(targetLives) || targetLives <= 0) {
			tmc.chat("¤cmd¤Usage: //elim setlives <login> <lives>=1>", login);
			return;
		}

		const ranking = await tmc.server.call("GetCurrentRanking", -1, 0);
		const playerScores = ranking.map((r: any) => ({
			PlayerId: r.PlayerId,
			Score: r.Login === targetLogin ? targetLives : r.Score,
		}));

		await tmc.server.call("ForceScores", playerScores, true);
	}

	private async onElimConfigLives(login: string, params: string[]): Promise<void> {
		const lives = Number(params[0]);
		if (isNaN(lives) || lives < 1) {
			tmc.chat("¤error¤Usage: //elim config lives <lives>=1>", login);
			return;
		}

		this.configMaxLives = lives;
		tmc.chat("¤cmd¤Lives set to " + lives, login);
	}

	private async onElimConfigSurvivors(login: string, params: string[]): Promise<void> {
		const survivors = Number(params[0]);
		if (isNaN(survivors) || survivors < 1 || survivors > 99) {
			tmc.chat("¤error¤Usage: //elim config percentage <integer 1-99>", login);
			return;
		}

		this.configSurvivorPercentage = survivors / 100;
		tmc.chat("¤cmd¤Survivor percentage set to " + survivors + "%", login);
	}

	private async onElimConfigGolden(login: string, params: string[]): Promise<void> {
		const val = params[0];
		if (val !== "true" && val !== "false") {
			tmc.chat("¤error¤Usage: //elim config golden <true/false>", login);
			return;
		}

		this.configGoldenRoundEnabled = val === "true";
		tmc.chat("¤cmd¤Golden rounds " + (this.configGoldenRoundEnabled ? "enabled" : "disabled"), login);
	}

	private async onElimStop(_login?: string): Promise<void> {
		if (!this.enabled) return;

		this.enabled = false;
		tmc.chat("¤white¤KO finished!");
		await this.unforceSpec();
	}

	private async onBeginRace(_data: any) {
		if (!this.enabled) return;

		this.isGoldenRound = false;
		this.currentRoundsThisMap = 0;
		this.currentRoundsPerMap = (await tmc.server.call("GetCupRoundsPerChallenge")).CurrentValue;
		this.isGoldenRound = this.computeIsGoldenRound();
		await this.subtractLives(this.isGoldenRound);
	}

	private async onBeginRound() {
		if (!this.enabled) return;

		this.isWarmup = await tmc.server.call("GetWarmUp");
		await this.forceSpecForEliminated();

		if (this.isWarmup) {
			tmc.chat("$fa0Warm-up! ¤info¤No eliminations this round");
		} else {
			tmc.chat("¤info¤Survivors this round: ¤white¤" + this.currentSurvivors);
			if (this.isGoldenRound) {
				tmc.chat("$fc0*** GOLDEN ROUND! *** ¤info¤1st place earns a bonus life!");
			}
		}
	}

	private async onEndRound() {
		if (!this.enabled) return;

		const matchState = await tmc.server.call("CheckEndMatchCondition");
		if (this.isWarmup || matchState === "ChangeMap") return;

		this.currentRoundsThisMap++;
		this.isGoldenRound = this.computeIsGoldenRound();
		await this.subtractLives(this.isGoldenRound);
	}

	private computeIsGoldenRound(): boolean {
		const eliminations = this.currentSurvivors - Math.round(this.currentSurvivors * this.configSurvivorPercentage);
		return this.configGoldenRoundEnabled
//			&& eliminations >= 2
			&& (this.currentRoundsThisMap === this.currentRoundsPerMap - 1);
	}

	private async subtractLives(isGoldenRound: boolean = false) {
		const playersRemain = await this.setScoresSubtractLife();
		await this.setRoundPoints(playersRemain, isGoldenRound);

		if (playersRemain <= 1) {
			tmc.chat("¤white¤GG! We have a winner!");
//			await this.onElimStop();
		}
	}

	private async setScoresSubtractLife(): Promise<number> {
		const ranking = await tmc.server.call("GetCurrentRanking", -1, 0);
		let playersInGame = 0;
		const playerScores: any[] = [];

		for (const player of ranking) {
			const score = player.Score;
			if (score <= 0) continue;
			if (score === 1) {
				tmc.chat("¤info¤Eliminated: " + player.NickName);
			} else {
				playersInGame++;
			}
			playerScores.push({ PlayerId: player.PlayerId, Score: score - 1 });
		}

		await tmc.server.call("ForceScores", playerScores, true);
		return playersInGame;
	}

	private async setScoresSetFullLives(livesNo: number): Promise<number> {
		const players = await tmc.server.call("GetPlayerList", -1, 0);
		const playerScores = players.map((p: any) => ({ PlayerId: p.PlayerId, Score: livesNo }));
		await tmc.server.call("ForceScores", playerScores, false);
		return players.length;
	}

	private async setRoundPoints(playersRemain: number, isGoldenRound: boolean): Promise<number> {
		const survivors = Math.max(1, Math.min(playersRemain - 1, Math.round(playersRemain * this.configSurvivorPercentage)));
		const roundPoints: number[] = Array.from({ length: survivors }, (_, i) => i === 0 && isGoldenRound ? 2 : 1);
		roundPoints.push(0);
		tmc.server.call("SetRoundCustomPoints", roundPoints, false);
		this.currentSurvivors = survivors;
		return survivors;
	}

	private async unforceSpec() {
		const players = await tmc.server.call("GetPlayerList", -1, 0);
		for (const player of players) {
			tmc.server.call("ForceSpectatorId", player.PlayerId, 2);
		}
	}

	private async forceSpecForEliminated() {
		const ranking = await tmc.server.call("GetCurrentRanking", -1, 0);
		const eliminated = new Set(
			ranking.filter((r: any) => r.Score === 0).map((r: any) => r.Login)
		);
		const activePlayers = await tmc.server.call("GetPlayerList", -1, 0);
		for (const player of activePlayers) {
			if (eliminated.has(player.Login)) {
				tmc.server.call("ForceSpectatorId", player.PlayerId, 1);
			}
		}
	}
}
