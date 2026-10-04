import Phaser from 'phaser';
import { SHEET_KEY, bakeStaticTextures } from '../textures';
import sheetUrl from '../assets/kenney/modern-city.png';
import { CHARACTER_URLS } from '../characterAssets';
import { CHAR_FRAME_H, CHAR_FRAME_W } from '../playerChars';
import { charTexture, npcSheetTexture } from '../textureKeys';
import { NPC_SHEET_URLS } from '../npcAssets';
import { DOG_FRAME, OFFICER_FRAME } from '../npcAnim';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.on('loaderror', (file: { key: string }) => {
      console.warn(`Asset konnte nicht geladen werden: ${file.key}, nutze gezeichnete Grafik`);
    });
    this.load.image(SHEET_KEY, sheetUrl);
    // Figurenbögen; fehlt einer, nutzt die Spielszene für diese Figur die gezeichnete Grafik.
    for (const [key, url] of Object.entries(CHARACTER_URLS)) {
      this.load.spritesheet(charTexture(key), url, { frameWidth: CHAR_FRAME_W, frameHeight: CHAR_FRAME_H });
    }
    // NPC-Bögen (Hund 16x16, Polizist 32x32); fehlt einer, zeichnet die Spielszene den Hund bzw. Polizisten selbst.
    for (const [key, url] of Object.entries(NPC_SHEET_URLS)) {
      const size = key === npcSheetTexture('officer') ? OFFICER_FRAME : DOG_FRAME;
      this.load.spritesheet(key, url, { frameWidth: size, frameHeight: size });
    }
  }

  create(): void {
    bakeStaticTextures(this);
    this.scene.start('menu');
  }
}
