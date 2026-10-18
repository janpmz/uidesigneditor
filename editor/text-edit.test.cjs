const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const code = readFileSync(join(__dirname, 'text-edit.js'), 'utf8');
function harness(kind='label',text='Hello') {
  class Node {
    constructor(className='') { this.className=className;this.children=[];this.attributes={};this.dataset={};this.innerText=''; }
    get classList() { return {add:name=>{this.className+=' '+name;},remove:name=>{this.className=this.className.split(' ').filter(value=>value!==name).join(' ');}}; }
    set textContent(value) { this.innerText=value;this.children=[]; }
    setAttribute(key,value) { this.attributes[key]=value; }
    removeAttribute(key) { delete this.attributes[key]; }
    append(node) { this.children.push(node); }
    focus() { this.focused=true; }
    querySelector(selector) {
      if(selector==='.reading-lines')return kind==='reading'?this.children[0]?.children[0]:null;
      if(selector==='.content')return this.children[0];
      if(selector==='.content > span:not(.ion)')return this.children[0]?.children.find(node=>node.className!=='ion')||null;
      return null;
    }
  }
  const itemNode=new Node('item'),content=new Node('content'),icon=new Node('ion');itemNode.dataset.id='one';itemNode.append(content);content.append(icon);
  if(text) {const span=new Node(kind==='reading'?'reading-lines':'');span.innerText=text;content.children.unshift(span);}
  const entry={id:'one',kind,text,name:'Title',icon:'play',x:10,y:20,w:100,h:40,color:'#fff'},state={items:[entry]},history=[],stageListeners=new Map(),windowListeners=new Map();
  const stage=new Node(),input={value:text},phone={contains:node=>node===itemNode,querySelectorAll:()=>[itemNode]};
  stage.addEventListener=(type,fn)=>stageListeners.set(type,fn);
  const sandbox=vm.createContext({state,selected:new Set(['other']),editing:true,fieldEdit:null,canvasGesture:null,canvasEditBusy:false,pictureDropBusy:false,pictureChoice:{open:false},rectangleSelectionArmed:false,
    stage,document:{createElement:()=>new Node(),createRange:()=>({selectNodeContents(node){this.node=node;}}),elementFromPoint:()=>itemNode},
    window:{addEventListener:(type,fn)=>windowListeners.set(type,fn),getSelection:()=>({removeAllRanges(){},addRange(range){sandbox.range=range;}})},
    $:id=>id==='phone'?phone:{querySelector:()=>input},remember:()=>history.push(structuredClone(state)),save(){sandbox.saves++;},saves:0,
    renderPhone(){sandbox.redraws++;sandbox.finishCanvasTextEdit(true,false,false);},redraws:0,
    closeCanvasMenu(){},clearCanvasRegion(){},refreshSelection(){},canvasTextTarget:target=>Boolean(target?.editable),
  });
  vm.runInContext(code,sandbox);
  const start=()=>{sandbox.beginCanvasTextEdit(entry,itemNode);return vm.runInContext('canvasTextEdit?.node',sandbox);};
  const key=(node,key,options={})=>{const event={key,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...options};node.onkeydown(event);return event;};
  const event=(options={})=>({button:0,timeStamp:200,clientX:12,clientY:24,target:{closest:()=>null},preventDefault(){},stopImmediatePropagation(){},...options});
  return {sandbox,state,entry,itemNode,icon,history,input,start,key,event,stageListeners,windowListeners,active:()=>vm.runInContext('Boolean(canvasTextEdit)',sandbox)};
}

