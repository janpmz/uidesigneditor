const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const source=readFileSync(join(__dirname,'annotation-shapes.js'),'utf8');
const helpers=source.split('// BEGIN ANNOTATION ADD')[0];
const context=vm.createContext({round:value=>Math.round(value*10)/10});vm.runInContext(helpers,context);
const run=code=>JSON.parse(JSON.stringify(vm.runInContext(code,context)));
const arrow={id:'arrow',kind:'shape',shape:'arrow',x:100,y:200,w:180,h:40,color:'#ef4444',strokeWidth:4};
const rectangle={id:'rectangle',kind:'shape',shape:'rectangle',x:100,y:200,w:180,h:100,background:'transparent',borderColor:'#ef4444',borderWidth:3,radius:0};

test('each rectangle side and corner changes only the edges being dragged',()=>{
  const expected={nw:[120,230,160,70],n:[100,230,180,70],ne:[100,230,200,70],e:[100,200,200,100],se:[100,200,200,130],s:[100,200,180,130],sw:[120,200,160,130],w:[120,200,160,100]};
  for(const [side,box] of Object.entries(expected)){
    const entry=run(`(()=>{const start=${JSON.stringify(rectangle)},entry={...start};resizeRectangleFromHandle(entry,start,${JSON.stringify(side)},20,30);return entry;})()`);
    assert.deepEqual([entry.x,entry.y,entry.w,entry.h],box,side);
    assert.equal(entry.borderWidth,3);assert.equal(entry.borderColor,'#ef4444');assert.equal(entry.background,'transparent');assert.equal(entry.radius,0);
  }
});
test('rectangle sides cannot cross the far edge or make the border vanish',()=>{
  for(const [side,dx,dy] of [['nw',1000,1000],['se',-1000,-1000]]){
    const entry=run(`(()=>{const start=${JSON.stringify(rectangle)},entry={...start};resizeRectangleFromHandle(entry,start,${JSON.stringify(side)},${dx},${dy});return entry;})()`);
    assert.equal(entry.w,7);assert.equal(entry.h,7);
    if(side==='nw'){assert.equal(entry.x+entry.w,280);assert.equal(entry.y+entry.h,300);}
    else{assert.equal(entry.x,100);assert.equal(entry.y,200);}
  }
});
test('grips leave the middle of a small button clear for moving',()=>{
  const values={};context.buttonOverlay={style:{width:'148px',height:'46px',setProperty:(key,value)=>{values[key]=parseFloat(value);}}};
  for(const zoom of [.4,1,2]){
    context.scale=zoom;vm.runInContext('sizeRectangleHandles(buttonOverlay)',context);
    assert.ok(Math.abs(values['--rectangle-grip']*zoom-10)<.001);
    assert.ok(values['--rectangle-hit']<46/2);
  }
});
test('filled boxes, buttons, text boxes and saved rectangles share the move and resize tools',()=>{
  assert.equal(run(`isRectangleShape(${JSON.stringify(rectangle)})`),true);
  assert.equal(run(`isRectangleShape(${JSON.stringify({...rectangle,shape:undefined,name:'Renamed box'})})`),true);
  assert.equal(run(`isRectangleShape(${JSON.stringify(arrow)})`),false);
  for(const kind of ['shape','button','textbox'])assert.equal(run(`isRectangleShape({kind:${JSON.stringify(kind)},background:"#242424",borderWidth:0})`),true);
  for(const kind of ['image','icon','label','reading','tab'])assert.equal(run(`isRectangleShape({kind:${JSON.stringify(kind)}})`),false);
});

test('dragging either end keeps the other end in place in every direction',()=>{
  for(const end of ['start','end'])for(const point of [{x:-100,y:-200},{x:400,y:500},{x:112,y:500},{x:400,y:220}]){
    const result=run(`(()=>{
      const start=${JSON.stringify(arrow)},entry={...start},before=arrowPoints(start);
      moveArrowEnd(entry,start,${JSON.stringify(end)},${JSON.stringify(point)});
      const after=arrowPoints(entry);
      const absolute=points=>Object.fromEntries(['start','end'].map(key=>[key,{x:entry.x+points[key].x,y:entry.y+points[key].y}]));
      return {before,entry,after:absolute(after),path:arrowPath(entry)};
    })()`);
    const fixed=end==='start'?'end':'start';
    assert.deepEqual(result.after[end],point);
    assert.deepEqual(result.after[fixed],{x:arrow.x+result.before[fixed].x,y:arrow.y+result.before[fixed].y});
    assert.ok(result.entry.w>0&&result.entry.h>0);
    assert.doesNotMatch(result.path,/NaN|Infinity/);
  }
});
test('a drag cannot turn an arrow into a dot',()=>{
  assert.deepEqual(run(`(()=>{const start=${JSON.stringify(arrow)},entry={...start};moveArrowEnd(entry,start,'end',{x:112,y:220});return entry;})()`),arrow);
});

