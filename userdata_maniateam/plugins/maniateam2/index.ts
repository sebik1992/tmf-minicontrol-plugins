import Plugin from "@core/plugins";
import Widget from "@core/ui/widget";
import ManiaTeam2 from "../../schemas/maniateam2.model.ts";

// ─── Domain types (internal state) ────────────────────────────────────────────

interface PlayerEntry {
    login:       string;
    nickName:    string;
    nationality: string;
    lastTime:    number | null;
    lastScore:   number;
}

interface TeamEntry {
    nationality:          string;
    players:              Map<string, PlayerEntry>;
    bestScore:            number;
    lastRoundMultiplier:  number;
    lastRoundScore:       number;
    allTimeBestScore:     number;
    achievedAllTimeHigh:  boolean;
}

interface MapInfo {
    authorTime: number;
    bronzeTime: number;
    uuid:       string;
}

// ─── UI data types (pure business data — no positions) ────────────────────────

interface PlayerUIData {
    nickName:   string;
    lastTime:   string;
    lastScore:  number;
    isFinished: boolean;
}

interface TeamUIData {
    nationality:      string;
    playerCount:      number;
    multiplier:       string;
    lastRoundScore:   string;
    bestScore:        string;
    allTimeBestScore: string;
    isAllTimeHigh:    boolean;
    players:          PlayerUIData[];
}

interface UIData {
    teams: TeamUIData[];
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

const LOG = "[ManiaTeam]";

export default class MiniManiaTeam extends Plugin {

    private active:  boolean = false;
    private widget:  Widget | null = null;
    private teams    = new Map<string, TeamEntry>();
    private mapInfo: MapInfo | null = null;

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    async onLoad(): Promise<void> {
        tmc.cli(`${LOG} onLoad() — registering model, listeners and commands`);

        tmc.storage["db"].addModels([ManiaTeam2]);
        tmc.server.addListener("TMC.PlayerConnect",     this.onPlayerConnect,    this);
        tmc.server.addListener("TMC.PlayerDisconnect",  this.onPlayerDisconnect, this);
        tmc.server.addListener("TMC.PlayerFinish",      this.onPlayerFinish,     this);
        tmc.server.addListener("Trackmania.BeginRound", this.onBeginRound,       this);
        tmc.server.addListener("Trackmania.EndRound",   this.onEndRound,         this);
        tmc.server.addListener("Trackmania.BeginMap",   this.onBeginRace,        this);

        tmc.addCommand("//maniateam start", this.cmdStart.bind(this), "admin", "Start ManiaTeam competition");
        tmc.addCommand("//maniateam stop",  this.cmdStop.bind(this),  "admin", "Stop ManiaTeam competition");

        tmc.cli(`${LOG} onLoad() complete — plugin inactive, use //maniateam start`);
    }

    async onUnload(): Promise<void> {
        tmc.cli(`${LOG} onUnload() — cleaning up`);

        tmc.server.removeListener("TMC.PlayerConnect",     this.onPlayerConnect,    this);
        tmc.server.removeListener("TMC.PlayerDisconnect",  this.onPlayerDisconnect, this);
        tmc.server.removeListener("TMC.PlayerFinish",      this.onPlayerFinish,     this);
        tmc.server.removeListener("Trackmania.BeginRound", this.onBeginRound,       this);
        tmc.server.removeListener("Trackmania.EndRound",   this.onEndRound,         this);
        tmc.server.removeListener("Trackmania.BeginMap",   this.onBeginRace,        this);

        tmc.removeCommand("//maniateam start");
        tmc.removeCommand("//maniateam stop");

        await this.teardown();
        tmc.cli(`${LOG} onUnload() complete`);
    }

    // ── Admin commands ─────────────────────────────────────────────────────────

