const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const helpers = readFileSync(join(__dirname, 'pixel-tools.js'), 'utf8');
const controller = readFileSync(join(__dirname, 'canvas-selection.js'), 'utf8');
const draft = readFileSync(join(__dirname, '../drafts/dark-player-layout/index.html'), 'utf8');
const geometry = draft.split('// BEGIN SELECTION GEOMETRY')[1].split('// END SELECTION GEOMETRY')[0];
const defaults = 'const round=v=>Math.round(v*10)/10,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));';
const context = vm.createContext({});
vm.runInContext(defaults + helpers + geometry, context);
const run = code => JSON.parse(JSON.stringify(vm.runInContext(code, context)));

test('a box drawn in either direction selects enclosed items and leaves the large background', () => {
  assert.deepEqual(run(`(()=>{
    const items=[{id:'background',x:0,y:0,w:800,h:500},{id:'a',x:100,y:100,w:160,h:70},{id:'b',x:120,y:200,w:80,h:20},{id:'hidden',x:100,y:100,w:20,h:20,hidden:true}];
    const a={x:80,y:80},b={x:280,y:180};return [itemIdsInSelection(items,boxBetween(a,b)),itemIdsInSelection(items,boxBetween(b,a))];
  })()`), [['a'], ['a']]);
});
test('picture selections clip at page edges and map to the source picture', () => {
  assert.deepEqual(run('clippedArea({x:-10.2,y:40.5,w:130,h:100},{width:100,height:80})'), {x:0,y:40,w:100,h:40});
  assert.deepEqual(run('sourcePixelArea({x:60,y:50,w:80,h:70},{x:20,y:10,w:200,h:100},800,400)'), {x:160,y:160,w:320,h:240});
});
test('lifting a red area from black leaves black and keeps pixels outside the selection', () => {
  assert.deepEqual(run(`(()=>{
    const data=new Uint8ClampedArray(20*20*4);for(let i=3;i<data.length;i+=4)data[i]=255;
    for(let y=5;y<15;y++)for(let x=5;x<15;x++)data[(y*20+x)*4]=255;
    data[0]=73;fillPixelArea(data,20,20,{x:5,y:5,w:10,h:10});
    return [Array.from(data.slice((10*20+10)*4,(10*20+10)*4+4)),Array.from(data.slice(0,4))];
  })()`), [[0,0,0,255],[73,0,0,255]]);
});
test('lifting from a transparent picture keeps the empty spot transparent', () => {
  assert.deepEqual(run(`(()=>{const data=new Uint8ClampedArray(10*10*4);data.fill(255,((4*10)+4)*4,((4*10)+4)*4+4);fillPixelArea(data,10,10,{x:4,y:4,w:1,h:1});return Array.from(data.slice(((4*10)+4)*4,((4*10)+4)*4+4));})()`), [0,0,0,0]);
});
test('a full picture selection fills with the page color when no outside pixels remain', () => {
  assert.deepEqual(run(`(()=>{const data=new Uint8ClampedArray(2*2*4).fill(255);fillPixelArea(data,2,2,{x:0,y:0,w:2,h:2},[12,24,36,255]);return Array.from(data);})()`), Array(4).fill([12,24,36,255]).flat());
});
test('a simple gradient continues through the filled area', () => {
  assert.equal(run(`(()=>{
    const data=new Uint8ClampedArray(20*20*4),before=new Uint8ClampedArray(data.length);
    for(let y=0;y<20;y++)for(let x=0;x<20;x++){const i=(y*20+x)*4;data[i]=x*10;data[i+1]=y*10;data[i+3]=255;}before.set(data);
    for(let y=5;y<15;y++)for(let x=5;x<15;x++)data.fill(255,(y*20+x)*4,(y*20+x)*4+4);
    fillPixelArea(data,20,20,{x:5,y:5,w:10,h:10});return data.every((v,i)=>v===before[i]);
  })()`), true);
});

