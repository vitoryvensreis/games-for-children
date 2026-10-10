// GamesNavagador integration: explicit, per-account backups of solo worlds.
// Worlds continue auto-saving to OpusCraft's local IndexedDB.
// Export/import uses upstream OpusCraft's own versioned binary world format.
import type { WorldMeta } from './storage/worldStore';
import { exportWorld, importWorld } from './storage/worldTransfer';

export async function backupToVps(world: WorldMeta): Promise<void> {
 if(!window.confirm('Enviar um backup de "'+world.name+'" para sua conta familiar na VPS?'))return;
 const blob=await exportWorld(world.id);
 if(blob.size>64*1024*1024)throw new Error('Este mundo passou de 64 MB. Use a opção Make Backup para baixar uma cópia.');
 const response=await fetch('/api/opuscraft/world-backups/'+encodeURIComponent(world.id),{
  method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream'},body:blob,cache:'no-store'
 });
 if(!response.ok){
  const error=await response.json().catch(()=>({error:'Falha ao salvar'}));
  throw new Error(error.error||'O servidor recusou o backup');
 }
}
export async function restoreFromVps(): Promise<void> {
 const r=await fetch('/api/opuscraft/world-backups',{credentials:'same-origin',cache:'no-store'});
 if(!r.ok)throw Error('Não foi possível consultar os backups.');
 const list=await r.json() as {backups:{id:string;version:string;size:number;created:string}[]};
 if(!list.backups?.length){window.alert('Esta conta ainda não tem backups na VPS.');return}
 const options=list.backups.slice(0,25);
 const choice=window.prompt('Escolha o backup a restaurar (uma NOVA cópia; não apaga seu mundo atual):\n'+options.map((b,i)=>
  (i+1)+'. '+b.id+' — '+new Date(b.created).toLocaleString('pt-BR')+' ('+Math.ceil(b.size/1048576)+' MB)').join('\n'));
 if(choice===null)return;
 const n=Number(choice);
 if(!Number.isInteger(n)||n<1||n>options.length)throw Error('Seleção inválida.');
 const b=options[n-1];
 const file=await fetch('/api/opuscraft/world-backups/'+encodeURIComponent(b.id)+'/'+encodeURIComponent(b.version),{
  credentials:'same-origin',cache:'no-store'
 });
 if(!file.ok)throw Error('Backup não disponível.');
 const result=await importWorld(await file.blob());
 window.alert('Mundo restaurado como "'+result.name+'". Ele aparecerá na lista de Um jogador.');
}
