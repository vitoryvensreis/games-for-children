// Resolution controller for family multiplayer ONLY. Never changes the saved
// video options, chunk radius, simulation, physics or the authoritative host.
export type FamilyQualityMode='original'|'auto'|'performance'|'balanced'|'quality';
const MODES=['original','auto','performance','balanced','quality'] as const;
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
const round=(n:number)=>Math.round(n*100)/100;
export const qualityPreset=(mode:FamilyQualityMode,mobile:boolean):number=>{
 const values=mobile?
  {original:1,auto:0.52,performance:0.44,balanced:0.56,quality:0.68}:
  {original:1,auto:0.55,performance:0.45,balanced:0.60,quality:0.75};
 return values[mode];
};
export interface QualityStatus{
 mode:FamilyQualityMode;scale:number;targetFps:number;mobile:boolean;
 ready:boolean;pausedReason:string;fps:number;adjustments:number;
}
export class FamilyAdaptiveQuality{
 private mode:FamilyQualityMode='auto';
 private scale:number;
 private readonly min:number;
 private readonly max:number;
 private lastSample=0;
 private lastChange=0;
 private startedAt=0;
 private below=0;
 private above=0;
 private fps=0;
 private ready=false;
 private reason='Aguardando entrada no mundo';
 private adjustments=0;
 private active=true;
 readonly mobile:boolean;
 readonly targetFps:number;
 private readonly onScaleChange:(scale:number)=>void;
 constructor(mobile:boolean,targetFps:number,onScaleChange:(scale:number)=>void){
  this.mobile=mobile;this.targetFps=targetFps;this.onScaleChange=onScaleChange;
  this.min=mobile?0.42:0.43;
  this.max=mobile?0.68:0.75;
  this.scale=qualityPreset('auto',mobile);
 }
 status():QualityStatus{
  return {mode:this.mode,scale:this.scale,targetFps:this.targetFps,mobile:this.mobile,
   ready:this.ready,pausedReason:this.reason,fps:this.fps,adjustments:this.adjustments};
 }
 setMode(value:string,now=performance.now()):boolean{
  if(!this.active||!MODES.includes(value as FamilyQualityMode))return false;
  const mode=value as FamilyQualityMode;
  if(this.mode===mode)return true;
  this.mode=mode;this.below=0;this.above=0;this.lastChange=now;
  this.startedAt=now;this.lastSample=now;
  this.reason=mode==='auto'?'Aguardando estabilização':mode==='original'?'OpusCraft original':'Ajuste manual';
  this.apply(qualityPreset(mode,this.mobile));
  return true;
 }
 sample(now:number,fps:number,ready:boolean,queuedChunks:number,hidden:boolean):void{
  if(!this.active||!Number.isFinite(now))return;
  if(!this.startedAt)this.startedAt=now;
  if(now-this.lastSample<2500)return;
  this.lastSample=now;
  this.fps=Number.isFinite(fps)?Math.max(0,Math.round(fps)):0;
  this.ready=ready;
  if(this.mode!=='auto'){this.reason=this.mode==='original'?'OpusCraft original':'Ajuste manual';return;}
  if(!ready||hidden||queuedChunks>4||this.fps<1){
   this.below=0;this.above=0;
   this.reason=!ready?'Aguardando mapa':hidden?'Jogo em segundo plano':
    queuedChunks>4?'Aguardando chunks':'Medindo quadros';
   return;
  }
  if(now-this.startedAt<9000){this.reason='Aquecendo o jogo';return;}
  const target=Math.min(60,Math.max(15,this.targetFps));
  if(this.fps<target*0.77){this.below++;this.above=0;}
  else if(this.fps>=target*0.94){this.above++;this.below=0;}
  else{this.below=0;this.above=0;}
  this.reason='Adaptando ao dispositivo';
  // Hysteresis prevents quality ping-pong and expensive canvas resizes.
  if(this.below>=3&&now-this.lastChange>=9000){
   this.apply(this.scale-0.04);this.lastChange=now;this.below=0;this.above=0;
  }else if(this.above>=6&&now-this.lastChange>=18000){
   this.apply(this.scale+0.03);this.lastChange=now;this.below=0;this.above=0;
  }
 }
 stop():void{this.active=false;this.ready=false;this.reason='Encerrado';}
 private apply(raw:number){
  const next=this.mode==='original'?1:round(clamp(raw,this.min,this.max));
  if(next===this.scale)return;
  this.scale=next;this.adjustments++;
  this.onScaleChange(next);
 }
}
