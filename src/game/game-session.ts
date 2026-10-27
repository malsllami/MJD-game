// مسؤولية الملف: جلسة اللعب — تحتفظ بحالة الدولة وتطبّق عليها الأوامر وتحفظها، بلا أي علاقة بالرسم أو الواجهة
// File responsibility: play session — holds nation state, applies actions to it and saves it; no rendering or UI

import {
  advance, annexTile, checkAnnex, checkMove, checkPlacement, createInitialState, demolishBuilding, demolishRoads, moveBuilding,
  placeBuilding, placeRoadPath, placeWallPath, resumeAfterAbsence, surveyTile, type Check, type Resume, type RoadPathResult,
} from '../core/economy';
import { checkClearing, startClearing } from '../core/frontier';
import { checkTrade, trade, type Side } from '../core/market';
import { checkBuildingUpgrade, checkUpgrade, upgradeBuilding, upgradeGovernment } from '../core/progression';
import type { BuildingDef, Deposit, GameDefinitions, GameState, Tile, World } from '../core/types';
import type { SaveService } from '../services/save-service';

/** كيف بدأت الجلسة / How the session started */
export type SessionStart = { kind: 'new' } | { kind: 'resumed'; resume: Resume };

export class GameSession {
  private constructor(
    private readonly defs: GameDefinitions,
    private readonly world: World,
    private readonly saves: SaveService,
    private current: GameState,
    readonly start: SessionStart,
  ) {
    this.persist();
  }

  /** متابعة دولة محفوظة مع حساب الغياب / Continue a saved nation, crediting the absence */
  static resume(defs: GameDefinitions, world: World, saves: SaveService, saved: GameState, now: number): GameSession {
    const resume = resumeAfterAbsence(saved, defs, world, now);
    return new GameSession(defs, world, saves, resume.state, { kind: 'resumed', resume });
  }

  /** دولة جديدة في الموقع المختار / New nation at the chosen site */
  static create(defs: GameDefinitions, world: World, saves: SaveService, site: { x: number; z: number }, now: number): GameSession {
    return new GameSession(defs, world, saves, createInitialState(defs, world, site, now), { kind: 'new' });
  }

  get state(): GameState {
    return this.current;
  }

  /** حساب الزمن حتى الآن / Advance time up to now */
  tick(now: number): void {
    this.current = advance(this.current, this.defs, this.world, now);
  }

  /** محاولة وضع مبنى / Try to place a building */
  place(building: BuildingDef, tile: Tile, now: number): Check {
    this.tick(now);
    const check = checkPlacement(this.defs, this.world, this.current, building, tile, now);
    if (check.ok) {
      this.current = placeBuilding(this.current, building, tile, now, crypto.randomUUID());
      this.persist();
    }
    return check;
  }

  /** رسم طريق على حواف بين المربعات / Lay a road along edges between tiles */
  placeRoad(road: BuildingDef, edges: string[], now: number): RoadPathResult {
    this.tick(now);
    const result = placeRoadPath(this.current, this.defs, this.world, road, edges, now, () => crypto.randomUUID());
    this.current = result.state;
    if (result.placed) this.persist();
    return result;
  }

  /** هدم الطرق على حواف / Remove the roads on edges */
  demolishRoads(edges: string[], now: number): number {
    this.tick(now);
    const { state, removed } = demolishRoads(this.current, this.defs, edges);
    this.current = state;
    if (removed) this.persist();
    return removed;
  }

  /** مسح الموارد حول مربع؛ يعيد المكامن الجديدة أو سبب الرفض / Survey around a tile; returns new deposits or the refusal */
  survey(tile: Tile, now: number): { found: Deposit[] } | { reason: string } {
    this.tick(now);
    const result = surveyTile(this.current, this.defs, this.world, tile);
    if ('reason' in result) return result;
    this.current = result.state;
    this.persist();
    return { found: result.found };
  }

  /** هدم مبنى / Demolish a building */
  demolish(uid: string, now: number): void {
    this.tick(now);
    this.current = demolishBuilding(this.current, this.defs, uid);
    this.persist();
  }

  /** محاولة نقل مبنى / Try to move a building */
  move(uid: string, tile: Tile, now: number): Check {
    this.tick(now);
    const check = checkMove(this.defs, this.world, this.current, uid, tile, now);
    if (check.ok) {
      this.current = moveBuilding(this.current, this.defs, uid, tile);
      this.persist();
    }
    return check;
  }

  /** محاولة ضم مربع للدولة / Try to annex a tile */
  /** رسم سور أو بوابة على حواف / Draw a wall or gate along edges */
  placeWall(wall: BuildingDef, edges: string[], now: number): RoadPathResult {
    this.tick(now);
    let n = 0;
    const result = placeWallPath(this.current, this.defs, this.world, wall, edges, now, () => `w${now.toString(36)}-${n++}`);
    this.current = result.state;
    if (result.placed) this.persist();
    return result;
  }

  /** ترقية مبنى الحكم إلى المستوى التالي / Upgrade the government building to the next level */
  upgrade(now: number): Check {
    this.tick(now);
    const check = checkUpgrade(this.defs, this.current, now);
    if (check.ok) {
      this.current = upgradeGovernment(this.current, this.defs, this.world);
      this.persist();
    }
    return check;
  }

  /** ترقية مبنى مستوى واحدًا / Upgrade a building one level */
  upgradeBuilding(uid: string, now: number): Check {
    this.tick(now);
    const check = checkBuildingUpgrade(this.defs, this.current, uid, now);
    if (check.ok) {
      this.current = upgradeBuilding(this.current, this.defs, uid, now);
      this.persist();
    }
    return check;
  }

  /** بيع أو شراء في السوق / Buy or sell at the market */
  trade(resourceId: string, amount: number, side: Side, now: number): Check {
    this.tick(now);
    const check = checkTrade(this.current, this.defs, resourceId, amount, side, now);
    if (check.ok) {
      this.current = trade(this.current, this.defs, resourceId, amount, side);
      this.persist();
    }
    return check;
  }

  /** بدء قطع قطعة غابة لضمها / Start clearing a forest parcel to annex it */
  clear(tile: Tile, now: number): Check {
    this.tick(now);
    const check = checkClearing(this.defs, this.world, this.current, tile, now);
    if (check.ok) {
      this.current = startClearing(this.current, this.defs, this.world, tile, now, crypto.randomUUID());
      this.persist();
    }
    return check;
  }

  annex(tile: Tile, now: number): Check {
    this.tick(now);
    const check = checkAnnex(this.defs, this.world, this.current, tile);
    if (check.ok) {
      this.current = annexTile(this.current, this.defs, this.world, tile);
      this.persist();
    }
    return check;
  }

  persist(): void {
    if (!this.abandoned) this.saves.save(this.current);
  }

  /** ترك الدولة الحالية: يُمسح الحفظ ويتوقف الحفظ التلقائي / Abandon the nation: wipe the save and stop autosaving */
  abandon(): void {
    this.abandoned = true;
    this.saves.clear();
  }

  private abandoned = false;
}