    private async cmdStart(login: string, _params: string[]): Promise<void> {
        if (this.active) {
            tmc.chat("¤error¤ManiaTeam is already running!", login);
            return;
        }

        tmc.cli(`${LOG} cmdStart() called by ${login}`);
        this.active = true;

        await this.loadMapInfo();

        if (this.mapInfo) {
            await this.loadDatabaseScores(this.mapInfo.uuid);
        }

        tmc.cli(`${LOG} Fetching current player list...`);
        try {
            const list = await tmc.server.call("GetPlayerList", 512, 0);
            tmc.cli(`${LOG} GetPlayerList returned ${list.length} player(s)`);
            for (const p of list) {
                tmc.cli(`${LOG}   Seeding player: ${p.Login}`);
                await this.registerPlayer(p.Login);
            }
        } catch (e) {
            tmc.cli(`${LOG} ERROR fetching player list: ${e}`);
        }

        tmc.cli(`${LOG} Teams after seed: ${this.teams.size}`);
        for (const [nat, team] of this.teams) {
            tmc.cli(`${LOG}   Team "${nat}": ${team.players.size} player(s) — ${[...team.players.keys()].join(", ")}`);
        }

        try {
            const initialData = this.buildUIData();
            tmc.cli(`${LOG} buildUIData() OK — ${initialData.teams.length} team(s)`);
            this.widget = new Widget("userdata/plugins/maniateam2/ui.xml.twig", initialData);
            tmc.cli(`${LOG} Widget constructed, calling display()...`);
            await this.widget.display(initialData);
            tmc.cli(`${LOG} Widget.display() completed`);
        } catch (e) {
            tmc.cli(`${LOG} ERROR creating/displaying widget: ${e}`);
        }

        tmc.chat("$fffManiaTeam competition $0f0started$fff!", login);
        tmc.cli(`${LOG} ManiaTeam started by ${login}`);
    }

    private async cmdStop(login: string, _params: string[]): Promise<void> {
        if (!this.active) {
            tmc.chat("¤error¤ManiaTeam is not running!", login);
            return;
        }

        tmc.cli(`${LOG} cmdStop() called by ${login}`);
        await this.teardown();
        tmc.chat("$fffManiaTeam competition $f00stopped$fff.", login);
        tmc.cli(`${LOG} ManiaTeam stopped by ${login}`);
    }

    // ── Internal teardown ──────────────────────────────────────────────────────

    private async teardown(): Promise<void> {
        this.active = false;
        this.teams.clear();
        this.mapInfo = null;
        this.widget?.destroy();
        this.widget = null;
        tmc.cli(`${LOG} teardown() complete — state cleared, widget destroyed`);
    }

    // ── Map/Challenge handling ─────────────────────────────────────────────────

    private async loadMapInfo(): Promise<void> {
        tmc.cli(`${LOG} Calling GetCurrentChallengeInfo...`);
        try {
            const info = await tmc.server.call("GetCurrentChallengeInfo");
            this.mapInfo = {
                authorTime: info.AuthorTime,
                bronzeTime: info.BronzeTime,
                uuid:       info.UId,
            };
            tmc.cli(`${LOG} Map info loaded — uuid="${info.UId}"  author=${info.AuthorTime}ms  bronze=${info.BronzeTime}ms  name="${info.Name}"`);
        } catch (e) {
            tmc.cli(`${LOG} ERROR in GetCurrentChallengeInfo: ${e}`);
        }
    }

    private async onBeginRace(data: any): Promise<void> {
        if (!this.active) return;
        tmc.cli(`${LOG} >>> Trackmania.BeginMap fired — raw data: ${JSON.stringify(data)}`);
        try {
            this.mapInfo = {
                authorTime: data[0].AuthorTime,
                bronzeTime: data[0].BronzeTime,
                uuid:       data[0].UId,
            };
            tmc.cli(`${LOG} BeginMap: uuid="${data[0].UId}"  map="${data[0].Name}"  author=${data[0].AuthorTime}ms  bronze=${data[0].BronzeTime}ms`);

            for (const team of this.teams.values()) {
                team.bestScore          = 0;
                team.lastRoundScore     = 0;
				team.allTimeBestScore   = 0;
				team.achievedAllTimeHigh = false;
                team.lastRoundMultiplier = this.getTeamMultiplier(team.players.size);
                for (const player of team.players.values()) {
                    player.lastTime  = null;
                    player.lastScore = 0;
                }
            }

            await this.loadDatabaseScores(data[0].UId);

            await this.updateUI();
        } catch (e) {
            tmc.cli(`${LOG} ERROR in onBeginRace: ${e}`);
        }
    }

