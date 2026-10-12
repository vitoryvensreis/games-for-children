// Audited headless host optimization for upstream OpusCraft bc0c753.
// Physics, network, world simulation and autosaves remain authoritative 20 TPS.
// Only invisible dedicated VPS host graphics/UI/meshing are bypassed.
import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2];
if(!root)throw Error('Usage: node ops/patch-opuscraft-host-cpu.mjs <opuscraft-src>');
function patch(file,find,replace){
 const full=path.join(root,file),old=fs.readFileSync(full,'utf8');
 if(!old.includes(find)||old.indexOf(find)!==old.lastIndexOf(find))
  throw Error('Upstream changed; refusing host CPU patch '+file);
 fs.writeFileSync(full,old.replace(find,replace));
}
patch('src/main.ts',
 "  if (params.has('gfcHost')) {\n    // VPS-owned persistent IndexedDB profile, reused across automatic restarts.",
 "  if (params.has('gfcHost')) {\n    (window as any).__gfcDedicatedHost = true;\n    // VPS-owned persistent IndexedDB profile, reused across automatic restarts.");
// Each worker holds world generation data. Cap memory on the dedicated host.
patch('src/worker/pool.ts',
 "export function workerCount(): number {\n  if (touchOnly()) return 2;",
 "export function workerCount(): number {\n  if ((window as any).__gfcDedicatedHost === true) return 2;\n  if (touchOnly()) return 2;");
patch('src/world/chunkManager.ts',
 "  paused = false;\n  /** bumped when the world drops its chunks",
 "  paused = false;\n  dedicatedHeadlessHost = false;\n  /** bumped when the world drops its chunks");
// No meshing or dirty-section sorting on the hidden VPS host after spawn.
// Continue chunk generation and lighting; clients mesh their own chunks.
patch('src/world/chunkManager.ts',
 "  update(): void {\n    if (this.genQueueDirty) this.rebuildGenQueue();",
 [
 "  update(): void {",
 "    if (this.genQueueDirty) this.rebuildGenQueue();",
 "    if (this.dedicatedHeadlessHost) {",
 "      this.meshList = [];",
 "      this.meshListIdx = 0;",
 "      if (!this.paused) this.pool.pump();",
 "      return;",
 "    }"
 ].join('\n'));
patch('src/world/chunkManager.ts',
 "    const mesh = this.nextMeshJob();\n    if (mesh) return mesh;",
 "    const mesh = this.dedicatedHeadlessHost ? null : this.nextMeshJob();\n    if (mesh) return mesh;");
patch('src/world/chunkManager.ts',
 "        if (dx * dx + dz * dz <= (radius - 1) * (radius - 1) && c.dirty) return false;",
 "        if (!this.dedicatedHeadlessHost && dx * dx + dz * dz <= (radius - 1) * (radius - 1) && c.dirty) return false;");
// Only enable after the host has safely spawned into the world.
patch('src/game/game.ts',
 "    if (this.inWorld) {\n      this.chunks.setCenter(this.player.x, this.player.z);",
 [
 "    if (this.inWorld) {",
 "      this.chunks.dedicatedHeadlessHost =",
 "        (window as any).__gfcDedicatedHost === true && this.mode === 'host' && this.spawned;",
 "      this.chunks.setCenter(this.player.x, this.player.z);"
 ].join('\n'));
patch('src/game/game.ts',
 "    this.touch.frame(t0);\n    if (this.inWorld) this.handleFrameInput();",
 "    if ((window as any).__gfcDedicatedHost !== true) this.touch.frame(t0);\n    if (this.inWorld && !this.chunks.dedicatedHeadlessHost) this.handleFrameInput();");
patch('src/game/game.ts',
 "    this.sound.update(this.inWorld ? this.player : null, this.opts);",
 "    if (!this.inWorld || !this.chunks.dedicatedHeadlessHost) this.sound.update(this.inWorld ? this.player : null, this.opts);");
// All level/spawner/server ticks above this point still run at 20 Hz.
// Skip purely local HUD, hand, particles and sound, preserve autosave.
patch('src/game/game.ts',
 "    // (the host's ambience is its own: its torches' smoke isn't sent to the guests, who make their own)\n    const ambient = () => {",
 [
 "    if (this.chunks.dedicatedHeadlessHost) {",
 "      if (++this.autosaveTimer >= 6000) {",
 "        this.autosaveTimer = 0;",
 "        void this.saveWorld();",
 "      }",
 "      return;",
 "    }",
 "    // (the host's ambience is its own: its torches' smoke isn't sent to the guests, who make their own)",
 "    const ambient = () => {"
 ].join('\n'));
console.log('Dedicated VPS OpusCraft host CPU mode installed');