const pages=['dark-player-layout','dark-library-layout','dark-chapter-layout','dark-add-layout'].map(name=>`drafts/${name}/index.html`);
if(readFileSync(join(__dirname,'../index.html'),'utf8').includes('// BEGIN CANVAS EDITOR'))pages.unshift('index.html');
for(const file of pages){
  const html=readFileSync(join(__dirname,'..',file),'utf8');
  const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  test(file+': Rectangle and Arrow each add a red shape in one Undo step',()=>{
    new vm.Script(script);
    const add=script.split('// BEGIN ANNOTATION ADD')[1].split('// END ANNOTATION ADD')[0];
    let next=0;const undo=[],nodes=new Map();
    const sandbox=vm.createContext({
      state:{items:[]},selected:new Set(),...(file.includes('dark-chapter-layout')?{}:{compactViewport:{matches:false}}),
      canvasViewCenter:()=>({x:-50,y:1000}),round:value=>Math.round(value*10)/10,
      item:(id,name,kind,x,y,w,h,look)=>({id,name,kind,x,y,w,h,...look}),
      crypto:{randomUUID:()=>String(++next)},
      $:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);},
    });
    sandbox.change=fn=>{undo.push(structuredClone(sandbox.state));fn();};
    vm.runInContext(helpers+add,sandbox);
    nodes.get('add-rectangle').onclick();nodes.get('add-arrow').onclick();
    const [rectangle,arrow]=sandbox.state.items;
    assert.equal(rectangle.background,'transparent');assert.equal(rectangle.borderColor,'#ef4444');assert.equal(rectangle.borderWidth,3);assert.equal(rectangle.kind,'shape');assert.equal(rectangle.shape,'rectangle');
    assert.equal(arrow.color,'#ef4444');assert.equal(arrow.shape,'arrow');assert.equal(arrow.strokeWidth,4);
    for(const entry of [rectangle,arrow]){
      assert.equal(entry.x+entry.w/2,-50);assert.equal(entry.y+entry.h/2,1000);
      assert.match(html,new RegExp(`id="add-${entry===rectangle?'rectangle':'arrow'}"`));
    }
    assert.equal(undo.length,2);assert.deepEqual([...sandbox.selected],[arrow.id]);
    let closed=false;sandbox.compactViewport={matches:true};sandbox.$('editor-tools').open=true;sandbox.$('editor-tools').close=()=>{closed=true;};
    nodes.get('add-rectangle').onclick();assert.equal(closed,true);
    if(script.includes('const ADD_ITEMS=')){
      const standardAdd=script.slice(script.indexOf('const ADD_ITEMS='),script.indexOf('// BEGIN ICON SEARCH'));
      vm.runInContext(standardAdd,sandbox);
      for(const type of ['box','button','textbox']){
        closed=false;nodes.get('add-'+type).onclick();assert.equal(closed,true,type);
        const entry=sandbox.state.items.at(-1);assert.equal(vm.runInContext(`isRectangleShape(state.items.at(-1))`,sandbox),true);
        assert.deepEqual([...sandbox.selected],[entry.id]);
      }
    }
    assert.ok(html.includes(source.trimEnd()));
    assert.match(script,/styleArrowShape\(el,item\);/);assert.match(script,/renderArrowShape\(content,item\);/);
    assert.match(script,/renderArrowHandles\(overlay,items\[0\]\);/);assert.match(script,/renderArrowInspector\(pane,item\);/);
    assert.match(script,/renderRectangleHandles\(overlay,items\[0\]\);/);
    assert.match(script,/'iconOffsetX','strokeWidth'/);
  });
  test(file+': copied arrows keep their ends, color and line width',()=>{
    const clipboard=script.split('// BEGIN CANVAS CLIPBOARD')[1].split('// END CANVAS CLIPBOARD')[0].split('function canvasClipboardText')[0];
    const sandbox=vm.createContext({safePictureSource:()=>false});vm.runInContext(clipboard,sandbox);
    const entry={...arrow,arrowStart:{x:1,y:0},arrowEnd:{x:0,y:1}};
    const payload=JSON.stringify({type:'layout-items',version:1,items:[entry]});
    assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext(`readCanvasClipboard(${JSON.stringify(payload)}).items`,sandbox))),[entry]);
  });
}