    // ── Database operations ────────────────────────────────────────────────────

    private async loadDatabaseScores(mapUuid: string): Promise<void> {
        tmc.cli(`${LOG} loadDatabaseScores() for uuid="${mapUuid}"`);
        try {
            const records = await ManiaTeam2.findAll({ where: { mapUuid } });
            tmc.cli(`${LOG} Found ${records.length} DB record(s) for this map`);

            for (const record of records) {
                const country = record.country!;
                const score   = record.score!;

                if (this.teams.has(country)) {
                    this.teams.get(country)!.allTimeBestScore = score;
                    tmc.cli(`${LOG}   DB: updated allTimeBestScore for "${country}" → ${score}`);
                } else {
                    // Ghost team: no players online, but has a historical record.
                    this.teams.set(country, {
                        nationality:          country,
                        players:              new Map(),
                        bestScore:            0,
                        lastRoundMultiplier:  0,
                        lastRoundScore:       0,
                        allTimeBestScore:     score,
                        achievedAllTimeHigh:  false,
                    });
                    tmc.cli(`${LOG}   DB: created ghost team for "${country}" with allTimeBest=${score}`);
                }
            }

            for (const team of this.teams.values()) {
                if (team.allTimeBestScore === undefined) {
                    team.allTimeBestScore = 0;
                }
            }
        } catch (e) {
            tmc.cli(`${LOG} ERROR in loadDatabaseScores: ${e}`);
        }
    }


    private async setDatabaseScore(mapUuid: string, country: string, score: number): Promise<void> {
        tmc.cli(`${LOG} setDatabaseScore() uuid="${mapUuid}"  country="${country}"  score=${score}`);
        try {
            const existing = await ManiaTeam2.findOne({
                where: { mapUuid, country: country },
            });

            if (existing) {
                if (score > existing.score!) {
                    existing.score = score;
                    await existing.save();
                    tmc.cli(`${LOG} DB updated: "${country}" → ${score}`);
                } else {
                    tmc.cli(`${LOG} DB skip: existing score ${existing.score} >= new ${score}`);
                }
            } else {
                await ManiaTeam2.create({
                    mapUuid,
                    country: country,
                    score,
                });
                tmc.cli(`${LOG} DB created: "${country}" → ${score}`);
            }
        } catch (e) {
            tmc.cli(`${LOG} ERROR in setDatabaseScore: ${e}`);
        }
    }

    // ── Player registration ────────────────────────────────────────────────────

    private async registerPlayer(login: string): Promise<void> {
        tmc.cli(`${LOG} registerPlayer("${login}") — calling GetDetailedPlayerInfo...`);
        try {
            const info        = await tmc.server.call("GetDetailedPlayerInfo", login);
            const nationality = this.parseNationality(info.Path);

            tmc.cli(`${LOG} ${login} → path="${info.Path}" nationality="${nationality}" nick="${info.NickName}"`);

            if (!this.teams.has(nationality)) {
                this.teams.set(nationality, {
                    nationality,
                    players:             new Map(),
                    bestScore:           0,
                    lastRoundMultiplier: 1,
                    lastRoundScore:      0,
                    allTimeBestScore:    0,
                    achievedAllTimeHigh: false,
                });
                tmc.cli(`${LOG} Created new team for "${nationality}"`);
            }

            const team = this.teams.get(nationality)!;
            team.players.set(login, {
                login,
                nickName:    info.NickName ?? login,
                nationality,
                lastTime:    null,
                lastScore:   0,
            });
            tmc.cli(`${LOG} Added ${login} to team "${nationality}" (${team.players.size} player(s) total)`);
        } catch (e) {
            tmc.cli(`${LOG} ERROR registering ${login}: ${e}`);
        }
    }

    private parseNationality(playerPath: string): string {
        if (!playerPath) return "World";
        const parts = playerPath.split("|");
        return parts[1]?.trim() || "World";
    }

