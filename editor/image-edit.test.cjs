const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const read = name => readFileSync(join(__dirname,name),'utf8');
const pictures = read('image-drop.js');
const helpers = pictures.split('// BEGIN PICTURE HELPERS')[1].split('// END PICTURE HELPERS')[0];
const validation = pictures.slice(pictures.indexOf('function validEditorPage('),pictures.indexOf('async function readEditorPage('));
const sizes = pictures.split('// BEGIN PAGE SIZE HELPERS')[1].split('// END PAGE SIZE HELPERS')[0];
const controller = read('canvas-selection.js'),editor = read('image-edit.js');
const draft = read('../drafts/dark-player-layout/index.html');
const geometry = draft.split('// BEGIN SELECTION GEOMETRY')[1].split('// END SELECTION GEOMETRY')[0];

function harness(){
  const listeners={document:new Map(),stage:new Map()},nodes=new Map(),messages=[],saved=[];
  const node=()=>({hidden:true,style:{},dataset:{},value:'1',classList:{remove(){}},setAttribute(){},append(){},focus(){},remove(){},contains(){return false;},querySelectorAll(){return [];}});
  const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
  const on=(where,type,fn)=>{const entries=listeners[where].get(type)||[];entries.push(fn);listeners[where].set(type,entries);};
  const stage=get('stage');stage.addEventListener=(type,fn)=>on('stage',type,fn);stage.setPointerCapture=()=>{};stage.hasPointerCapture=()=>false;
  const parent={version:1,canvas:{width:393,height:852,background:'#123456'},items:[
    {id:'title',kind:'label',name:'Title',text:'Keep me',x:10,y:10,w:100,h:30},
    {id:'image',kind:'image',name:'Screen.png',src:'data:image/png;base64,AAAA',x:40,y:100,w:300,h:180,opacity:.6,radius:12,borderWidth:2},
  ]};
  const sandbox=vm.createContext({
    state:structuredClone(parent),selected:new Set(['image']),editing:true,stage,history:['older'],future:['later'],fieldEdit:null,
    pictureChoice:{open:false},pictureDropBusy:false,picturesReady:Promise.resolve(),$:get,
    document:{documentElement:{clientWidth:1200,clientHeight:800},addEventListener:(type,fn)=>on('document',type,fn),createElement:node},
    window:{innerWidth:1200,innerHeight:800},navigator:{clipboard:{writeText:async()=>{}}},setTimeout,
    crypto:{randomUUID:()=>String(Math.random())},copy:value=>JSON.parse(JSON.stringify(value)),
    item:(id,name,kind,x,y,w,h,extra)=>({id,name,kind,x,y,w,h,...extra}),
    notify:text=>messages.push(text),renderPhone(){},renderLayers(){},renderInspector(){},refreshSelection(){},renderNativeSelection(){},styleItem(){},
    phonePoint:event=>({x:event.clientX,y:event.clientY}),drawBox:gesture=>{gesture.box=node();},
    round:v=>Math.round(v*10)/10,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),atob,
  });
  sandbox.selectedItems=()=>sandbox.state.items.filter(entry=>sandbox.selected.has(entry.id)&&!entry.hidden);
  sandbox.render=()=>{vm.runInContext('renderImageEditStatus()',sandbox);if(!vm.runInContext('Boolean(imageEditSession)',sandbox))saved.push(JSON.stringify(sandbox.state));};
  sandbox.remember=before=>{sandbox.history.push(before);sandbox.future=[];};
  sandbox.change=fn=>{sandbox.remember(JSON.stringify(sandbox.state));fn();sandbox.render();};
  vm.runInContext(helpers+sizes+validation+geometry+read('pixel-tools.js')+read('fit-content.js')+controller+editor,sandbox);
  sandbox.selectionImage=async()=>({naturalWidth:1000,naturalHeight:600});
  sandbox.html2canvas=async(phone,options)=>{h.options=options;return {toDataURL:()=> 'data:image/png;base64,BBBB'};};
  const run=code=>vm.runInContext(code,sandbox),json=code=>JSON.parse(JSON.stringify(run(code)));
  const event=extra=>({button:0,pointerId:1,clientX:80,clientY:120,target:{closest:()=>null},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
  const send=(where,type,e)=>{for(const fn of listeners[where].get(type)||[]){fn(e);if(e.stopped)break;}};
  const h={sandbox,parent,get,messages,saved,run,json,event,send,open:()=>run('openImageEditor("image")'),done:()=>run('finishImageEditor()'),cancel:()=>run('finishImageEditor(true)')};return h;
}

test('Edit image appears for one added image in its settings and right-click menu',()=>{
  const h=harness();h.send('stage','contextmenu',h.event());
  assert.equal(h.get('canvas-menu-edit-image').hidden,false);
  h.sandbox.selected=new Set(['title']);h.send('stage','contextmenu',h.event());
  assert.equal(h.get('canvas-menu-edit-image').hidden,true);
  h.sandbox.selected=new Set(['title','image']);assert.equal(h.run('pictureToEdit()'),null);
  h.sandbox.selected=new Set(['image']);h.sandbox.state.items[1].imageBase=true;
  assert.equal(h.run('pictureToEdit()'),null);
});
test('Edit image opens at its full size and uses picture area selection',async()=>{
  const h=harness();await h.open();
  assert.deepEqual(h.json('state.canvas'),{width:1000,height:600,background:'transparent',picturePage:true,picturePageSize:{width:1000,height:600}});
  assert.equal(h.sandbox.state.items.length,1);assert.equal(h.sandbox.state.items[0].imageBase,true);
  assert.deepEqual(h.json('imageEditSession.parent'),h.parent);
  assert.equal(h.get('image-edit-bar').hidden,false);assert.equal(h.get('image-edit-name').textContent,'Screen.png');
  assert.deepEqual(h.json('history'),[]);assert.deepEqual(h.json('future'),[]);assert.equal(h.saved.length,0);
  h.send('stage','pointerdown',h.event());assert.equal(h.run('canvasGesture.pixels'),true);
});
test('Done saves one image in place, keeps the other items, and adds one page Undo step',async()=>{
  const h=harness();await h.open();
  h.run(`state.items.push({id:'piece',kind:'image',name:'Piece',src:'data:image/png;base64,CCCC',x:90,y:30,w:120,h:60,pictureFragment:true});history.push('image change');`);
  const contents=h.json('state');await h.done();
  assert.deepEqual(h.json('state'),{...h.parent,items:[h.parent.items[0],{...h.parent.items[1],src:'data:image/png;base64,BBBB',imageContents:contents}]});
  assert.equal(h.get('image-edit-bar').hidden,true);assert.equal(h.get('zoom').value,'1');
  assert.deepEqual(h.sandbox.history,['older',JSON.stringify(h.parent)]);assert.deepEqual(h.sandbox.future,[]);
  assert.equal(h.options.scale,1);assert.equal(h.options.backgroundColor,null);
  assert.equal(h.options.ignoreElements({classList:{contains:name=>name==='pixel-selection'}}),true);
  assert.equal(h.options.ignoreElements({classList:{contains:name=>name==='item'}}),false);
  assert.deepEqual([...h.sandbox.selected],['image']);
  h.run('state=JSON.parse(history.pop())');assert.deepEqual(h.json('state'),h.parent);
});
test('Cancel and Done without changes preserve the page and its Undo and Redo steps',async()=>{
  for(const cancel of [false,true]){
    const h=harness();await h.open();if(cancel)h.sandbox.state.items[0].src='changed';
    await(cancel?h.cancel():h.done());
    assert.deepEqual(h.json('state'),h.parent);assert.deepEqual(h.sandbox.history,['older']);assert.deepEqual(h.sandbox.future,['later']);
    assert.equal(h.get('image-edit-bar').hidden,true);
  }
});
test('saved drafts and HTML copies can reopen the separate parts of an edited image',async()=>{
  const h=harness();await h.open();
  h.run(`state.items.push({id:'piece',kind:'image',src:'data:image/png;base64,CCCC',x:90,y:30,w:120,h:60,pictureFragment:true});`);
  await h.done();const saved=JSON.stringify(h.sandbox.state);h.sandbox.state=JSON.parse(saved);
  await h.open();assert.equal(h.sandbox.state.items.length,2);assert.equal(h.sandbox.state.items[1].id,'piece');
  assert.equal(h.run('pictureToEdit()'),null);await h.cancel();assert.equal(JSON.stringify(h.sandbox.state),saved);
});
test('a save error keeps the edit view open for another try and Cancel still restores the page',async()=>{
  const h=harness();await h.open();h.sandbox.state.items[0].src='data:image/png;base64,CCCC';
  h.sandbox.html2canvas=async()=>{throw new Error('Could not save');};await h.done();
  assert.equal(h.get('image-edit-bar').hidden,false);assert.equal(h.run('imageEditSaving||canvasEditBusy'),false);
  assert.deepEqual(h.json('imageEditSession.parent'),h.parent);await h.cancel();assert.deepEqual(h.json('state'),h.parent);
});
test('saving blocks clicks and keys, and a changed image cannot replace the page',async()=>{
  const h=harness();await h.open();h.sandbox.state.items[0].src='data:image/png;base64,CCCC';
  let finish;h.sandbox.html2canvas=()=>new Promise(resolve=>{finish=resolve;});const pending=h.done();
  const click=h.event(),key=h.event({key:'z',metaKey:true});h.send('document','click',click);h.send('document','keydown',key);
  assert.equal(click.stopped,true);assert.equal(key.stopped,true);
  h.sandbox.state.items[0].x=20;finish({toDataURL:()=> 'data:image/png;base64,BBBB'});await pending;
  assert.equal(h.get('image-edit-bar').hidden,false);assert.deepEqual(h.json('imageEditSession.parent'),h.parent);
});
test('a failed image or a page change while opening leaves the page alone',async()=>{
  const h=harness();h.sandbox.selectionImage=async()=>{throw new Error('Bad image');};await h.open();
  assert.deepEqual(h.json('state'),h.parent);assert.equal(h.run('imageEditSession'),null);assert.deepEqual(h.sandbox.history,['older']);
  h.sandbox.selectionImage=async()=>{h.sandbox.state.items[0].text='New title';return {naturalWidth:1000,naturalHeight:600};};await h.open();
  assert.equal(h.sandbox.state.items.length,2);assert.equal(h.run('imageEditSession'),null);
});
test('pasting an image opens the Add or New page choice, even after copying items',()=>{
  const h=harness(),files=[{name:'Pasted.png',type:'image/png'}];let dropped;
  h.sandbox.handlePictureDrop=event=>{dropped=event;};h.run('canvasClipboard={items:[state.items[0]]}');
  const key=h.event({key:'v',metaKey:true});h.send('document','keydown',key);assert.equal(key.prevented,undefined);
  const event=h.event({clipboardData:{files,getData:()=>''}});h.send('document','paste',event);
  assert.equal(event.stopped,true);assert.deepEqual(JSON.parse(JSON.stringify(dropped.dataTransfer.files)),files);
  assert.equal(Number.isNaN(dropped.clientX),true);
  const text=h.event({target:{closest:()=>({})},clipboardData:{files,getData:()=>''}});dropped=null;h.send('document','paste',text);
  assert.equal(dropped,null);assert.equal(text.prevented,undefined);
});
test('repeated paste keys keep moving item copies after image paste support is added',()=>{
  const h=harness(),payload=JSON.stringify({type:'layout-items',version:1,items:[h.parent.items[0]],cut:false});
  for(let index=0;index<2;index++)h.send('document','paste',h.event({clipboardData:{files:[],getData:()=>payload}}));
  assert.deepEqual(h.json('state.items.slice(2).map(({x,y})=>({x,y}))'),[{x:22,y:22},{x:34,y:34}]);
});
