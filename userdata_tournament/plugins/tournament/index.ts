import Plugin from "@core/plugins";
import Widget from '@core/ui/widget';
 
const DEFAULT_POINTS: readonly number[] = [
	30, 27, 25, 23, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10,  9,  8,  7,  6, 5,  4,  3,  2,  1,
];
 
interface PlayerScore {
	login:    string;
	nickname: string;
	score:    number;
}
 
export default class TournamentPlugin extends Plugin {
    private scoreWidget: Widget | null = null;
    private enabled: boolean = false;
    private playerScores: PlayerScore[] = [];
 
    async onLoad() {
        tmc.addCommand("//tournament start", this.cmdStart.bind(this), "admin", "Start tournament scoring");
        tmc.addCommand("//tournament stop",  this.cmdStop.bind(this),  "admin", "Stop tournament scoring");
        tmc.server.addListener("Trackmania.EndMap", this.onEndMap, this);
        tmc.chat('TournamentPlugin loaded. Use //tournament start');
    }
 
    async onUnload() {
        tmc.removeCommand("//tournament start");
        tmc.removeCommand("//tournament stop");
        tmc.server.removeListener('Trackmania.EndMap', this.onEndMap);
    }
 
    private async cmdStart(login: string, _params: string[]): Promise<void> {
        if (this.enabled) {
            return tmc.chat('¤error¤Tournament already started!', login);
        }
        this.enabled = true;
        this.playerScores = [];
        this.scoreWidget = new Widget('userdata/plugins/tournament/ui.xml.twig');
        await this.updateWidgetData();
        tmc.chat(`Tournament has begun! GL HF!`);
    }
 
    private async cmdStop(_login: string, _params: string[]): Promise<void> {
        this.enabled = false;
        this.playerScores = [];
        this.scoreWidget?.destroy();
        this.scoreWidget = null;
        tmc.chat(`Tournament has ended. GG!`);
    }
 
    private async updateWidgetData(): Promise<void> {
        if (!this.scoreWidget || !this.enabled) {
            return;
        }
        try {
			tmc.cli(`UI update: ${JSON.stringify(this.playerScores)}`);
            this.scoreWidget.setData(this.playerScores);
            await this.scoreWidget.display();
        } catch (error) {
            tmc.log.error(`Error updating tournament widget: ${error.message}`);
        }
    }
 
    async onEndMap(data: any[]): Promise<void> {
        if (!this.enabled) return;
        const rankings = Array.isArray(data[0]) ? data[0] : []
        const ranked = rankings.filter(
            (r) => r.BestTime > 0 || r.Score > 0
        );
        const currentScores = this.playerScores;
        for (let i = 0; i < ranked.length; i++) {
            const entry = ranked[i];
            const pts = i < DEFAULT_POINTS.length ? DEFAULT_POINTS[i] : 0;
            if (pts <= 0) continue;
            const existing = currentScores.find((p) => p.login === entry.Login);
            if (existing) {
                existing.score   += pts;
                existing.nickname = entry.NickName;
            } else {
                currentScores.push({
                    login:    entry.Login,
                    nickname: entry.NickName,
                    score:    pts,
                });
            }
        }
        this.playerScores = currentScores.sort((a, b) => b.score - a.score);
        await this.updateWidgetData();
    }
}
 