    // ── Server callbacks ───────────────────────────────────────────────────────

    private async onPlayerConnect(data: any[]): Promise<void> {
        if (!this.active) return;
        tmc.cli(`${LOG} >>> TMC.PlayerConnect fired — raw: ${JSON.stringify(data)}`);
        try {
            const login = data["login"] as string;
            tmc.cli(`${LOG} PlayerConnect: login="${login}"  isSpectator=${data[1]}`);
            await this.registerPlayer(login);

            await this.updateUI();
        } catch (e) {
            tmc.cli(`${LOG} ERROR in onPlayerConnect: ${e}`);
        }
    }

    private async onPlayerDisconnect(data: any[]): Promise<void> {
        if (!this.active) return;
        tmc.cli(`${LOG} >>> TMC.PlayerDisconnect fired — raw: ${JSON.stringify(data)}`);
        try {
            const login = data["login"] as string;
            tmc.cli(`${LOG} PlayerDisconnect: login="${login}"`);
            let found = false;
            for (const [nat, team] of this.teams) {
                if (team.players.delete(login)) {
                    found = true;
                    tmc.cli(`${LOG}   Removed ${login} from team "${nat}" (${team.players.size} remaining)`);
                    break;
                }
            }
            if (!found) tmc.cli(`${LOG}   WARNING: ${login} was not found in any team`);
            await this.updateUI();
        } catch (e) {
            tmc.cli(`${LOG} ERROR in onPlayerDisconnect: ${e}`);
        }
    }

    private async onPlayerFinish(data: any[]): Promise<void> {
        if (!this.active) return;
        tmc.cli(`${LOG} >>> TMC.PlayerFinish fired — raw: ${JSON.stringify(data)}`);
        try {
            const login  = data[0] as string;
            const timeMs = data[1] as number;
            tmc.cli(`${LOG} PlayerFinish: login="${login}"  time=${timeMs}ms`);

            if (timeMs <= 0) {
                tmc.cli(`${LOG}   time=0 → DNF/gave up, ignoring`);
                return;
            }

            let found = false;
            for (const team of this.teams.values()) {
                const player = team.players.get(login);
                if (player) {
                    player.lastTime  = timeMs;
                    player.lastScore = this.calculateScore(timeMs);
                    tmc.cli(`${LOG}   ${login} (team "${team.nationality}") finished in ${this.formatTime(timeMs)} → score=${player.lastScore}`);
                    found = true;
                    await this.updateUI();
                    break;
                }
            }
            if (!found) tmc.cli(`${LOG}   WARNING: ${login} finished but was not found in any team`);
        } catch (e) {
            tmc.cli(`${LOG} ERROR in onPlayerFinish: ${e}`);
        }
    }

    private async onBeginRound(): Promise<void> {
        if (!this.active) return;
        tmc.cli(`${LOG} >>> Trackmania.BeginRound fired`);
        try {
            let resetCount = 0;
            for (const team of this.teams.values()) {
                for (const player of team.players.values()) {
                    player.lastTime  = null;
                    player.lastScore = 0;
                    resetCount++;
                }
            }
            tmc.cli(`${LOG} BeginRound: cleared times/scores for ${resetCount} player(s)`);
            await this.updateUI();
        } catch (e) {
            tmc.cli(`${LOG} ERROR in onBeginRound: ${e}`);
        }
    }

