'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
test('Creative Minecraft never consumes materials or rejects ore for missing tools',()=>{
 const plugin=fs.readFileSync(path.join(root,'plugins/family-play/FamilyPlay.cs'),'utf8');
 const start=plugin.indexOf('private static void MiningChange('),end=plugin.indexOf('private static void ShowBag(',start);
 const source=plugin.slice(start,end);
 assert.match(source,/if\(cancel\|\|placing/);
 assert.doesNotMatch(source,/cancel=true|b\.Tool|enough|Stone--|Wood--/);
 assert.doesNotMatch(plugin,/if\(!parent&&\(b\.Stone<8/);
 assert.match(plugin,/b\.Sword=tier/);
 assert.match(plugin,/b\.Armor=tier/);
});
test('Native inventory, flying up/down and pressed block actions have stable releases',()=>{
 const js=fs.readFileSync(path.join(root,'public/classicube/touch-controls.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'public/classicube/index.html'),'utf8');
 assert.match(html,/id="familyInventoryBtn"/);
 assert.match(html,/data-key="KeyZ"/);
 assert.match(html,/data-key="KeyQ"/);
 assert.match(html,/data-key="KeyE"/);
 assert.match(html,/classicube\/touch-controls\.js/);
 assert.doesNotMatch(html,/Joystick analógico independente/);
 let handlers=new Map(),keys=[],mouse=[],timeouts=[],intervals=[];
 function target(id,dataset={}){
  const obj={id,dataset,hidden:true,attributes:{},style:{transform:'',setProperty(){}},
   classList:{add(){},remove(){},toggle(){}},
   addEventListener(type,fn){if(!handlers.has(obj))handlers.set(obj,{});handlers.get(obj)[type]=fn},
   dispatchEvent(event){handlers.get(obj)?.[event.type]?.(event);return true},
   setPointerCapture(){},setAttribute(k,v){obj.attributes[k]=v},
   dispatch(type,vals={}){handlers.get(obj)?.[type]?.({pointerId:1,clientX:70,clientY:35,...vals,
    preventDefault(){},stopPropagation(){}})},
   getBoundingClientRect(){return {left:0,top:0,width:140,height:140}},
   querySelectorAll(){return buttons}
  };return obj;
 }
 const pad=target('familyPad'),canvas=target('canvas'),stick=target('familyJoystick'),
  thumb=target('familyStick'),inventory=target('familyInventoryBtn');
 const buttons=[target('jump',{key:'Space'}),target('place',{mouse:'2'}),
  target('break',{mouse:'0'}),target('fly',{key:'KeyZ'}),
  target('rise',{key:'KeyQ'}),target('down',{key:'KeyE'})];
 const nodes={familyPad:pad,canvas,familyJoystick:stick,familyStick:thumb,familyInventoryBtn:inventory};
 const doc={getElementById:id=>nodes[id],addEventListener(){}};
 const window={
  matchMedia:()=>({matches:true}),addEventListener(){},dispatchEvent:e=>{keys.push([e.type,e.code,e.keyCode])},
  setTimeout:fn=>{timeouts.push(fn);return timeouts.length}
 };
 function Event(type,args){this.type=type;Object.assign(this,args)}
 function Mouse(type,args){this.type=type;Object.assign(this,args);mouse.push([type,args.button])}
 const context={window,document:doc,KeyboardEvent:Event,MouseEvent:Mouse,
  setInterval:fn=>{intervals.push(fn);return intervals.length},
  clearInterval:()=>{}};
 vm.runInNewContext(js,context,{timeout:2000});
 assert.equal(pad.hidden,false);
 stick.dispatch('pointerdown',{clientX:70,clientY:0});
 assert.ok(keys.some(x=>x[0]==='keydown'&&x[1]==='KeyW'));
 stick.dispatch('pointerup');
 assert.ok(keys.some(x=>x[0]==='keyup'&&x[1]==='KeyW'));
 buttons[3].dispatch('pointerdown');
 assert.ok(keys.some(x=>x[0]==='keydown'&&x[1]==='KeyZ'&&x[2]===90));
 buttons[4].dispatch('pointerdown');
 buttons[4].dispatch('pointerup');
 assert.ok(keys.some(x=>x[0]==='keydown'&&x[1]==='KeyQ'));
 assert.ok(keys.some(x=>x[0]==='keyup'&&x[1]==='KeyQ'));
 buttons[5].dispatch('pointerdown');
 buttons[5].dispatch('pointerup');
 assert.ok(keys.some(x=>x[0]==='keydown'&&x[1]==='KeyE'));
 assert.ok(keys.some(x=>x[0]==='keyup'&&x[1]==='KeyE'));
 buttons[2].dispatch('pointerdown');
 assert.ok(mouse.some(x=>x[0]==='mousedown'&&x[1]===0));
 intervals[0]();
 buttons[2].dispatch('pointerup');
 assert.ok(mouse.some(x=>x[0]==='mouseup'&&x[1]===0));
 inventory.dispatch('click');
 assert.ok(keys.some(x=>x[0]==='keydown'&&x[1]==='KeyB'&&x[2]===66));
 timeouts.forEach(fn=>fn());
 assert.ok(keys.some(x=>x[0]==='keyup'&&x[1]==='KeyB'));
});
test('Family wardrobe has eight self-hosted Minecraft classic skin images',()=>{
 const {SKINS,makeSkin}=require('../database/family-play.cjs');
 assert.equal(Object.keys(SKINS).length,8);
 for(const slug of Object.keys(SKINS)){
  const png=makeSkin(slug);
  assert.equal(png.readUInt32BE(16),64);assert.equal(png.readUInt32BE(20),32);
 }
});
