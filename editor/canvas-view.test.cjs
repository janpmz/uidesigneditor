const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,readdirSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const source=readFileSync(join(__dirname,'canvas-view.js'),'utf8');
const draft=readFileSync(join(__dirname,'../drafts/dark-player-layout/index.html'),'utf8');
const geometry=draft.split('// BEGIN SELECTION GEOMETRY')[1].split('// END SELECTION GEOMETRY')[0];
function harness(){
  const nodes=new Map(),listeners={stage:new Map(),document:new Map(),window:new Map()},captures=new Set();
  const get=id=>{
    if(!nodes.has(id))nodes.set(id,{value:id==='zoom'?'fit':'',style:{},classList:{add(){},remove(){}},focus(){}});
    return nodes.get(id);
  };
  const on=(where)=>(type,fn)=>{const list=listeners[where].get(type)||[];list.push(fn);listeners[where].set(type,list);};
  const stage=get('stage');
  Object.assign(stage,{clientHeight:600,getBoundingClientRect:()=>({left:100,top:50,width:800,height:600}),addEventListener:on('stage'),setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)});
  const sandbox=vm.createContext({
    $:get,stage,scale:1,state:{canvas:{width:393,height:852},items:[]},selected:new Set(['kept']),
    canvasGesture:null,canvasEditBusy:false,pictureDropBusy:false,drag:null,pictureChoice:{open:false},
    document:{addEventListener:on('document')},window:{addEventListener:on('window')},
    clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),round:value=>Math.round(value*10)/10,
    canvasTextTarget:()=>false,closeCanvasMenu(){},
  });
  const run=code=>vm.runInContext(code,sandbox),read=code=>JSON.parse(JSON.stringify(run(code)));
  sandbox.fit=()=>run('renderCanvasView()');
  sandbox.endCanvasGesture=()=>{sandbox.canvasGesture=null;};
  sandbox.endDrag=()=>{sandbox.drag=null;};
  run(geometry+source);sandbox.fit();
  const event=extra=>({pointerId:1,button:0,clientX:400,clientY:300,deltaMode:0,deltaX:0,deltaY:0,target:{},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
  const send=(where,type,extra)=>{const e=event(extra);for(const fn of listeners[where].get(type)||[]){fn(e);if(e.stopped)break;}return e;};
  return {get,run,read,send,sandbox};
}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} differs from ${expected}`);
test('Fit page centers the page and Fit all includes items on every side',()=>{
  const h=harness();near(h.read('canvasView.x+state.canvas.width*scale/2'),400);
  near(h.read('canvasView.y+state.canvas.height*scale/2'),300);
  h.run('state.items=[{x:-1500,y:-700,w:100,h:50},{x:1800,y:1400,w:300,h:100}]');
  h.get('zoom').value='all';h.get('zoom').onchange();
  const {x,y,w,h:height}=h.read('canvasViewBounds(true)'),view=h.read('canvasView'),scale=h.read('scale');
  assert.ok(view.x+x*scale>=31.99);assert.ok(view.x+(x+w)*scale<=768.01);
  assert.ok(view.y+y*scale>=31.99);assert.ok(view.y+(y+height)*scale<=568.01);
});
test('zoom stays under the pointer, shows its percent in the list, and has safe limits',()=>{
  const h=harness(),before=h.read('canvasViewPoint(340,220)');
  h.run('setCanvasZoom(2.375,{x:340,y:220})');
  const after=h.read('canvasViewPoint(340,220)');near(after.x,before.x);near(after.y,before.y);
  assert.equal(h.get('zoom-custom').textContent,'237.5%');
  assert.equal(h.get('zoom').value,'2.375');
  h.get('zoom').value='.25';h.get('zoom').onchange();assert.equal(h.read('scale'),.25);
  h.run('setCanvasZoom(500)');assert.equal(h.read('scale'),16);
  h.run('setCanvasZoom(0)');assert.equal(h.read('scale'),.01);
  h.run('setCanvasZoom(NaN)');assert.equal(h.read('scale'),.01);
  assert.equal(h.get('zoom-custom').textContent,'1%');
});
test('Space and middle-button drags pan without moving or clearing selected items',()=>{
  const h=harness(),state=h.read('state'),before=h.read('canvasView');
  h.send('document','keydown',{code:'Space'});
  assert.equal(h.send('stage','pointerdown',{}).stopped,true);
  h.send('stage','pointermove',{clientX:620,clientY:180});h.send('stage','pointerup',{});
  near(h.read('canvasView.x'),before.x+220);near(h.read('canvasView.y'),before.y-120);
  h.send('document','keyup',{code:'Space'});
  h.send('stage','pointerdown',{button:1});h.send('stage','pointermove',{clientX:390,clientY:310});h.send('stage','pointerup',{});
  near(h.read('canvasView.x'),before.x+210);near(h.read('canvasView.y'),before.y-110);
  assert.deepEqual(h.read('state'),state);assert.deepEqual(h.read('[...selected]'),['kept']);
  const panned=h.read('canvasView');h.sandbox.fit();assert.deepEqual(h.read('canvasView'),panned);
});
test('scroll pans, command-scroll zooms at the pointer, and new items use the view center',()=>{
  const h=harness(),view=h.read('canvasView');
  h.send('stage','wheel',{deltaX:2500,deltaY:-1800});
  near(h.read('canvasView.x'),view.x-2500);near(h.read('canvasView.y'),view.y+1800);
  const before=h.read('canvasViewPoint(400,300)');h.send('stage','wheel',{ctrlKey:true,deltaY:-40});
  const after=h.read('canvasViewPoint(400,300)');near(after.x,before.x);near(after.y,before.y);
  const center=h.read('canvasViewCenter()');assert.ok(center.x>393);assert.ok(center.y<0);
  h.run('state.items.push({...canvasViewCenter(),w:80,h:40})');
  const panned=h.read('canvasView');h.sandbox.fit();assert.deepEqual(h.read('canvasView'),panned);
});
test('Command and Ctrl wheel zoom use small steps, even with large wheel deltas',()=>{
  for(const key of ['metaKey','ctrlKey'])for(const deltaMode of [0,1,2]){
    const h=harness(),before=h.read('scale'),anchor=h.read('canvasViewPoint(400,300)');
    h.send('stage','wheel',{[key]:true,deltaMode,deltaY:-120});
    const increase=h.read('scale')/before-1;
    assert.ok(increase>0&&increase<.06,'a large wheel step changes zoom by less than 6%');
    const after=h.read('canvasViewPoint(400,300)');near(after.x,anchor.x);near(after.y,anchor.y);
    h.send('stage','wheel',{[key]:true,deltaMode,deltaY:120});near(h.read('scale'),before);
  }
  const h=harness(),before=h.read('scale');
  h.send('stage','wheel',{metaKey:true,deltaY:-5});
  assert.ok(h.read('scale')/before-1<.01,'small wheel steps change zoom by less than 1%');
});
test('two touches pan and zoom, cancel a pending selection, and end after both fingers lift',()=>{
  const h=harness();h.sandbox.canvasGesture={pointer:1};
  h.send('stage','pointerdown',{pointerType:'touch',pointerId:1,clientX:300,clientY:250});
  const before=h.read('canvasViewPoint(350,250)'),scale=h.read('scale');
  h.send('stage','pointerdown',{pointerType:'touch',pointerId:2,clientX:400,clientY:250});
  assert.equal(h.sandbox.canvasGesture,null);
  h.send('stage','lostpointercapture',{pointerId:1});
  h.send('stage','pointermove',{pointerType:'touch',pointerId:2,clientX:500,clientY:250});
  near(h.read('scale'),scale*2);
  const after=h.read('canvasViewPoint(400,250)');near(after.x,before.x);near(after.y,before.y);
  h.send('stage','pointerup',{pointerId:1});assert.equal(h.read('Boolean(canvasPinch)'),true);
  h.send('stage','pointerup',{pointerId:2});assert.equal(h.read('canvasPinch'),null);
});
test('each saved editor includes the same view tools and code',()=>{
  const tools=readFileSync(join(__dirname,'canvas-view-tools.html'),'utf8').trim();
  for(const entry of readdirSync(join(__dirname,'../drafts'),{withFileTypes:true}).filter(entry=>entry.isDirectory())){
    const html=readFileSync(join(__dirname,'../drafts',entry.name,'index.html'),'utf8');
    assert.equal(html.split('// BEGIN CANVAS VIEW\n')[1].split('// END CANVAS VIEW')[0].trimEnd(),source.split('// BEGIN CANVAS VIEW\n')[1].split('// END CANVAS VIEW')[0].trimEnd());
    assert.equal(html.split('<!-- BEGIN CANVAS VIEW TOOLS -->\n')[1].split('<!-- END CANVAS VIEW TOOLS -->')[0].trim(),tools);
    assert.equal(html.includes('id="zoom-level"'),false);
    assert.equal(html.split('id="zoom"').length-1,1);
  }
});
