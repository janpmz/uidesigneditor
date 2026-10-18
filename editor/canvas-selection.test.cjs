const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const helpers = readFileSync(join(__dirname, 'pixel-tools.js'), 'utf8');
const shapes = readFileSync(join(__dirname, 'annotation-shapes.js'), 'utf8');
const fitContent = readFileSync(join(__dirname, 'fit-content.js'), 'utf8');
const controller = readFileSync(join(__dirname, 'canvas-selection.js'), 'utf8');
const textEditor = readFileSync(join(__dirname, 'text-edit.js'), 'utf8');
const imageEditor = readFileSync(join(__dirname, 'image-edit.js'), 'utf8');
const draft = readFileSync(join(__dirname, '../index.html'), 'utf8');
const geometry = draft.split('// BEGIN SELECTION GEOMETRY')[1].split('// END SELECTION GEOMETRY')[0];
const scaling = draft.split('// BEGIN ITEM SCALE')[1].split('// END ITEM SCALE')[0];
const defaults = 'const round=v=>Math.round(v*10)/10,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));';
const context = vm.createContext({});
vm.runInContext(defaults + helpers + geometry, context);
const run = code => JSON.parse(JSON.stringify(vm.runInContext(code, context)));

test('a box drawn in either direction selects every item it touches, including larger items', () => {
  assert.deepEqual(run(`(()=>{
    const items=[{id:'background',x:0,y:0,w:800,h:500},{id:'a',x:100,y:100,w:160,h:70},{id:'b',x:120,y:200,w:80,h:20},{id:'hidden',x:100,y:100,w:20,h:20,hidden:true}];
    const a={x:80,y:80},b={x:110,y:120};return [itemIdsInSelection(items,boxBetween(a,b)),itemIdsInSelection(items,boxBetween(b,a))];
  })()`), [['background','a'], ['background','a']]);
});
test('touching an edge or corner selects an item, while a gap does not', () => {
  assert.deepEqual(run(`itemIdsInSelection([
    {id:'edge',x:30,y:100,w:80,h:24},
    {id:'corner',x:30,y:120,w:80,h:24},
    {id:'apart',x:30.1,y:100,w:80,h:24},
    {id:'hidden',x:20,y:90,w:80,h:24,hidden:true}
  ],{x:10,y:80,w:20,h:40})`), ['edge','corner']);
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

function harness(picturePage = false, mobile = false) {
  const stageListeners = new Map(), layerListeners = new Map(), documentListeners = new Map(), undo = [];
  const node = () => ({hidden:true,style:{setProperty(){}},dataset:{},className:'',classList:{add(){},remove(){}},children:[],attributes:{},offsetWidth:140,offsetHeight:150,setAttribute(key,value){this.attributes[key]=value;},append(...children){this.children.push(...children);},remove(){},focus(){},contains(){return false;},querySelector(){return null;},querySelectorAll(){return [];}});
  const nodes = new Map();
  const get = id => {if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
  const stage = get('stage');let captured = null;
  get('layers').addEventListener=(type,fn)=>layerListeners.set(type,fn);
  stage.addEventListener=(type,fn)=>stageListeners.set(type,[...(stageListeners.get(type)||[]),fn]);
  stage.getBoundingClientRect=()=>({left:0,top:0,width:390,height:844});
  stage.setPointerCapture=id=>{captured=id;};stage.hasPointerCapture=id=>captured===id;stage.releasePointerCapture=()=>{captured=null;};
  const start = {version:1,canvas:{width:800,height:500,background:'#000000',picturePage},items:picturePage?[{id:'base',name:'Base',kind:'image',src:'data:image/png;base64,AAAA',x:0,y:0,w:800,h:500,imageBase:true}]:[{id:'background',kind:'shape',x:0,y:0,w:800,h:500},{id:'a',kind:'label',x:100,y:100,w:100,h:40},{id:'b',kind:'label',x:100,y:170,w:100,h:40}]};
  const sandbox = vm.createContext({
    state:structuredClone(start),selected:new Set(),editing:true,stage,canvasTextTarget:()=>false,scale:1,compactViewport:{matches:mobile},drag:null,
    pictureChoice:{open:false},pictureDropBusy:false,$:get,
    document:{documentElement:{clientWidth:1200,clientHeight:800},addEventListener:(type,fn)=>documentListeners.set(type,fn),createElement:node},
    window:{innerWidth:1200,innerHeight:800,addEventListener(){}},
    item:(id,name,kind,x,y,w,h,extra)=>({id,name,kind,x,y,w,h,...extra}),
    copy:value=>JSON.parse(JSON.stringify(value)),notify(){},render(){},renderPhone(){},renderLayers(){},renderInspector(){},renderNativeSelection(){},refreshSelection(){},styleItem(){},
    phonePoint:event=>({x:event.clientX,y:event.clientY}),drawBox:gesture=>{gesture.box=node();},
    navigator:{clipboard:{writeText:async()=>{}}},setTimeout,crypto:{randomUUID:()=>String(Math.random())},
    safePictureSource:src=>/^data:image\/(png|gif);base64,/.test(src),
    pictureToEdit:()=>null,
  });
  sandbox.selectedItems=()=>sandbox.state.items.filter(item=>sandbox.selected.has(item.id)&&!item.hidden);
  sandbox.remember=before=>undo.push(before);
  sandbox.change=fn=>{undo.push(JSON.stringify(sandbox.state));fn();};
  sandbox.deleteSelected=()=>sandbox.change(()=>{sandbox.state.items.forEach(item=>{if(sandbox.selected.has(item.id))item.hidden=true;});sandbox.selected.clear();});
  const view=mobile?readFileSync(join(__dirname,'canvas-view.js'),'utf8'):'';
  vm.runInContext(defaults + geometry + scaling + shapes + helpers + fitContent + view + controller + textEditor, sandbox);
  const read=code=>JSON.parse(JSON.stringify(vm.runInContext(code,sandbox)));
  const event=(x,y,options={})=>({button:0,pointerId:1,clientX:x,clientY:y,target:{closest:()=>null},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...options});
  return {sandbox,start,undo,read,event,get,send:(type,event)=>{for(const fn of stageListeners.get(type)||[]){fn(event);if(event.stopped)break;}},list:(type,event)=>layerListeners.get(type)(event),key:event=>documentListeners.get('keydown')(event)};
}
function mockPictureCrop(h){
  h.sandbox.makeRegionPlan=async region=>({
    entry:{id:'piece',name:'Picture selection',kind:'image',src:'data:image/png;base64,BBBB',...region.box,pictureFragment:true},
    patches:[{id:'base',src:'filled'}],
  });
}
test('a phone tap selects an item, the next one-finger drag moves it, and empty canvas drags pan',()=>{
  for(const kind of ['label','image','video','shape']){
    const h=harness(false,true);h.sandbox.state.items=[{id:'a',kind,x:100,y:100,w:100,h:40}];
    h.read('renderCanvasView();true');const view=h.read('canvasView'),zoom=h.read('scale');
    const target={closest:selector=>selector==='.item,.selection-overlay'?{dataset:{id:'a'}}:null};
    const touch=(x,y,extra={})=>h.event(x,y,{pointerType:'touch',...extra});
    h.send('pointerdown',touch(110,110,{target}));h.send('pointerup',touch(110,110));
    assert.deepEqual([...h.sandbox.selected],['a']);assert.equal(h.read('canvasGesture'),null);
    h.send('pointerdown',touch(110,110,{target}));assert.equal(h.read('canvasGesture.type'),'move');
    h.send('pointermove',touch(130,140));h.send('pointerup',touch(130,140));
    assert.deepEqual(h.read('state.items.map(entry=>[entry.x,entry.y])'),[[120,130]]);
    assert.equal(h.undo.length,1);assert.deepEqual(h.read('canvasView'),view);
    h.send('pointerdown',touch(20,20));h.send('pointermove',touch(70,80));h.send('pointerup',touch(70,80));
    assert.equal(h.read('canvasView.x'),view.x+50);assert.equal(h.read('canvasView.y'),view.y+60);
    assert.equal(h.read('scale'),zoom);assert.deepEqual([...h.sandbox.selected],['a']);assert.equal(h.undo.length,1);
    assert.deepEqual(h.read('state.items.map(entry=>[entry.x,entry.y])'),[[120,130]]);
  }
});
test('one-finger panning over the phone page picture keeps it fixed and the rectangle tool still selects an area',()=>{
  const h=harness(true,true);h.read('renderCanvasView();true');const before=h.read('state');
  const target={closest:selector=>selector==='.item,.selection-overlay'?{dataset:{id:'base'}}:null};
  const touch=(x,y,extra={})=>h.event(x,y,{pointerType:'touch',...extra});
  h.send('pointerdown',touch(100,100,{target}));h.send('pointermove',touch(140,150));h.send('pointerup',touch(140,150));
  assert.deepEqual(h.read('state'),before);assert.equal(h.read('canvasGesture'),null);assert.equal(h.read('regionSelection'),null);
  h.get('select-rectangle').onclick();h.send('pointerdown',touch(100,100,{target}));
  assert.equal(h.read('canvasGesture.type'),'box');h.send('pointermove',touch(140,150));h.send('pointerup',touch(140,150));
  assert.deepEqual(h.read('regionSelection.box'),{x:100,y:100,w:40,h:50});assert.deepEqual(h.read('state'),before);
});
test('clicks in editable text leave browser selection alone and cannot start a canvas move',()=>{
  const h=harness(),event=h.event(110,110,{target:{closest:selector=>selector.includes('contenteditable')?{}:null}});
  h.sandbox.selected.add('a');h.send('pointerdown',event);
  assert.equal(event.prevented,undefined);assert.equal(event.stopped,true);assert.equal(h.read('canvasGesture'),null);
  assert.deepEqual([...h.sandbox.selected],['a']);assert.equal(h.undo.length,0);
});
test('clicking a text item keeps its page node in place for the next click',async()=>{
  const h=harness();let redraws=0;h.sandbox.render=()=>redraws++;
  const target={closest:selector=>selector==='.item,.selection-overlay'?{dataset:{id:'a'}}:null};
  h.send('pointerdown',h.event(110,110,{target}));await h.send('pointerup',h.event(110,110));
  assert.deepEqual([...h.sandbox.selected],['a']);assert.equal(redraws,0);assert.equal(h.undo.length,0);
});
test('the rectangle tool draws over a selected shape, then lets the group move',async()=>{
  const h=harness();
  h.sandbox.state.items=[{id:'a',kind:'shape',shape:'rectangle',x:100,y:100,w:100,h:40},{id:'b',kind:'label',x:100,y:170,w:100,h:40}];
  h.sandbox.selected.add('a');const before=structuredClone(h.sandbox.state);
  const target={closest:selector=>selector==='.item,.selection-overlay'?{dataset:{id:'a'}}:null};
  h.get('select-rectangle').onclick();
  assert.equal(h.sandbox.stage.dataset.selectTool,'rectangle');
  h.send('pointerdown',h.event(110,110,{target}));
  assert.equal(h.read('canvasGesture.type'),'box');
  h.send('pointermove',h.event(190,200));await h.send('pointerup',h.event(190,200));
  assert.deepEqual([...h.sandbox.selected],['a','b']);assert.deepEqual(h.read('state'),before);
  assert.equal(h.undo.length,0);assert.equal(h.sandbox.stage.dataset.selectTool,'');
  h.send('pointerdown',h.event(110,110,{target}));
  assert.equal(h.read('canvasGesture.type'),'move');
  h.send('pointermove',h.event(130,140));await h.send('pointerup',h.event(130,140));
  assert.deepEqual(h.read('state.items.map(entry=>[entry.x,entry.y])'),[[120,130],[120,200]]);
  assert.equal(h.undo.length,1);
});
test('Escape cancels the rectangle tool before or during a draw and keeps the old selection',()=>{
  for(const drawing of [false,true]){
    const h=harness();h.sandbox.selected.add('a');
    h.get('select-rectangle').onclick();
    if(drawing){h.send('pointerdown',h.event(90,90));h.send('pointermove',h.event(190,200));}
    h.key(h.event(0,0,{key:'Escape'}));
    assert.equal(h.sandbox.stage.dataset.selectTool,'');assert.equal(h.read('canvasGesture'),null);
    assert.deepEqual([...h.sandbox.selected],['a']);assert.deepEqual(h.read('state'),h.start);assert.equal(h.undo.length,0);
  }
});
test('the rectangle tool draws a fresh area without making an item',async()=>{
  const h=harness(true);mockPictureCrop(h);vm.runInContext('regionSelection=rememberRegion({x:100,y:100,w:200,h:100});',h.sandbox);
  h.get('select-rectangle').onclick();h.send('pointerdown',h.event(120,120));
  assert.equal(h.read('canvasGesture.type'),'box');assert.equal(h.read('canvasGesture.pixels'),true);
  h.send('pointermove',h.event(160,150));await h.send('pointerup',h.event(160,150));
  assert.deepEqual(h.read('regionSelection.box'),{x:120,y:120,w:40,h:30});assert.equal(h.sandbox.selected.size,0);
  assert.deepEqual(h.read('state'),h.start);assert.equal(h.undo.length,0);
});
test('choosing the rectangle tool closes the small-screen tools panel',()=>{
  const h=harness(),panel=h.get('editor-tools');panel.open=true;panel.close=()=>{panel.open=false;};
  h.get('select-rectangle').onclick();
  assert.equal(panel.open,false);assert.equal(h.sandbox.stage.dataset.selectTool,'rectangle');
  h.get('select-rectangle').onclick();assert.equal(h.sandbox.stage.dataset.selectTool,'');
});
test('front and back move one item by one place in one Undo step and keep its settings',()=>{
  for(const [position,expected] of [['front',['background','a','c','b','d']],['back',['background','b','a','c','d']]]){
    const h=harness();h.sandbox.state.items.push({id:'c',kind:'shape'},{id:'d',kind:'shape'});
    const before=structuredClone(h.sandbox.state);h.sandbox.selected.add('b');
    h.get('canvas-menu-bring-'+position).onclick();
    assert.deepEqual(h.read('state.items.map(entry=>entry.id)'),expected);
    assert.deepEqual(h.read('state.items.find(entry=>entry.id==="b")'),before.items[2]);
    assert.deepEqual([...h.sandbox.selected],['b']);assert.equal(h.undo.length,1);
    h.sandbox.state=JSON.parse(h.undo.pop());assert.deepEqual(h.read('state'),before);
  }
});
test('dragging an arrow end uses one Undo step and keeps the other end fixed',async()=>{
  const h=harness(),entry={id:'arrow',kind:'shape',shape:'arrow',x:100,y:200,w:180,h:40,color:'#ef4444',strokeWidth:4};
  h.sandbox.state.items.push(entry);h.sandbox.selected.add(entry.id);
  const before=structuredClone(h.sandbox.state),handle={dataset:{arrowEnd:'end'}},overlay={dataset:{id:entry.id}};
  const target={closest:selector=>selector==='[data-arrow-end]'?handle:selector==='.item,.selection-overlay'?overlay:null};
  h.send('pointerdown',h.event(268,220,{target}));
  assert.equal(h.read('canvasGesture.type'),'arrow-end');
  h.send('pointermove',h.event(50,100));h.send('pointermove',h.event(20,80));
  await h.send('pointerup',h.event(20,80));
  const points=h.read('arrowPoints(state.items.find(item=>item.id==="arrow"))'),after=h.sandbox.state.items.at(-1);
  assert.deepEqual({x:after.x+points.start.x,y:after.y+points.start.y},{x:112,y:220});
  assert.deepEqual({x:after.x+points.end.x,y:after.y+points.end.y},{x:20,y:80});
  assert.equal(h.undo.length,1);assert.deepEqual(JSON.parse(h.undo[0]),before);
});
test('rectangles, filled boxes, buttons and text boxes move on the first drag on either kind of page',async()=>{
  for(const picture of [false,true])for(const look of [{kind:'shape',shape:'rectangle',background:'transparent'},{kind:'shape',background:'transparent'},{kind:'shape',background:'#242424'},{kind:'button',background:'#c8b6ff'},{kind:'textbox',background:'#161616'}]){
    const h=harness(picture),entry={id:'rectangle',...look,x:100,y:200,w:180,h:100,borderWidth:3,borderColor:'#ef4444'};
    h.sandbox.state.items.push(entry);
    const before=structuredClone(h.sandbox.state),target={closest:selector=>selector==='.item,.selection-overlay'?{dataset:{id:entry.id}}:null};
    h.send('pointerdown',h.event(150,240,{target}));
    assert.equal(h.read('canvasGesture.type'),'move');assert.deepEqual([...h.sandbox.selected],[entry.id]);
    h.send('pointermove',h.event(200,260));h.send('pointermove',h.event(230,290));await h.send('pointerup',h.event(230,290));
    assert.deepEqual([entry.x,entry.y,entry.w,entry.h],[180,250,180,100]);
    assert.deepEqual(h.read('state.items.slice(0,-1)'),before.items.slice(0,-1));
    assert.equal(h.undo.length,1);assert.deepEqual(JSON.parse(h.undo[0]),before);
  }
});
test('clicking a rectangle selects it without adding an Undo step, and Shift-click still removes it',async()=>{
  const h=harness(),entry={id:'rectangle',kind:'shape',shape:'rectangle',x:100,y:200,w:180,h:100};h.sandbox.state.items.push(entry);
  const target={closest:selector=>selector==='.item,.selection-overlay'?{dataset:{id:entry.id}}:null};
  h.send('pointerdown',h.event(150,240,{target}));await h.send('pointerup',h.event(150,240));
  assert.deepEqual([...h.sandbox.selected],[entry.id]);assert.equal(h.undo.length,0);
  h.send('pointerdown',h.event(150,240,{target,shiftKey:true}));await h.send('pointerup',h.event(150,240,{shiftKey:true}));
  assert.deepEqual([...h.sandbox.selected],[]);assert.equal(h.undo.length,0);
});
test('a rectangle can be picked up while another item covers the same area',async()=>{
  const h=harness(),entry={id:'rectangle',kind:'shape',shape:'rectangle',x:100,y:110,w:80,h:20};h.sandbox.state.items.push(entry);h.sandbox.selected.add('a');
  const target={closest:selector=>selector==='.item,.selection-overlay'?{dataset:{id:entry.id}}:null};
  h.send('pointerdown',h.event(140,120,{target}));h.send('pointermove',h.event(160,140));await h.send('pointerup',h.event(160,140));
  assert.deepEqual([...h.sandbox.selected],[entry.id]);assert.deepEqual([entry.x,entry.y],[120,130]);
  assert.deepEqual([h.sandbox.state.items[1].x,h.sandbox.state.items[1].y],[100,100]);
});
test('box, text, tab and icon grips resize freely, keep the contents at the same size and support Undo and Escape',async()=>{
  for(const kind of ['shape','button','textbox','label','reading','icon','tab'])for(const side of ['n','e','s','w']){
    const h=harness(),entry={id:'rectangle',kind,x:100,y:200,w:180,h:100,borderWidth:3,radius:12,fontSize:18,iconSize:22,text:'Keep this text',contentScale:1};
    h.sandbox.state.items.push(entry);h.sandbox.selected.add(entry.id);
    const before=structuredClone(h.sandbox.state),handle={dataset:{rectangleResize:side}},overlay={dataset:{id:entry.id}};
    const target={closest:selector=>selector==='[data-rectangle-resize]'?handle:selector==='.item,.selection-overlay'?overlay:null};
    h.send('pointerdown',h.event(100,200,{target}));assert.equal(h.read('canvasGesture.type'),'rectangle-resize');
    h.send('pointermove',h.event(120,230));h.send('pointermove',h.event(140,250));await h.send('pointerup',h.event(140,250));
    assert.equal(entry.borderWidth,3);assert.equal(h.undo.length,1);assert.deepEqual(JSON.parse(h.undo[0]),before);
    assert.deepEqual([entry.radius,entry.fontSize,entry.iconSize,entry.text,entry.contentScale],[12,18,22,'Keep this text',1]);
    assert.deepEqual([entry.x,entry.y,entry.w,entry.h],[side.includes('w')?140:100,side.includes('n')?250:200,side.includes('w')?140:side.includes('e')?220:180,side.includes('n')?50:side.includes('s')?150:100]);
    if(['e','w'].includes(side))assert.equal(entry.h,100);
    if(['n','s'].includes(side))assert.equal(entry.w,180);
    const saved=structuredClone(h.sandbox.state);
    h.send('pointerdown',h.event(140,250,{target}));h.send('pointermove',h.event(180,280));h.key(h.event(0,0,{key:'Escape'}));
    assert.deepEqual(h.read('state'),saved);assert.equal(h.undo.length,1);
  }
});
test('the bottom-right corner scales text, tabs, icons, images, buttons and boxes in one Undo step',async()=>{
  for(const kind of ['label','reading','shape','button','textbox','icon','image','tab']){
    const h=harness(),entry={id:'text',kind,x:100,y:200,w:180,h:100,fontSize:18,iconSize:20,borderWidth:2,radius:12,contentScale:1,icon:'play-outline',text:kind==='icon'?'':'A longer line of text',...(kind==='image'?{src:'data:image/png;base64,AAAA'}:{})};
    h.sandbox.state.items.push(entry);h.sandbox.selected.add(entry.id);
    const before=structuredClone(h.sandbox.state),target={closest:selector=>selector==='.resize-handle'?{}:selector==='.item,.selection-overlay'?{dataset:{id:entry.id}}:null};
    h.send('pointerdown',h.event(280,300,{target}));assert.equal(h.read('canvasGesture.type'),'resize');
    h.send('pointermove',h.event(325,325));h.send('pointermove',h.event(370,350));await h.send('pointerup',h.event(370,350));
    assert.deepEqual([entry.x,entry.y,entry.w,entry.h,entry.fontSize,entry.contentScale],[100,200,270,150,27,1.5]);
    assert.deepEqual([entry.iconSize,entry.borderWidth,entry.radius],[30,3,18]);
    if(kind==='image')assert.equal(entry.src,'data:image/png;base64,AAAA');
    assert.equal(h.undo.length,1);assert.deepEqual(JSON.parse(h.undo[0]),before);
    const saved=structuredClone(h.sandbox.state);
    h.send('pointerdown',h.event(370,350,{target}));h.send('pointermove',h.event(460,400));h.key(h.event(0,0,{key:'Escape'}));
    assert.deepEqual(h.read('state'),saved);assert.equal(h.undo.length,1);
  }
});
test('added pictures and picture pieces resize on every side, keep their source, and support Undo and Escape',async()=>{
  const expected={n:[100,230,180,70],e:[100,200,200,100],s:[100,200,180,130],w:[120,200,160,100]};
  for(const picturePage of [false,true])for(const pictureFragment of [false,true])for(const side of ['n','e','s','w']){
    const h=harness(picturePage),entry={id:'picture',kind:'image',name:'Picture',x:100,y:200,w:180,h:100,src:'data:image/png;base64,AAAA',pictureFragment,opacity:.8,imageContents:{version:1,canvas:{width:360,height:200},items:[]}};
    h.sandbox.state.items.push(entry);h.sandbox.selected.add(entry.id);
    const before=structuredClone(h.sandbox.state),handle={dataset:{rectangleResize:side}};
    const target={closest:selector=>selector==='[data-rectangle-resize]'?handle:selector==='.item,.selection-overlay'?{dataset:{id:entry.id}}:null};
    h.send('pointerdown',h.event(100,200,{target}));assert.equal(h.read('canvasGesture.type'),'rectangle-resize');
    h.send('pointermove',h.event(110,210));h.send('pointermove',h.event(120,230));await h.send('pointerup',h.event(120,230));
    const [x,y,w,height]=expected[side];
    assert.deepEqual(entry,{...before.items.at(-1),x,y,w,h:height});
    assert.deepEqual(h.read('state.items.slice(0,-1)'),before.items.slice(0,-1));
    assert.equal(h.undo.length,1);assert.deepEqual(JSON.parse(h.undo[0]),before);
    const saved=structuredClone(h.sandbox.state);
    h.send('pointerdown',h.event(120,230,{target}));h.send('pointermove',h.event(140,260));h.key(h.event(0,0,{key:'Escape'}));
    assert.deepEqual(h.read('state'),saved);assert.equal(h.undo.length,1);
    h.sandbox.state=JSON.parse(h.undo.pop());assert.deepEqual(h.read('state'),before);
  }
});
test('the main image stays fixed and shows no resize handles when clicked or selected in the list',async()=>{
  const h=harness(true),target={closest:selector=>selector==='.item,.selection-overlay'?{dataset:{id:'base'}}:null};
  const nativeSelection=draft.slice(draft.indexOf('function renderNativeSelection()'),draft.indexOf('function fit()',draft.indexOf('function renderNativeSelection()')));
  vm.runInContext(nativeSelection,h.sandbox);
  h.sandbox.render=()=>vm.runInContext('renderSelection()',h.sandbox);
  h.send('pointerdown',h.event(100,100,{target}));await h.send('pointerup',h.event(100,100));
  assert.deepEqual([...h.sandbox.selected],[]);assert.equal(h.read('regionSelection'),null);
  assert.equal(h.get('phone').children.length,0);
  h.sandbox.selected.add('base');vm.runInContext('renderSelection()',h.sandbox);
  assert.equal(h.get('phone').children.length,0);
  assert.deepEqual(h.read('state'),h.start);assert.equal(h.undo.length,0);
});
test('GIF pages select, move and resize the whole GIF, preserving it through Undo',async()=>{
  const h=harness(true),entry=h.sandbox.state.items[0];entry.src='data:image/gif;base64,R0lGODlh';
  const target={closest:selector=>selector==='.item,.selection-overlay'?{dataset:{id:entry.id}}:null};
  assert.equal(vm.runInContext('isPagePicture(state.items[0])',h.sandbox),false);
  assert.deepEqual(h.read('regionSources({x:0,y:0,w:800,h:500})'),[]);
  h.send('pointerdown',h.event(20,20,{target}));assert.equal(h.read('canvasGesture.pixels'),false);
  await h.send('pointerup',h.event(20,20));assert.deepEqual([...h.sandbox.selected],['base']);
  h.send('pointerdown',h.event(20,20,{target}));h.send('pointermove',h.event(30,30));await h.send('pointerup',h.event(30,30));
  assert.equal(entry.src,'data:image/gif;base64,R0lGODlh');assert.equal(h.undo.length,1);
  const handle={closest:selector=>selector==='[data-rectangle-resize]'?{dataset:{rectangleResize:'e'}}:target.closest(selector)};
  h.send('pointerdown',h.event(800,250,{target:handle}));h.send('pointermove',h.event(780,250));await h.send('pointerup',h.event(780,250));
  assert.equal(entry.src,'data:image/gif;base64,R0lGODlh');assert.equal(h.undo.length,2);
  h.sandbox.state=JSON.parse(h.undo.pop());assert.equal(h.read('state.items[0].src'),entry.src);
});
test('the main image ignores side and scale handles, including in older projects',async()=>{
  for(const legacy of [false,true])for(const side of ['n','e','s','w','scale']){
    const h=harness(true);if(legacy)delete h.sandbox.state.items[0].imageBase;
    h.sandbox.state.items.push({id:'label',kind:'label',x:40,y:40,w:100,h:30,text:'Keep me'});h.sandbox.selected.add('base');
    const before=structuredClone(h.sandbox.state),handle={dataset:{rectangleResize:side}};
    const target={closest:selector=>selector==='.item,.selection-overlay'?{dataset:{id:'base'}}:side==='scale'?selector==='.resize-handle'?{}:null:selector==='[data-rectangle-resize]'?handle:null};
    h.send('pointerdown',h.event(100,100,{target}));assert.equal(h.read('canvasGesture.type'),'box');
    h.send('pointermove',h.event(180,150));
    assert.deepEqual(h.read('state'),before);assert.equal(h.undo.length,0);
    h.send('pointercancel',h.event(180,150));
    assert.deepEqual(h.read('state'),before);assert.deepEqual([...h.sandbox.selected],['base']);assert.equal(h.undo.length,0);
  }
});
test('dragging inside the fixed main image keeps an area until Make item',async()=>{
  const h=harness(true);h.sandbox.selected.add('base');mockPictureCrop(h);
  const imageTarget={closest:selector=>selector==='.item,.selection-overlay'?{dataset:{id:'base'}}:null};
  h.send('pointerdown',h.event(100,100,{target:imageTarget}));assert.equal(h.read('canvasGesture.type'),'box');assert.equal(h.read('canvasGesture.pixels'),true);
  h.send('pointermove',h.event(280,200,{target:imageTarget}));
  assert.deepEqual(h.read('regionSelection.box'),{x:100,y:100,w:180,h:100});assert.equal(h.sandbox.selected.size,0);
  assert.deepEqual(h.read('regionSelection.sources'),h.start.items);
  assert.deepEqual(h.read('sourcePixelArea(regionSelection.box,state.items[0],800,500)'),{x:100,y:100,w:180,h:100});
  assert.deepEqual(h.read('state'),h.start);assert.equal(h.undo.length,0);
  await h.send('pointerup',h.event(280,200,{target:imageTarget}));
  assert.deepEqual(h.read('state'),h.start);assert.equal(h.undo.length,0);
  await h.get('canvas-menu-make-item').onclick();
  assert.equal(h.read('regionSelection'),null);assert.deepEqual([...h.sandbox.selected],['piece']);assert.equal(h.undo.length,1);
  assert.deepEqual(h.read('state.items.slice(1).map(({x,y,w,h})=>({x,y,w,h}))'),[{x:100,y:100,w:180,h:100}]);
  assert.deepEqual(h.read('state.canvas'),h.start.canvas);
  assert.deepEqual(h.read('({x:state.items[0].x,y:state.items[0].y,w:state.items[0].w,h:state.items[0].h})'),{x:0,y:0,w:800,h:500});
});
test('each selected item moves one place and keeps the order within its group',()=>{
  for(const [position,expected] of [['front',['background','b','a','d','c']],['back',['a','background','c','b','d']]]){
    const h=harness();h.sandbox.state.items.push({id:'c',kind:'shape',x:20,y:20,w:30,h:30},{id:'d',kind:'shape'});
    h.sandbox.selected=new Set(['c','a']);h.get('canvas-menu-bring-'+position).onclick();
    assert.deepEqual(h.read('state.items.map(entry=>entry.id)'),expected);
    assert.deepEqual([...h.sandbox.selected],['c','a']);assert.equal(h.undo.length,1);
  }
});
test('the Items list right-click selects its row and offers the same front and back actions',()=>{
  const h=harness();h.sandbox.selected.add('b');
  const target={closest:selector=>selector==='.layer'?{dataset:{id:'a'}}:null};
  const event=h.event(100,150,{target});h.list('contextmenu',event);
  assert.equal(event.prevented,true);assert.equal(h.get('canvas-edit-menu').hidden,false);
  assert.deepEqual([...h.sandbox.selected],['a']);
  assert.equal(h.get('canvas-menu-bring-front').disabled,false);
  assert.equal(h.get('canvas-menu-bring-back').disabled,false);
  h.get('canvas-menu-bring-front').onclick();
  assert.deepEqual(h.read('state.items.map(entry=>entry.id)'),['background','b','a']);
  assert.equal(h.get('canvas-edit-menu').hidden,true);assert.equal(h.undo.length,1);
});
test('right-clicking a selected item keeps the group on the page and in the Items list',()=>{
  for(const list of [false,true]){
    const h=harness();h.sandbox.selected=new Set(['a','b']);
    const target={closest:selector=>selector===(list?'.layer':'.item,.selection-overlay')?{dataset:{id:'a'}}:null};
    (list?h.list:h.send)('contextmenu',h.event(100,100,{target}));
    assert.deepEqual([...h.sandbox.selected],['a','b']);
    assert.equal(h.get('canvas-menu-bring-front').disabled,true);
    h.get('canvas-menu-bring-back').onclick();
    assert.deepEqual(h.read('state.items.map(entry=>entry.id)'),['a','b','background']);
  }
});
test('the right sidebar actions change the order and disable a move with no change',()=>{
  const h=harness();h.sandbox.selected.add('a');const buttons=[];
  h.sandbox.actions={append:button=>buttons.push(button)};
  vm.runInContext('renderOrderActions(actions)',h.sandbox);
  assert.deepEqual(buttons.map(button=>[button.textContent,button.disabled]),[['Bring to front 1 step',false],['Bring to back 1 step',false]]);
  buttons[0].onclick();assert.deepEqual(h.read('state.items.map(entry=>entry.id)'),['background','b','a']);
  buttons.length=0;vm.runInContext('renderOrderActions(actions)',h.sandbox);
  assert.equal(buttons[0].disabled,true);buttons[0].onclick();assert.equal(h.undo.length,1);
});
test('bring to back keeps picture pieces above the page picture',()=>{
  const h=harness(true);h.sandbox.state.items.push(
    {id:'a',kind:'image',pictureFragment:true,x:20,y:20,w:30,h:30},
    {id:'b',kind:'image',pictureFragment:true,x:20,y:20,w:30,h:30}
  );
  h.sandbox.selected.add('b');h.get('canvas-menu-bring-back').onclick();
  assert.deepEqual(h.read('state.items.map(entry=>entry.id)'),['base','b','a']);
  assert.equal(h.undo.length,1);
});
test('empty selections, hidden items, picture areas and page pictures make no order change',()=>{
  const empty=harness();empty.get('canvas-menu-bring-front').onclick();assert.equal(empty.undo.length,0);
  const hidden=harness();hidden.sandbox.state.items[1].hidden=true;hidden.sandbox.selected.add('a');
  hidden.get('canvas-menu-bring-front').onclick();assert.equal(hidden.undo.length,0);
  const base=harness(true);base.sandbox.selected.add('base');base.get('canvas-menu-bring-front').onclick();assert.equal(base.undo.length,0);
  const area=harness(true);vm.runInContext('regionSelection=rememberRegion({x:10,y:10,w:50,h:50})',area.sandbox);
  area.get('canvas-menu-bring-back').onclick();assert.equal(area.undo.length,0);
});
test('a right-click inside a picture area keeps the area selected and disables order changes',()=>{
  const h=harness(true);vm.runInContext('regionSelection=rememberRegion({x:10,y:10,w:50,h:50})',h.sandbox);
  const target={closest:selector=>selector==='.item,.selection-overlay'?{dataset:{id:'base'}}:null};
  h.send('contextmenu',h.event(30,30,{target}));
  assert.deepEqual(h.read('regionSelection.box'),{x:10,y:10,w:50,h:50});
  assert.equal(h.sandbox.selected.size,0);assert.equal(h.get('canvas-edit-menu').hidden,false);
  assert.equal(h.get('canvas-menu-make-item').hidden,false);
  assert.equal(h.get('canvas-menu-bring-front').disabled,true);
  assert.equal(h.get('canvas-menu-bring-back').disabled,true);
});
test('picture boxes select existing items at an edge or corner and return to an area when clear',async()=>{
  for(const kind of ['image','icon','label','shape'])for(const rectangleTool of [false,true]){
    const h=harness(true),entry={id:'existing',kind,x:100,y:100,w:100,h:60,src:'data:image/png;base64,BBBB',pictureFragment:true};
    h.sandbox.state.items.push(entry,{...entry,id:'hidden',hidden:true,x:50,y:50});
    const before=structuredClone(h.sandbox.state);
    if(rectangleTool)h.get('select-rectangle').onclick();
    h.send('pointerdown',h.event(80,80));h.send('pointermove',h.event(99.9,100));
    assert.equal(h.sandbox.selected.size,0);assert.ok(h.read('regionSelection'));
    h.send('pointermove',h.event(100,100));
    assert.deepEqual([...h.sandbox.selected],['existing']);assert.equal(h.read('regionSelection'),null);
    h.send('pointermove',h.event(99.9,100));
    assert.equal(h.sandbox.selected.size,0);assert.ok(h.read('regionSelection'));
    h.send('pointermove',h.event(110,110));await h.send('pointerup',h.event(110,110));
    assert.deepEqual([...h.sandbox.selected],['existing']);assert.equal(h.read('regionSelection'),null);
    h.send('contextmenu',h.event(110,110));assert.equal(h.get('canvas-menu-make-item').hidden,true);
    assert.deepEqual(h.read('state'),before);assert.equal(h.undo.length,0);
  }
});
test('picture boxes keep Shift selections and select several pieces without making another item',async()=>{
  const h=harness(true);
  h.sandbox.state.items.push({id:'a',kind:'image',x:100,y:100,w:40,h:40,pictureFragment:true},{id:'b',kind:'icon',x:180,y:100,w:40,h:40},{id:'c',kind:'image',x:400,y:300,w:40,h:40,pictureFragment:true});
  h.sandbox.selected.add('c');
  h.send('pointerdown',h.event(80,80,{shiftKey:true}));h.send('pointermove',h.event(180,100,{shiftKey:true}));await h.send('pointerup',h.event(180,100,{shiftKey:true}));
  assert.deepEqual([...h.sandbox.selected],['c','a','b']);assert.equal(h.read('regionSelection'),null);
  assert.equal(h.sandbox.state.items.length,4);assert.equal(h.undo.length,0);
});
test('Select all picks existing picture items, or leaves an unmade area when there are none',()=>{
  const h=harness(true);h.key(h.event(0,0,{key:'a',metaKey:true}));
  assert.deepEqual(h.read('regionSelection.box'),{x:0,y:0,w:800,h:500});assert.deepEqual(h.read('state'),h.start);
  h.sandbox.state.items.push({id:'piece',kind:'image',x:100,y:100,w:40,h:40,pictureFragment:true});
  h.key(h.event(0,0,{key:'a',metaKey:true}));
  assert.deepEqual([...h.sandbox.selected],['piece']);assert.equal(h.read('regionSelection'),null);assert.equal(h.undo.length,0);
});
test('press and drag draws a box right away without changing the picture or undo history', async () => {
  const h=harness(true);h.send('pointerdown',h.event(80,80));
  assert.equal(h.read('Boolean(canvasGesture.box)'),true);
  h.send('pointermove',h.event(280,180));
  assert.deepEqual(h.read('regionSelection.box'),{x:80,y:80,w:200,h:100});
  assert.equal(h.sandbox.selected.size,0);
  assert.deepEqual(JSON.parse(JSON.stringify(h.sandbox.state)),h.start);
  assert.equal(h.undo.length,0);
  h.send('pointercancel',h.event(280,180));
  assert.equal(h.read('regionSelection'),null);
});
test('Make item turns the drawn area into an item with move and resize handles in one Undo step',async()=>{
  for(const rectangleTool of [false,true]){
    const h=harness(true);mockPictureCrop(h);
    const nativeSelection=draft.slice(draft.indexOf('function renderNativeSelection()'),draft.indexOf('function fit()',draft.indexOf('function renderNativeSelection()')));
    vm.runInContext(nativeSelection,h.sandbox);h.sandbox.render=()=>vm.runInContext('renderSelection()',h.sandbox);
    if(rectangleTool)h.get('select-rectangle').onclick();
    h.send('pointerdown',h.event(280,180));h.send('pointermove',h.event(80,80));await h.send('pointerup',h.event(80,80));
    assert.deepEqual(h.read('regionSelection.box'),{x:80,y:80,w:200,h:100});
    assert.deepEqual(h.read('state'),h.start);assert.equal(h.undo.length,0);
    vm.runInContext('renderSelection()',h.sandbox);
    const button=h.get('phone').children.at(-1).children.at(-1);
    assert.equal(button.textContent,'Make item');assert.equal(button.className,'make-item-action');
    const press=h.event(80,180,{target:{closest:selector=>selector==='.make-item-action'?button:null}});
    h.send('pointerdown',press);assert.equal(press.prevented,undefined);assert.equal(h.read('canvasGesture'),null);
    await button.onclick();
    assert.equal(h.read('regionSelection'),null);assert.deepEqual([...h.sandbox.selected],['piece']);
    assert.deepEqual(h.read('state.items[1]'),{id:'piece',name:'Picture selection',kind:'image',src:'data:image/png;base64,BBBB',x:80,y:80,w:200,h:100,pictureFragment:true});
    assert.equal(h.sandbox.state.items[0].src,'filled');assert.equal(h.sandbox.stage.dataset.selectTool,'');
    assert.equal(h.undo.length,1);assert.deepEqual(JSON.parse(h.undo[0]),h.start);
    const overlay=h.get('phone').children.at(-1);
    assert.equal(overlay.dataset.id,'piece');
    assert.deepEqual(overlay.children.filter(child=>child.className.startsWith('rectangle-handle')).map(child=>child.dataset.rectangleResize),['n','e','s','w']);
    assert.equal(overlay.children.at(-1).attributes['aria-label'],'Scale Picture selection');
    for(const [action,dx,dy,expected] of [['move',20,30,[100,110,200,100]],['e',40,0,[100,110,240,100]],['s',0,20,[100,110,240,120]],['scale',120,60,[100,110,360,180]]]){
      const target={closest:selector=>selector==='.item,.selection-overlay'?{dataset:{id:'piece'}}:selector==='[data-rectangle-resize]'&&['e','s'].includes(action)?{dataset:{rectangleResize:action}}:selector==='.resize-handle'&&action==='scale'?{}:null};
      h.send('pointerdown',h.event(150,140,{target}));h.send('pointermove',h.event(150+dx,140+dy));await h.send('pointerup',h.event(150+dx,140+dy));
      assert.deepEqual(h.read('state.items.slice(1).flatMap(({x,y,w,h})=>[x,y,w,h])'),expected);
    }
    assert.equal(h.undo.length,5);h.sandbox.state=JSON.parse(h.undo[0]);assert.deepEqual(h.read('state'),h.start);
  }
});
test('Make item waits for the picture, keeps the drawn bounds, and allows Escape',async()=>{
  for(const cancel of [false,true]){
    const h=harness(true);mockPictureCrop(h);const makePlan=h.sandbox.makeRegionPlan;
    let finish;h.sandbox.makeRegionPlan=region=>new Promise(resolve=>{finish=async()=>resolve(await makePlan(region));});
    h.send('pointerdown',h.event(80,80));h.send('pointermove',h.event(280,180));
    await h.send('pointerup',h.event(280,180));
    assert.equal(finish,undefined);
    const making=h.get('canvas-menu-make-item').onclick();
    assert.equal(h.read('canvasEditBusy'),true);
    h.send('pointerdown',h.event(500,400));h.send('pointermove',h.event(500,400));
    assert.deepEqual(h.read('regionSelection.box'),{x:80,y:80,w:200,h:100});assert.deepEqual(h.read('state'),h.start);
    if(cancel)h.key(h.event(0,0,{key:'Escape'}));
    await finish();await making;
    assert.equal(h.read('canvasGesture'),null);assert.equal(h.read('regionSelection'),null);
    if(cancel){assert.deepEqual(h.read('state'),h.start);assert.equal(h.undo.length,0);}
    else{assert.deepEqual([...h.sandbox.selected],['piece']);assert.equal(h.undo.length,1);assert.equal(h.sandbox.state.items[1].w,200);}
  }
});
test('a failed picture or changed source cannot leave a new item after Make item',async()=>{
  for(const changed of [false,true]){
    const h=harness(true);mockPictureCrop(h);const makePlan=h.sandbox.makeRegionPlan,messages=[];
    h.sandbox.notify=message=>messages.push(message);
    h.sandbox.makeRegionPlan=async region=>{
      if(!changed)throw new Error('Could not read this picture.');
      h.sandbox.state.items[0].src='changed';return makePlan(region);
    };
    h.send('pointerdown',h.event(80,80));h.send('pointermove',h.event(280,180));await h.send('pointerup',h.event(280,180));
    await h.get('canvas-menu-make-item').onclick();
    assert.equal(h.sandbox.state.items.length,1);assert.equal(h.undo.length,0);assert.equal(h.read('canvasGesture'),null);
    assert.equal(h.sandbox.state.items[0].src,changed?'changed':h.start.items[0].src);
    if(!changed)assert.deepEqual(messages,['Could not read this picture.']);
  }
});
test('an HTML group moves from the gap inside its box, with one undo step', async () => {
  const h=harness();h.sandbox.state.items[0].hidden=true;h.start.items[0].hidden=true;
  h.send('pointerdown',h.event(90,90));h.send('pointermove',h.event(210,220));await h.send('pointerup',h.event(210,220));
  assert.deepEqual([...h.sandbox.selected],['a','b']);
  h.send('pointerdown',h.event(150,155));h.send('pointermove',h.event(250,255));await h.send('pointerup',h.event(250,255));
  assert.deepEqual(h.read('state.items.map(({id,x,y})=>({id,x,y}))'),[{id:'background',x:0,y:0},{id:'a',x:200,y:200},{id:'b',x:200,y:270}]);
  assert.equal(h.undo.length,1);assert.deepEqual(JSON.parse(h.undo[0]),h.start);
});
test('the HTML drag selects partly touched items before release without changing the page', async () => {
  const h=harness();h.send('pointerdown',h.event(90,90));h.send('pointermove',h.event(110,110));
  assert.deepEqual([...h.sandbox.selected],['background','a']);
  assert.equal(h.read('regionSelection'),null);
  await h.send('pointerup',h.event(110,110));
  assert.deepEqual([...h.sandbox.selected],['background','a']);
  assert.deepEqual(JSON.parse(JSON.stringify(h.sandbox.state)),h.start);assert.equal(h.undo.length,0);
});
test('the HTML drag keeps a small gap until the box actually touches the item', () => {
  const h=harness();h.send('pointerdown',h.event(90,90));h.send('pointermove',h.event(99.9,110));
  assert.deepEqual([...h.sandbox.selected],['background']);
  h.send('pointermove',h.event(100,110));
  assert.deepEqual([...h.sandbox.selected],['background','a']);
});
test('dragging inside an unmade area draws a new selection without reading or changing the picture', async () => {
  const h=harness(true);h.sandbox.makeRegionPlan=()=>{throw new Error('Must choose Make item first');};
  vm.runInContext('regionSelection=rememberRegion({x:80,y:80,w:200,h:100});',h.sandbox);
  h.send('pointerdown',h.event(120,120));h.send('pointermove',h.event(320,220));await h.send('pointerup',h.event(320,220));
  assert.deepEqual(h.read('regionSelection.box'),{x:120,y:120,w:200,h:100});
  assert.deepEqual(h.read('state'),h.start);assert.equal(h.undo.length,0);
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
test('a lifted picture area can move beyond the page and undo restores its source', async () => {
  const h=harness(true);
  vm.runInContext('regionSelection=rememberRegion({x:80,y:80,w:200,h:100});makeRegionPlan=async()=>({entry:{id:"piece",kind:"image",x:80,y:80,w:200,h:100},patches:[{id:"base",src:"filled"}]});',h.sandbox);
  await h.get('canvas-menu-make-item').onclick();
  h.send('pointerdown',h.event(120,120));h.send('pointermove',h.event(-320,-220));
  await h.send('pointerup',h.event(-320,-220));
  assert.deepEqual(h.read('state.items[1]'),{id:'piece',kind:'image',x:-360,y:-260,w:200,h:100});
  assert.equal(h.undo.length,2);assert.deepEqual(JSON.parse(h.undo[0]),h.start);
});
test('a box outside a picture page selects and moves parked items', async () => {
  const h=harness(true);
  h.sandbox.state.items.push({id:'parked',kind:'image',x:-250,y:-180,w:100,h:60});
  h.send('pointerdown',h.event(-280,-200));h.send('pointermove',h.event(-140,-110));
  assert.equal(h.read('canvasGesture.pixels'),false);assert.deepEqual([...h.sandbox.selected],['parked']);
  await h.send('pointerup',h.event(-140,-110));
  h.send('pointerdown',h.event(-200,-150));h.send('pointermove',h.event(1000,900));await h.send('pointerup',h.event(1000,900));
  assert.deepEqual(h.read('state.items[1]'),{id:'parked',kind:'image',x:950,y:870,w:100,h:60});
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
function mergeHarness(){
  const h=harness(true);
  h.sandbox.state.items.push({id:'piece',name:'Picture selection',kind:'image',src:'data:image/png;base64,BBBB',x:120,y:80,w:140,h:60,opacity:.5,pictureFragment:true});
  h.sandbox.selected.add('piece');
  h.sandbox.selectionImage=async()=>({naturalWidth:800,naturalHeight:500});
  h.sandbox.html2canvas=async(phone,options)=>{h.options=options;return {toDataURL:()=> 'data:image/png;base64,CCCC'};};
  return h;
}
test('No item shows for screenshot pieces, including a right-click on an unselected piece', () => {
  const h=mergeHarness();h.sandbox.selected.clear();
  const target={closest:selector=>selector==='.item,.selection-overlay'?{dataset:{id:'piece'}}:null};
  h.send('contextmenu',h.event(150,100,{target}));
  assert.deepEqual([...h.sandbox.selected],['piece']);
  assert.equal(h.get('canvas-menu-no-item').hidden,false);
  h.sandbox.selected=new Set(['base']);h.send('contextmenu',h.event(10,10));
  assert.equal(h.get('canvas-menu-no-item').hidden,true);
  const html=harness();html.sandbox.selected.add('a');html.send('contextmenu',html.event(110,110));
  assert.equal(html.get('canvas-menu-no-item').hidden,true);
});
test('No item keeps the piece visible in the background and removes it as an item in one undo step', async () => {
  const h=mergeHarness(),before=structuredClone(h.sandbox.state);
  const other={id:'other',kind:'image',src:'data:image/png;base64,DDDD',x:300,y:180,w:80,h:50,pictureFragment:true};
  h.sandbox.state.items.push(other);before.items.push({...other});
  await h.get('canvas-menu-no-item').onclick();
  assert.deepEqual(h.read('state.items.map(entry=>entry.id)'),['base','other']);
  assert.deepEqual(h.read('state.items[0]'),{id:'base',name:'Base',kind:'image',x:0,y:0,w:800,h:500,src:'data:image/png;base64,CCCC',imageBase:true});
  assert.deepEqual(h.read('state.items[1]'),other);
  assert.equal(h.sandbox.selected.size,0);assert.equal(h.read('regionSelection'),null);
  assert.equal(h.undo.length,1);assert.deepEqual(JSON.parse(h.undo[0]),before);
  const element=(id,className='item')=>({dataset:{id},classList:{contains:name=>name===className}});
  assert.equal(h.options.ignoreElements(element('piece')),false);
  assert.equal(h.options.ignoreElements(element('base')),false);
  assert.equal(h.options.ignoreElements(element('other')),true);
  assert.equal(h.options.ignoreElements(element('', 'selection-overlay')),true);
  h.sandbox.state=JSON.parse(h.undo.pop());
  assert.deepEqual(h.read('state'),before);
});
test('No item merges several selected pieces across a page with several screenshots', async () => {
  const h=mergeHarness();
  h.sandbox.state.items.push({id:'base2',kind:'image',src:'data:image/png;base64,EEEE',x:0,y:250,w:800,h:250,imageBase:true},{id:'piece2',kind:'image',src:'data:image/png;base64,FFFF',x:300,y:320,w:80,h:40,pictureFragment:true});
  h.sandbox.selected.add('piece2');
  await vm.runInContext('mergeSelectionIntoBackground()',h.sandbox);
  assert.deepEqual(h.read('state.items.map(entry=>({id:entry.id,name:entry.name,imageBase:entry.imageBase}))'),[{id:'base',name:'Page background',imageBase:true}]);
  assert.equal(h.undo.length,1);
});
test('No item leaves the page alone if the picture fails or the page changes while it is being read', async () => {
  const failed=mergeHarness(),before=structuredClone(failed.sandbox.state);
  failed.sandbox.html2canvas=async()=>{throw new Error('Could not read picture');};
  await vm.runInContext('mergeSelectionIntoBackground()',failed.sandbox);
  assert.deepEqual(failed.read('state'),before);assert.equal(failed.undo.length,0);assert.equal(failed.read('canvasEditBusy'),false);
  const changed=mergeHarness();
  changed.sandbox.html2canvas=async()=>{changed.sandbox.state.items[1].x=200;return {toDataURL:()=> 'data:image/png;base64,CCCC'};};
  await vm.runInContext('mergeSelectionIntoBackground()',changed.sandbox);
  assert.equal(changed.sandbox.state.items.length,2);assert.equal(changed.sandbox.state.items[1].x,200);
  assert.equal(changed.undo.length,0);assert.equal(changed.read('canvasEditBusy'),false);
});
test('No item leaves HTML items, the screenshot itself, and an area selection alone', async () => {
  const h=mergeHarness();
  vm.runInContext('regionSelection=rememberRegion({x:120,y:80,w:140,h:60})',h.sandbox);
  await vm.runInContext('mergeSelectionIntoBackground()',h.sandbox);
  assert.equal(h.sandbox.state.items.length,2);assert.equal(h.undo.length,0);
  vm.runInContext('regionSelection=null;selected=new Set(["base"])',h.sandbox);
  await vm.runInContext('mergeSelectionIntoBackground()',h.sandbox);
  assert.equal(h.sandbox.state.items.length,2);assert.equal(h.undo.length,0);
  const html=harness();html.sandbox.selected.add('a');
  await vm.runInContext('mergeSelectionIntoBackground()',html.sandbox);
  assert.deepEqual(html.read('state'),html.start);assert.equal(html.undo.length,0);
});
test('new page tools stay in all saved standalone editors', () => {
  for(const entry of readdirSync(join(__dirname,'../drafts'),{withFileTypes:true}).filter(entry=>entry.isDirectory()&&existsSync(join(__dirname,'../drafts',entry.name,'index.html')))){
    const html=readFileSync(join(__dirname,'../drafts',entry.name,'index.html'),'utf8');
    assert.equal(html.split('// BEGIN CANVAS EDITOR\n')[1].split('// END CANVAS EDITOR')[0].trimEnd(),(shapes+'\n'+helpers+'\n'+fitContent+'\n'+controller+'\n'+textEditor+'\n'+imageEditor).trimEnd());
    assert.equal(html.split('id="canvas-edit-menu"').length-1,1);
    assert.match(html,/<div id="canvas-edit-menu"[^>]*>\s*<button id="canvas-menu-make-item" role="menuitem" hidden>Make item<\/button>/);
    assert.match(html, /id="canvas-menu-no-item" role="menuitem" hidden>No item<\/button>/);
    assert.equal(html.split('id="image-edit-bar"').length-1,1);
    assert.match(html,/renderImageEditAction\(heading,item\);/);
    assert.match(html,/renderOrderActions\(buttons\);/);
    assert.match(html,/renderOrderActions\(actions\);/);
    assert.match(html,/row.dataset.id=item.id;/);
    assert.doesNotMatch(html,/\['Forward',|\['Backward',|function reorder\(/);
    assert.match(html,/function save\(\) \{ if\(imageEditSession\)/);
  }
});
