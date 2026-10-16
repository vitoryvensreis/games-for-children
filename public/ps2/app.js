'use strict';
// Play! is self-hosted. Game disc images are read only from the user's File object.
const $ = selector => document.querySelector(selector);
const allowed = new Set(['iso','chd','cso','isz','bin']);
const canvas = $('#outputCanvas'), status = $('#status'), box = $('.status-card');
const banner = $('#screen-overlay'), logEl = $('#log'), input = $('#iso'), touch = $('#touch');
const padMap = ['KeyZ','KeyX','KeyA','KeyS','Key1','Key8','Key2','Key9','Backspace','Enter','Key3','Key0','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
const keyAliases = {Digit0:'Key0',Digit1:'Key1',Digit2:'Key2',Digit3:'Key3',Digit8:'Key8',Digit9:'Key9'};
const nativeKeys = new Set(['KeyA','KeyX','KeyS','KeyZ','KeyT','KeyF','KeyH','KeyG','KeyI','KeyJ','KeyK','KeyL','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Backspace','Digit0','Digit1','Digit2','Digit3','Digit8','Digit9']);
let moduleInstance, chosenFile, currentName='', running=false, started=false;
const pressed = new Map();
const lines = [];
function showState(message, kind='pending') {
  status.textContent = message;
  box.dataset.state = kind;
}
function message(title, body) {
  $('#screen-title').textContent = title;
  $('#screen-msg').textContent = body;
  banner.hidden = false;
}
function log(line) {
  const value = String(line).trim();
  if (!value) return;
  lines.push(value);
  if (lines.length > 80) lines.shift();
  logEl.textContent = lines.join('\n');
  if (/failed to start/i.test(value)) {
    running = false;
    showState('Falha ao iniciar o jogo. Consulte o diagnóstico.', 'error');
    message('O jogo não iniciou', 'Veja o registro de eventos abaixo da tela.');
  } else if (/starting/i.test(value) && currentName) {
    running = true;
    showState('Executando: ' + currentName, 'running');
    banner.hidden = true;
  }
}
class BrowserDisc {
  constructor(emu) {this.emu = emu; this.file = null; this.done = true;}
  setFile(file) {this.file = file; this.done = true;}
  getFileSize() {return this.file ? this.file.size : 0;}
  isDone() {return this.done;}
  read(pointer, offset, size) {
    this.done = false;
    if (!this.file) {this.emu.HEAPU8.fill(0, pointer, pointer + size); this.done = true; return;}
    this.file.slice(offset, offset + size).arrayBuffer().then(buffer => {
      const bytes = new Uint8Array(buffer);
      this.emu.HEAPU8.set(bytes, pointer);
      if (bytes.length < size) this.emu.HEAPU8.fill(0, pointer + bytes.length, pointer + size);
    }).catch(error => {
      log('Falha lendo arquivo local: ' + error.message);
      this.emu.HEAPU8.fill(0, pointer, pointer + size);
    }).finally(() => {this.done = true;});
  }
}
function dispatch(code, down) {
  canvas.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
    bubbles:true, cancelable:true, code, key:code, repeat:false
  }));
  document.querySelectorAll('[data-key="' + code + '"]').forEach(el => el.classList.toggle('pressed',down));
}
function setKey(code, down, source) {
  let list = pressed.get(code);
  if (!list) {list = new Set(); pressed.set(code,list);}
  const was = list.size > 0;
  if (down) list.add(source);
  else list.delete(source);
  if (was !== (list.size > 0)) dispatch(code, list.size > 0);
}
function release(prefix) {
  for (const [code,list] of pressed) {
    const before = list.size;
    for (const src of [...list]) if (!prefix || src.startsWith(prefix)) list.delete(src);
    if (before && !list.size) dispatch(code,false);
  }
}
for (const button of document.querySelectorAll('[data-key]')) {
  const key = button.dataset.key;
  const src = id => 'touch:'+key+':'+id;
  button.addEventListener('pointerdown',ev => {
    ev.preventDefault();
    button.setPointerCapture?.(ev.pointerId);
    setKey(key,true,src(ev.pointerId));
  });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) {
    button.addEventListener(event,ev => setKey(key,false,src(ev.pointerId)));
  }
}
window.addEventListener('keydown',onKeyboard,true);
window.addEventListener('keyup',onKeyboard,true);
function onKeyboard(ev) {
  if (!ev.isTrusted || ev.metaKey || ev.ctrlKey || ev.altKey || !nativeKeys.has(ev.code)) return;
  if (['INPUT','TEXTAREA','BUTTON'].includes(ev.target?.tagName) || ev.target?.isContentEditable) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  if (ev.repeat) return;
  const code = keyAliases[ev.code] || ev.code;
  setKey(code,ev.type === 'keydown','keyboard:'+code);
}
function axis(value,minus,plus,name) {
  setKey(minus,value < -.35,name+'-');
  setKey(plus,value > .35,name+'+');
}
function gamepadTick() {
  const gamepad = [...(navigator.getGamepads?.() || [])].find(p => p?.connected);
  $('#gamepad').textContent = gamepad ? '🎮 Controle: '+gamepad.id.slice(0,35) : 'Nenhum controle detectado';
  if (gamepad) {
    for (let i=0; i<padMap.length; i++) {
      const button = gamepad.buttons[i];
      setKey(padMap[i],!!button && (button.pressed || button.value>.4),'pad:btn'+i);
    }
    const axes = gamepad.axes || [];
    axis(axes[0]||0,'KeyF','KeyH','pad:lx');
    axis(axes[1]||0,'KeyT','KeyG','pad:ly');
    axis(axes[2]||0,'KeyJ','KeyL','pad:rx');
    axis(axes[3]||0,'KeyI','KeyK','pad:ry');
  } else release('pad:');
  requestAnimationFrame(gamepadTick);
}
requestAnimationFrame(gamepadTick);
document.addEventListener('visibilitychange',()=>{if(document.hidden) release();});
window.addEventListener('blur',()=>release());
$('#toggle-touch').onclick = () => {
  touch.hidden = !touch.hidden;
  $('#toggle-touch').textContent = touch.hidden ? 'Mostrar controles' : 'Ocultar controles';
};
if (matchMedia('(pointer: coarse)').matches) {
  touch.hidden = false;
  $('#toggle-touch').textContent = 'Ocultar controles';
}
$('#fullscreen').onclick = async () => {
  if (document.fullscreenElement) {await document.exitFullscreen();return;}
  try {
    await $('#stage').requestFullscreen();
    if (screen.orientation?.lock) await screen.orientation.lock('landscape');
  } catch (error) {showState('Tela cheia indisponível neste navegador.','pending');}
};
function selectGame(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!allowed.has(ext)) {
    showState('Formato inválido. Use ISO, CHD, CSO, ISZ ou BIN.','error');
    return;
  }
  if (file.size <= 0) {showState('Arquivo vazio. Selecione um arquivo válido.','error');return;}
  chosenFile = file;
  currentName = file.name;
  showState('Arquivo selecionado: '+file.name,'pending');
  if (moduleInstance) boot(file);
  else message('Arquivo selecionado','O emulador ainda está iniciando.');
}
input.addEventListener('change',()=>{selectGame(input.files?.[0]);input.value='';});
async function boot(file) {
  if (!moduleInstance) return;
  release();
  running = false;
  currentName = file.name;
  message('Iniciando GTA San Andreas','O emulador está lendo o arquivo local. Uma tela preta inicial pode ocorrer.');
  showState('Iniciando '+file.name+'…','pending');
  try {
    moduleInstance.discImageDevice.setFile(file);
    moduleInstance.bootDiscImage(file.name);
    canvas.focus({preventScroll:true});
  } catch (error) {
    log('bootDiscImage: '+error.message);
    showState('Erro ao carregar jogo: '+error.message,'error');
    message('Não foi possível iniciar',error.message);
  }
}
function capabilities() {
  let webgl = false;
  try {webgl=!!document.createElement('canvas').getContext('webgl2');} catch {}
  const supported = typeof WebAssembly === 'object' && typeof SharedArrayBuffer === 'function'
    && !!window.crossOriginIsolated && webgl;
  $('#device').textContent = [
    /iPhone|iPad|iPod/.test(navigator.userAgent)?'iOS / iPadOS':'Navegador de computador ou Android',
    'WebGL2: '+(webgl?'sim':'não'), 'Isolamento: '+(crossOriginIsolated?'sim':'não')
  ].join(' • ');
  return supported;
}
async function initialize() {
  if (!capabilities()) {
    showState('Navegador incompatível ou isolamento não habilitado.','error');
    message('Requisitos não atendidos','Abra por HTTPS no Chrome ou Edge atualizado. É necessário WebGL2, SharedArrayBuffer e COOP/COEP.');
    return;
  }
  showState('Carregando Play!.js…');
  message('Carregando emulador','A compilação WebAssembly pode demorar. O jogo não é baixado pelo site.');
  const base = new URL('/ps2/emulator/',location.origin);
  const probe = await fetch(new URL('Play.js',base),{cache:'no-store'});
  if (!probe.ok) throw new Error('Runtime Play!.js não instalado ('+probe.status+'). Consulte docs/ps2-browser.md.');
  const url = new URL('Play.js',base).href;
  const Play = (await import(url)).default;
  moduleInstance = await Play({
    locateFile: name => new URL(name,base).href,
    mainScriptUrlOrBlob: url,
    print:(...args)=>log(args.join(' ')),
    printErr:(...args)=>log(args.join(' '))
  });
  moduleInstance.discImageDevice = new BrowserDisc(moduleInstance);
  moduleInstance.ccall('initVm','',[],[]);
  started = true;
  showState('Emulador pronto — escolha uma cópia legítima do jogo.','ready');
  message('Pronto para jogar','Clique em “Selecionar jogo no aparelho”. Seu arquivo fica no dispositivo.');
  setInterval(()=>{
    try {$('#fps').textContent=moduleInstance.getFrames()+' FPS';moduleInstance.clearStats();} catch {}
  },1000);
  if (chosenFile) boot(chosenFile);
}
initialize().catch(error=>{
  log(error.stack||error.message||String(error));
  showState('Falha ao iniciar Play!.js: '+error.message,'error');
  message('Emulador indisponível',error.message+' — confira o diagnóstico abaixo.');
});
