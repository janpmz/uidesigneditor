const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, 'fit-content.js'), 'utf8');
function harness(fonts = Promise.resolve()) {
  const items = [
    {id:'text',kind:'label',text:'Hello',x:10,y:20,w:100,h:80,fontSize:20,align:'center'},
    {id:'button',kind:'button',text:'Ask',icon:'mic',x:130,y:20,w:100,h:80,iconSize:18,borderWidth:2},
    {id:'picture',kind:'image',x:10,y:120,w:200,h:100,src:'picture'},
  ];
  const undo = [], measured = [];
  const sandbox = vm.createContext({
    state:{items}, selected:new Set(items.map(entry=>entry.id)), editing:true,
    canvasGesture:null,canvasEditBusy:false,regionSelection:null,
    document:{fonts:{ready:fonts}}, $:()=>({querySelectorAll:()=>items.map(entry=>({dataset:{id:entry.id}}))}),
    notify(){},round:value=>Math.round(value*10)/10,
    measure:entry=>{measured.push(entry.id);return {...entry,x:entry.x+10,y:entry.y+20,w:60,h:30};},
  });
  sandbox.selectedItems=()=>sandbox.state.items.filter(entry=>sandbox.selected.has(entry.id));
  sandbox.change=fn=>{undo.push(JSON.stringify(sandbox.state));fn();};
  vm.runInContext(source+'\nmeasureContentBox=entry=>{const {x,y,w,h}=measure(entry);return {x,y,w,h};};',sandbox);
  return {sandbox,undo,measured,fit:()=>vm.runInContext('fitCanvasSelection()',sandbox)};
}

test('fit changes several boxes in one Undo step and keeps text, styles, and pictures', async () => {
  const h=harness(),before=JSON.parse(JSON.stringify(h.sandbox.state));
  await h.fit();
  assert.deepEqual(h.measured,['text','button']);
  assert.equal(h.undo.length,1);
  assert.deepEqual(JSON.parse(h.undo[0]),before);
  assert.deepEqual(JSON.parse(JSON.stringify(h.sandbox.state.items)),[
    {...before.items[0],x:20,y:40,w:60,h:30},
    {...before.items[1],x:140,y:40,w:60,h:30},
    before.items[2],
  ]);
  h.sandbox.state=JSON.parse(h.undo.pop());
  assert.deepEqual(h.sandbox.state,before);
});

test('a box that fits makes no new Undo step', async () => {
  const h=harness();
  vm.runInContext('measureContentBox=entry=>({x:entry.x,y:entry.y,w:entry.w,h:entry.h});',h.sandbox);
  await h.fit();assert.equal(h.undo.length,0);
  assert.equal(h.sandbox.canvasEditBusy,false);
});

test('fit stops if the page or selection changes while fonts load', async () => {
  for(const update of [h=>{h.sandbox.state.items[0].text='Changed';},h=>{h.sandbox.selected.clear();}]){
    let ready;const h=harness(new Promise(resolve=>{ready=resolve;})),pending=h.fit();
    update(h);ready();await pending;
    assert.equal(h.undo.length,0);assert.deepEqual(h.measured,[]);
    assert.equal(h.sandbox.canvasEditBusy,false);
  }
});

test('picture areas, shapes, and an open move keep their boxes', async () => {
  for(const flag of ['regionSelection','canvasGesture']){
    const h=harness();h.sandbox[flag]={};await h.fit();assert.equal(h.undo.length,0);
  }
  const h=harness();
  assert.equal(vm.runInContext("canFitContent({kind:'shape',text:'Hello'})",h.sandbox),false);
  assert.equal(vm.runInContext("canFitContent({kind:'label',text:' '})",h.sandbox),false);
});