function harness(picturePage = false) {
  const stageListeners = new Map(), documentListeners = new Map(), undo = [];
  const node = () => ({hidden:true,style:{},dataset:{},className:'',setAttribute(){},append(){},remove(){},focus(){},contains(){return false;},querySelectorAll(){return [];}});
  const nodes = new Map();
  const get = id => {if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
  const stage = get('stage');let captured = null;
  stage.addEventListener=(type,fn)=>stageListeners.set(type,fn);
  stage.setPointerCapture=id=>{captured=id;};stage.hasPointerCapture=id=>captured===id;stage.releasePointerCapture=()=>{captured=null;};
  const start = {version:1,canvas:{width:800,height:500,background:'#000000',picturePage},items:picturePage?[{id:'base',name:'Base',kind:'image',src:'data:image/png;base64,AAAA',x:0,y:0,w:800,h:500,imageBase:true}]:[{id:'background',kind:'shape',x:0,y:0,w:800,h:500},{id:'a',kind:'label',x:100,y:100,w:100,h:40},{id:'b',kind:'label',x:100,y:170,w:100,h:40}]};
  const sandbox = vm.createContext({
    state:structuredClone(start),selected:new Set(),editing:true,stage,canvasTextTarget:()=>false,
    pictureChoice:{open:false},pictureDropBusy:false,$:get,
    document:{addEventListener:(type,fn)=>documentListeners.set(type,fn),createElement:node},
    copy:value=>JSON.parse(JSON.stringify(value)),notify(){},render(){},renderPhone(){},renderLayers(){},renderInspector(){},renderNativeSelection(){},refreshSelection(){},styleItem(){},
    phonePoint:event=>({x:event.clientX,y:event.clientY}),drawBox:gesture=>{gesture.box=node();},
    navigator:{clipboard:{writeText:async()=>{}}},setTimeout,crypto:{randomUUID:()=>String(Math.random())},
    safePictureSource:src=>/^data:image\/png;base64,/.test(src),
  });
  sandbox.selectedItems=()=>sandbox.state.items.filter(item=>sandbox.selected.has(item.id)&&!item.hidden);
  sandbox.remember=before=>undo.push(before);
  sandbox.change=fn=>{undo.push(JSON.stringify(sandbox.state));fn();};
  sandbox.deleteSelected=()=>sandbox.change(()=>{sandbox.state.items.forEach(item=>{if(sandbox.selected.has(item.id))item.hidden=true;});sandbox.selected.clear();});
  vm.runInContext(defaults + geometry + helpers + controller, sandbox);
  const read=code=>JSON.parse(JSON.stringify(vm.runInContext(code,sandbox)));
  const event=(x,y,options={})=>({button:0,pointerId:1,clientX:x,clientY:y,target:{closest:()=>null},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...options});
  return {sandbox,start,undo,read,event,send:(type,event)=>stageListeners.get(type)(event),key:event=>documentListeners.get('keydown')(event)};
}
test('press and drag draws a box right away without changing the picture or undo history', async () => {
  const h=harness(true);h.send('pointerdown',h.event(80,80));
  assert.equal(h.read('Boolean(canvasGesture.box)'),true);
  h.send('pointermove',h.event(280,180));
  assert.deepEqual(h.read('regionSelection.box'),{x:80,y:80,w:200,h:100});
  assert.deepEqual(JSON.parse(JSON.stringify(h.sandbox.state)),h.start);
  assert.equal(h.undo.length,0);
  h.send('pointercancel',h.event(280,180));
  assert.equal(h.read('regionSelection'),null);
});
test('an HTML group moves from the gap inside its box, with one undo step', async () => {
  const h=harness();h.send('pointerdown',h.event(90,90));h.send('pointermove',h.event(210,220));await h.send('pointerup',h.event(210,220));
  assert.deepEqual([...h.sandbox.selected],['a','b']);
  h.send('pointerdown',h.event(150,155));h.send('pointermove',h.event(250,255));await h.send('pointerup',h.event(250,255));
  assert.deepEqual(h.read('state.items.map(({id,x,y})=>({id,x,y}))'),[{id:'background',x:0,y:0},{id:'a',x:200,y:200},{id:'b',x:200,y:270}]);
  assert.equal(h.undo.length,1);assert.deepEqual(JSON.parse(h.undo[0]),h.start);
});
test('Escape stops a picture move while its crop is still being read', async () => {
  const h=harness(true);h.sandbox.pendingPlan=new Promise(resolve=>{h.sandbox.finishPlan=resolve;});
  vm.runInContext('regionSelection=rememberRegion({x:80,y:80,w:200,h:100});makeRegionPlan=()=>pendingPlan;',h.sandbox);
  h.send('pointerdown',h.event(120,120));h.send('pointermove',h.event(320,220));
  h.key(h.event(0,0,{key:'Escape'}));h.sandbox.finishPlan({entry:{id:'piece',kind:'image',x:80,y:80,w:200,h:100},patches:[]});
  await h.sandbox.pendingPlan;
  assert.deepEqual(JSON.parse(JSON.stringify(h.sandbox.state)),h.start);assert.equal(h.undo.length,0);
});
test('a quick picture move waits for the crop and then saves one filled move', async () => {
  const h=harness(true);h.sandbox.pendingPlan=new Promise(resolve=>{h.sandbox.finishPlan=resolve;});
  vm.runInContext('regionSelection=rememberRegion({x:80,y:80,w:200,h:100});makeRegionPlan=()=>pendingPlan;',h.sandbox);
  h.send('pointerdown',h.event(120,120));h.send('pointermove',h.event(320,220));
  const finished=h.send('pointerup',h.event(320,220));h.send('lostpointercapture',h.event(320,220));
  h.sandbox.finishPlan({entry:{id:'piece',kind:'image',x:80,y:80,w:200,h:100},patches:[{id:'base',src:'filled'}]});await finished;
  assert.equal(h.sandbox.state.items[0].src,'filled');assert.deepEqual(h.read('state.items[1]'),{id:'piece',kind:'image',x:280,y:180,w:200,h:100});
  assert.equal(h.undo.length,1);assert.deepEqual(JSON.parse(h.undo[0]),h.start);
});
test('cut fills the old spot and waits for paste before adding the new item', async () => {
  const h=harness(true);
  vm.runInContext(`regionSelection=rememberRegion({x:80,y:80,w:200,h:100});makeRegionPlan=async()=>({entry:{id:'piece',kind:'image',src:'data:image/png;base64,AAAA',x:80,y:80,w:200,h:100,pictureFragment:true},patches:[{id:'base',src:'filled'}]});`,h.sandbox);
  await vm.runInContext('copyCanvasSelection(true)',h.sandbox);
  assert.equal(h.sandbox.state.items.length,1);assert.equal(h.sandbox.state.items[0].src,'filled');
  assert.equal(h.read('canvasClipboard.cut'),true);assert.equal(h.read('regionSelection'),null);assert.equal(h.undo.length,1);
  vm.runInContext('pasteCanvasClipboard()',h.sandbox);
  assert.deepEqual(h.read('state.items[1].x'),80);assert.equal(h.sandbox.state.items.length,2);assert.equal(h.undo.length,2);
});
test('adding a picture over the selected area makes the old crop stale', () => {
  const h=harness(true);
  vm.runInContext(`regionSelection=rememberRegion({x:80,y:80,w:200,h:100});state.items.push({id:'new',kind:'image',x:100,y:100,w:10,h:10});`,h.sandbox);
  assert.equal(h.read('regionIsCurrent(regionSelection)'),false);
});
test('the old drag handler cannot start while a cut is still being read', () => {
  const h=harness(true);vm.runInContext('canvasEditBusy=true',h.sandbox);
  const event=h.event(100,100);h.send('pointerdown',event);
  assert.equal(event.stopped,true);assert.equal(h.read('canvasGesture'),null);
});
test('paste keeps cut positions, offsets copies, and never creates a second page base', () => {
  const h=harness(true);
  vm.runInContext(`pasteCanvasClipboard({cut:true,items:[{id:'old',kind:'image',x:50,y:60,w:100,h:80,imageBase:true}]});pasteCanvasClipboard();`,h.sandbox);
  assert.deepEqual(h.read('state.items.slice(1).map(({x,y,imageBase})=>({x,y,imageBase}))'),[{x:50,y:60},{x:74,y:84}]);
  assert.equal(h.undo.length,2);
});
test('new page tools stay in all saved standalone editors', () => {
  for(const entry of readdirSync(join(__dirname,'../drafts'),{withFileTypes:true}).filter(entry=>entry.isDirectory())){
    const html=readFileSync(join(__dirname,'../drafts',entry.name,'index.html'),'utf8');
    assert.equal(html.split('// BEGIN CANVAS EDITOR\n')[1].split('// END CANVAS EDITOR')[0].trimEnd(),(helpers+'\n'+controller).trimEnd());
    assert.equal(html.split('id="canvas-edit-menu"').length-1,1);
  }
});