    private async onEndRound(): Promise<void> {
        if (!this.active) return;
        tmc.cli(`${LOG} >>> Trackmania.EndRound fired`);
        try {
            for (const team of this.teams.values()) {
                const allPlayers = [...team.players.values()];

                if (allPlayers.length === 0) continue;

                const scoringPlayers = allPlayers.length > 10
                    ? allPlayers.sort((a, b) => b.lastScore - a.lastScore).slice(0, 10)
                    : allPlayers;

                const mult       = this.getTeamMultiplier(allPlayers.length);
                const rawTotal   = scoringPlayers.reduce((sum, p) => sum + p.lastScore, 0);
                const roundScore = Math.round(rawTotal * mult);

                team.lastRoundMultiplier = mult;
                team.lastRoundScore      = roundScore;
				team.achievedAllTimeHigh = false;

                if (roundScore > team.bestScore) {
                    team.bestScore = roundScore;
                }

                if (this.mapInfo && roundScore > team.allTimeBestScore) {
                    team.allTimeBestScore    = roundScore;
                    team.achievedAllTimeHigh = true;
                    await this.setDatabaseScore(this.mapInfo.uuid, team.nationality, roundScore);
                    tmc.cli(`${LOG} ★ NEW ALL-TIME HIGH for "${team.nationality}": ${roundScore}`);
                }

                tmc.cli(`${LOG} EndRound: team="${team.nationality}"  total=${allPlayers.length}  scoring=${scoringPlayers.length}  rawTotal=${rawTotal}  mult=x${mult.toFixed(2)}  roundScore=${roundScore}  allTimeBest=${team.allTimeBestScore}`);
            }
            await this.updateUI();
        } catch (e) {
            tmc.cli(`${LOG} ERROR in onEndRound: ${e}`);
        }
    }

    // ── Scoring ────────────────────────────────────────────────────────────────

    private calculateScore(timeMs: number): number {
        if (!this.mapInfo || timeMs <= 0) return 0;
        const { authorTime: at, bronzeTime: bt } = this.mapInfo;
        if (timeMs > bt) return 0;
        if (at <= 0 || bt <= at) return 1000;
        const k = Math.log(bt / at);
        if (k === 0) return 1000;
        return Math.max(0, Math.round(1 + 999 * (Math.log(bt / timeMs) / k)));
    }

    private getTeamMultiplier(n: number): number {
        if (n <= 0) return 0;
        // Small teams get a multiplier to compensate for fewer players.
        const table = [6.5, 3.5, 2.5, 2, 1.7, 1.5, 1.35, 1.2, 1.1, 1];
        return table[Math.min(n, table.length) - 1];
    }

    // ── UI ─────────────────────────────────────────────────────────────────────

    private buildUIData(): UIData {
        const sorted = [...this.teams.values()]
            .filter(t => t.players.size > 0 || t.allTimeBestScore > 0)
            .sort((a, b) => {
                const diff = b.bestScore - a.bestScore;
                return diff !== 0 ? diff : b.allTimeBestScore - a.allTimeBestScore;
            });

        const teams: TeamUIData[] = sorted.map(team => ({
            nationality:      team.nationality,
            playerCount:      team.players.size,
            multiplier:       team.lastRoundMultiplier.toFixed(1),
            lastRoundScore:   team.lastRoundScore.toLocaleString(),
            bestScore:        team.bestScore.toLocaleString(),
            allTimeBestScore: team.allTimeBestScore,
            isAllTimeHigh:    team.achievedAllTimeHigh,
            players: [...team.players.values()].map(p => ({
                nickName:   p.nickName,
                lastTime:   p.lastTime !== null ? this.formatTime(p.lastTime) : "-",
                lastScore:  p.lastScore,
                isFinished: p.lastTime !== null,
            })),
        }));

        return { teams };
    }

    private async updateUI(): Promise<void> {
        if (!this.active || !this.widget) {
            tmc.cli(`${LOG} updateUI() skipped — active=${this.active} widget=${this.widget !== null}`);
            return;
        }
        try {
            const data = this.buildUIData();
            tmc.cli(`${LOG} updateUI() — ${data.teams.length} team(s)`);
            this.widget.setData(data);
            tmc.cli(`${LOG} updateUI() - data: ${JSON.stringify(data)}`);
            await this.widget.display(data);
            tmc.cli(`${LOG} updateUI() — widget.display() OK`);
        } catch (e) {
            tmc.cli(`${LOG} ERROR in updateUI(): ${e}`);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private formatTime(ms: number): string {
        const cs  = Math.floor(ms / 10)   % 100;
        const sec = Math.floor(ms / 1000) % 60;
        const min = Math.floor(ms / 60000);
        return `${min}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
    }
}
