import Phaser from 'phaser';
import { SHEET_KEY, bakeStaticTextures } from '../textures';
import sheetUrl from '../assets/kenney/modern-city.png';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.on('loaderror', (file: { key: string }) => {
      console.warn(`Asset konnte nicht geladen werden: ${file.key}, nutze gezeichnete Grafik`);
    });
    this.load.image(SHEET_KEY, sheetUrl);
  }

  create(): void {
    bakeStaticTextures(this);
    this.scene.start('menu');
  }
}
