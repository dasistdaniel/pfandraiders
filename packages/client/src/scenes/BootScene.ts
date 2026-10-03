import Phaser from 'phaser';
import { bakeStaticTextures } from '../textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    bakeStaticTextures(this);
    this.scene.start('lobby');
  }
}
