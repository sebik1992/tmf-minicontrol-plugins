import Plugin from "@core/plugins";
import Widget from '@core/ui/widget';

interface BossData {
    name: string;
    currentHp: number;
    maxHp: number;
    damageDealers: { login: string, damage: number }[];
}

export default class BossPlugin extends Plugin {
    private bossWidget: Widget | null = null;
    private isBoss: boolean = false;
    private bossName: string = "";
    private bossMaxHp: number = 0;
    private bossHp: number = 0;
	private bossDamageMulti: number = 1;
	private bossHpHealsPerSecond: number = 0;
    private damageDealers: Map<string, number> = new Map();
    private hpRefreshInterval: NodeJS.Timeout | null = null;

    async onLoad() {
        tmc.addCommand(
            "//boss spawn",
            this.handleSpawnCommand.bind(this),
            "admin",
            "Spawn Boss X with Y hitpoints (Usage: //boss spawn <name> <hp>)"
        );

        tmc.addCommand(
            "//boss despawn",
            this.onBossDespawn.bind(this),
            "admin",
            "Instantly removes the boss"
        );
		
		tmc.addCommand(
            "//boss multi",
            this.handleMultiCommand.bind(this),
            "admin",
            "Boss takes X times more damage. Negative values heal instead."
        );
		
		tmc.addCommand(
            "//boss heals",
            this.handleHealsCommand.bind(this), 
            "admin",
            "Boss heals X hitpoints per second"
        );
		
		tmc.server.addListener('TMC.PlayerCheckpoint', this.onPlayerCheckpoint, this);
        tmc.server.addListener('TMC.PlayerFinish', this.onPlayerFinish, this);

        
        tmc.chat('BossPlugin loaded. Use //boss spawn <name> <hp> to start an encounter.');
    }

    async onUnload() {
        tmc.removeCommand("//boss spawn");
        tmc.removeCommand("//boss despawn");
		tmc.removeCommand("//boss multi");
        tmc.removeCommand("//boss heals");
		
		tmc.server.removeListener('TMC.PlayerCheckpoint', this.onPlayerCheckpoint);
        tmc.server.removeListener('TMC.PlayerFinish', this.onPlayerFinish);
        
        await this.onBossDespawn(); 
    }

    private async handleSpawnCommand(login: string, params: string[]): Promise<void> {
        if (this.isBoss) {
            return tmc.chat('¤error¤A boss is already spawned!', login);
        }
        
        const bossName = params[0]
		    .replaceAll('_', ' ')
            .replaceAll('-', ' ');
        const initialHp = parseInt(params[1], 10);
        
        if (!bossName || isNaN(initialHp) || initialHp <= 0) {
            return tmc.chat('¤cmd¤Usage: //boss spawn <name> <hp> (HP must be a positive number)', login);
        }

        this.bossName = bossName;
        this.bossHp = initialHp;
        this.bossMaxHp = initialHp;
        this.isBoss = true;
        this.damageDealers.clear();
        
        this.bossWidget = new Widget('userdata/plugins/boss/boss.xml.twig', {
             name: this.bossName,
             currentHp: this.bossHp,
             maxHp: this.bossMaxHp,
             damageDealers: []
        });
        await this.bossWidget.display();

		this.hpRefreshInterval = setInterval(this.handleHpRefresh.bind(this), 1000);

        tmc.chat(`$o${this.bossName} has been spawned with ${initialHp}HP! Slay them!`);
    }

    private async onBossDespawn(login?: string): Promise<void> {
        this.isBoss = false;
        this.bossName = "";
        this.bossHp = 0;
        this.bossMaxHp = 0;
		this.bossDamageMulti = 1;
	    this.bossHpHealsPerSecond = 0;
        this.damageDealers.clear();
        
        if (this.hpRefreshInterval) {
            clearInterval(this.hpRefreshInterval);
            this.hpRefreshInterval = null;
        }

        this.bossWidget?.destroy();
        this.bossWidget = null;
        
        if (login) {
            tmc.chat(`$oBoss instantly slayed by admin ${login}. Hax!`);
        }
    }
	
