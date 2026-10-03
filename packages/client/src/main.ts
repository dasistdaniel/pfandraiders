import Phaser from 'phaser';
import { GAME_H, GAME_W } from './layout';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { LobbyScene } from './scenes/LobbyScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#111111',
  pixelArt: true,
  input: { gamepad: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, LobbyScene, GameScene],
});
