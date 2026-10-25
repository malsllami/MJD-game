// مسؤولية الملف: جلسة اللعب — تحتفظ بحالة الدولة وتطبّق عليها الأوامر وتحفظها، بلا أي علاقة بالرسم أو الواجهة
// File responsibility: play session — holds nation state, applies actions to it and saves it; no rendering or UI

import {
  advance, annexTile, checkAnnex, checkMove, checkPlacement, createInitialState, demolishBuilding, moveBuilding, placeBuilding,
  placeRoadPath, resumeAfterAbsence, type Check, type Resume, type RoadPathResult,
} from '../core/economy';
import type { BuildingDef, GameDefinitions, GameState, Tile, World } from '../core/types';
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
    const check = checkPlacement(this.defs, this.current, building, tile, now);
    if (check.ok) {
      this.current = placeBuilding(this.current, building, tile, now, crypto.randomUUID());
      this.persist();
    }
    return check;
  }

  /** رسم طريق على مسار / Lay a road along a path */
  placeRoad(road: BuildingDef, path: Tile[], now: number): RoadPathResult {
    this.tick(now);
    const result = placeRoadPath(this.current, this.defs, road, path, now, () => crypto.randomUUID());
    this.current = result.state;
    if (result.placed) this.persist();
    return result;
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
    const check = checkMove(this.defs, this.current, uid, tile, now);
    if (check.ok) {
      this.current = moveBuilding(this.current, this.defs, uid, tile);
      this.persist();
    }
    return check;
  }

  /** محاولة ضم مربع للدولة / Try to annex a tile */
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