	private async handleMultiCommand(login: string, params: string[]): Promise<void> {
        if (!this.isBoss) {
            return tmc.chat('¤error¤A boss is not spawned!', login);
        }
        
        const initialMulti = parseInt(params[0], 10);
        
        if (isNaN(initialMulti)) {
            return tmc.chat('¤cmd¤Usage: //boss multi <number>', login);
        }

        this.bossDamageMulti = initialMulti;
        tmc.chat(`$oNow boss takes x${initialMulti} damage!`);
    }
	
	private async handleHealsCommand(login: string, params: string[]): Promise<void> {
        if (!this.isBoss) {
            return tmc.chat('¤error¤A boss is not spawned!', login);
        }
        
        const initialHeals = parseInt(params[0], 10);
        
        if (isNaN(initialHeals)) {
            return tmc.chat('¤cmd¤Usage: //boss heals <number>', login);
        }

        this.bossHpHealsPerSecond = initialHeals;
        tmc.chat(`$oNow boss heals x${initialHeals} HP per second!`);
    }
	
	private async handleHpRefresh(): Promise<void> {
		if (!this.isBoss) {
			return;
		}

		if (this.bossHpHealsPerSecond !== 0) {
			if (this.bossHp > 0) {
				this.bossHp += this.bossHpHealsPerSecond;
			}
			if (this.bossHp > this.bossMaxHp) {
				this.bossHp = this.bossMaxHp;
			}
		}

		await this.updateWidgetData();
	}
    
    private async updateWidgetData(): Promise<void> {
        if (!this.bossWidget || !this.isBoss) {
            return;
        }

        const sortedDamage = Array.from(this.damageDealers.entries())
            .map(([login, damage]) => {
                return { login: login, damage: damage };
            })
            .sort((a, b) => b.damage - a.damage)
			.slice(0, 5);

        const bossData: BossData = {
            name: this.bossName,
            currentHp: this.bossHp,
            maxHp: this.bossMaxHp,
			damageMulti: this.bossDamageMulti,
	        healsPerSecond: this.bossHpHealsPerSecond,
            damageDealers: sortedDamage
        };
        
        try {
            this.bossWidget.setData(bossData);
			await this.bossWidget.display(bossData);
        } catch (error) {
            tmc.log.error(`Error updating boss widget: ${error.message}`);
        }
    }

    private async onBossDefeat(): Promise<void> {
        tmc.chat(`$o$fff$s--- BOSS DEFEATED ---$z`);
        tmc.chat(`$o$f00$sThe mighty ${this.bossName} has been vanquished!$z`);
		tmc.chat(`$o$fff$sHeroes that contributed to this great victory:`);
        
        const topDamagers = Array.from(this.damageDealers.entries())
            .map(([login, damage]) => {
                return { login: login, damage: damage };
            })
            .sort((a, b) => b.damage - a.damage);
            
        topDamagers.forEach((item, index) => {
            tmc.chat(`$fff${index + 1}. $fa0$o${item.login}$o$fff dealt $fa0${item.damage} $fffdamage!`);
        });

        await this.onBossDespawn();
    }
    
    private async dealDamage(login: string, damage: number): Promise<void> {
        if (!this.isBoss || damage <= 0) return;

        this.bossHp -= damage;

        const currentDamage = this.damageDealers.get(login) || 0;
        this.damageDealers.set(login, currentDamage + damage);

        if (this.bossHp <= 0) {
            this.bossHp = 0;
            await this.onBossDefeat();
        }
        
        await this.updateWidgetData(); 
    }

    async onPlayerCheckpoint(data: any[]): Promise<void> {
        const login = data[0];
        this.dealDamage(login, 1 * this.bossDamageMulti);
    }

    async onPlayerFinish(data: any[]): Promise<void> {
        const login = data[0];
        this.dealDamage(login, 2 * this.bossDamageMulti);
    }
}