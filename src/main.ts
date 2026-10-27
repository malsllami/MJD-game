// مسؤولية الملف: نقطة البداية — تحميل التعريفات، توليد العالم، بناء المشهد، متابعة الحفظ أو اختيار موقع الانطلاق، ثم تشغيل اللعبة
// File responsibility: entry point — load definitions, generate the world, build the scene, resume a save or pick a start site, then run

import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import './styles/main.css';

import { APP_CONFIG } from './config/app.config';
import { suggestStartSites } from './core/start-sites';
import { generateWorld } from './core/world-gen';
import { startGame } from './game/game-controller';
import { GameSession } from './game/game-session';
import { createDefinitionsSource } from './services/definitions-service';
import { SaveService, worldSignature } from './services/save-service';
import { mountRotateHint } from './ui/rotate-hint';
import { chooseStartSite } from './ui/start-picker';
import { createGameScene } from './world/game-scene';
import { resolveQuality } from './world/quality';

/**
 * تشغيل اللعبة
 * Boots the game
 */
async function bootstrap(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
  const hudRoot = document.querySelector<HTMLElement>('#hud')!;
  mountRotateHint(document.body);

  const source = createDefinitionsSource(APP_CONFIG.definitionsSource, APP_CONFIG.apiUrl, APP_CONFIG.apiTimeoutMs);
  const defs = await source.load();
  const world = generateWorld(defs.world, defs.terrain, defs.deposits);
  const { preset } = resolveQuality(defs.world.defaultQuality);
  const game = createGameScene(canvas, world, defs, preset);

  const saves = new SaveService(worldSignature(defs.world));
  const saved = saves.load();
  let session: GameSession;
  if (saved.kind === 'loaded') {
    session = GameSession.resume(defs, world, saves, saved.state, Date.now());
  } else {
    const site = await chooseStartSite(hudRoot, defs, world, game, suggestStartSites(world, defs));
    session = GameSession.create(defs, world, saves, site, Date.now());
  }
  startGame(hudRoot, defs, world, game, session, saved.kind === 'world-changed');
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  const fatal = document.createElement('p');
  fatal.className = 'fatal';
  fatal.textContent = `تعذّر تشغيل اللعبة: ${err instanceof Error ? err.message : String(err)}`;
  document.body.append(fatal);
});