test('editing text keeps the name, icon, size and style and saves one Undo step',()=>{
  for(const kind of ['label','reading','tab','button','textbox']){
    const h=harness(kind),before=structuredClone(h.entry),node=h.start();
    assert.equal(node.attributes.contenteditable,'plaintext-only');assert.equal(node.focused,true);assert.equal(h.sandbox.range.node,node);
    assert.equal(h.sandbox.fieldEdit.node,node);
    assert.deepEqual([...h.sandbox.selected],['one']);assert.equal(h.history.length,0);
    node.innerText='New words';const event=h.key(node,'Enter',kind==='reading'?{ctrlKey:true}:{});
    assert.equal(event.prevented,true);assert.equal(h.active(),false);assert.deepEqual(h.entry,{...before,text:'New words'});
    assert.equal(h.sandbox.fieldEdit,null);
    assert.equal(h.history.length,1);assert.deepEqual(h.history[0].items[0],before);assert.equal(h.sandbox.saves,1);assert.equal(h.input.value,'New words');
  }
});

test('Escape cancels, while leaving the text saves blanks and line breaks',()=>{
  const h=harness(),node=h.start();node.innerText='Changed';h.key(node,'Escape');
  assert.equal(h.entry.text,'Hello');assert.equal(h.history.length,0);assert.equal(h.sandbox.saves,0);
  const blank=h.start();blank.innerText='';blank.onblur();assert.equal(h.entry.text,'');assert.equal(h.history.length,1);
  const again=h.start();assert.equal(again.innerText,'');again.innerText='A\r\nB';again.onblur();assert.equal(h.entry.text,'A\nB');assert.equal(h.history.length,2);
});

test('Enter adds lines to wrapped text; Escape and Enter leave input composition alone',()=>{
  const h=harness('reading'),node=h.start();
  assert.equal(node.attributes['aria-multiline'],'true');assert.equal(h.key(node,'Enter').prevented,undefined);assert.equal(h.active(),true);
  assert.equal(h.key(node,'Escape',{isComposing:true}).prevented,undefined);assert.equal(h.active(),true);
  node.innerText='First\nSecond';h.key(node,'Enter',{metaKey:true});assert.equal(h.entry.text,'First\nSecond');
});

test('a redraw or page close saves the text once, and a page change leaves old edits behind',()=>{
  for(const finish of [h=>h.sandbox.renderPhone(),h=>h.windowListeners.get('beforeunload')()]){
    const h=harness(),node=h.start();node.innerText='Saved';finish(h);h.sandbox.finishCanvasTextEdit();
    assert.equal(h.entry.text,'Saved');assert.equal(h.history.length,1);
  }
  const h=harness(),node=h.start();node.innerText='Old edit';h.sandbox.state={items:[{...h.entry,text:'New page'}]};node.onblur();
  assert.equal(h.sandbox.state.items[0].text,'New page');assert.equal(h.history.length,0);
});

test('two clicks open text even when a resize grip appears after the first click',()=>{
  const h=harness();h.sandbox.rememberCanvasTextClick({textId:'one',moved:false},h.event({timeStamp:100}));
  assert.equal(h.sandbox.tryCanvasTextEdit(h.event(),h.entry),true);const node=vm.runInContext('canvasTextEdit.node',h.sandbox);
  h.stageListeners.get('dblclick')(h.event({target:{closest:()=>h.itemNode}}));
  assert.equal(vm.runInContext('canvasTextEdit.node',h.sandbox),node);assert.equal(h.sandbox.redraws,0);assert.equal(h.active(),true);
});

test('drags, slow clicks, other items, modifiers and the selection tool do not start text editing',()=>{
  for(const [gesture,options,rectangle] of [
    [{moved:true},{},false],[{moved:false},{timeStamp:800},false],[{moved:false},{clientX:30},false],
    [{moved:false},{shiftKey:true},false],[{moved:false},{},true],
  ]){
    const h=harness();h.sandbox.rememberCanvasTextClick({textId:'one',...gesture},h.event({timeStamp:100}));h.sandbox.rectangleSelectionArmed=rectangle;
    assert.equal(h.sandbox.tryCanvasTextEdit(h.event(options),h.entry),false);assert.equal(h.active(),false);
  }
  for(const kind of ['shape','icon','image'])assert.equal(harness(kind).start(),undefined);
});
