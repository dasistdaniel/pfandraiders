import Phaser from 'phaser';
import { GAME_H, GAME_W } from './layout';
import { BootScene } from './scenes/BootScene';
import { FinalScene } from './scenes/FinalScene';
import { GameScene } from './scenes/GameScene';
import { HelpScene } from './scenes/HelpScene';
import { MenuScene } from './scenes/MenuScene';
import { LobbyScene } from './scenes/LobbyScene';
import { ShopScene } from './scenes/ShopScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#111111',
  pixelArt: true,
  input: { gamepad: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // HelpScene zuletzt: aus dem Esc-Menü liegt sie über dem Spiel
  scene: [BootScene, MenuScene, LobbyScene, GameScene, ShopScene, FinalScene, HelpScene],
});
