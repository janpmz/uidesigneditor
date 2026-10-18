const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const code = readFileSync(join(__dirname, 'item-inspector.js'), 'utf8').split('function field(')[0];
function harness() {
  class Node {
    constructor(tag) { this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.className=''; }
    get isConnected() { return this.root||Boolean(this.parent?.isConnected); }
    get classList() { return { toggle: (name,on) => { const names=new Set(this.className.split(' ').filter(Boolean));on?names.add(name):names.delete(name);this.className=[...names].join(' '); } }; }
    append(...nodes) { for(const node of nodes){node.parent=this;this.children.push(node);} }
    replaceChildren() { for(const node of this.children)node.parent=null;this.children=[]; }
    replaceWith(node) { const parent=this.parent;parent.children.splice(parent.children.indexOf(this),1,node);node.parent=parent;this.parent=null; }
    setAttribute(key,value) { this.attributes[key]=value; }
    querySelector(selector) { return this.children.find(node=>node.className.split(' ').includes(selector.slice(1)))||null; }
    focus() { this.focused=true; }
    select() { this.selected=true; }
  }
  const layers=new Node('div');layers.root=true;
  const items=[{id:'one',name:'Heading',text:'Hello',x:10},{id:'two',name:'Box',hidden:true,x:20}];
  const history=[],state={items},selected=new Set();
  let saved=0;
  const sandbox=vm.createContext({state,selected,document:{createElement:tag=>new Node(tag)},
    $:id=>id==='layers'?layers:{},showInspectorTab(){},renderPhone(){},renderInspector(){},
    remember(){history.push(structuredClone(state));},save(){saved++;},
    change(fn){history.push(structuredClone(state));fn();},
  });
  vm.runInContext(code+'\nrenderLayers();',sandbox);
  const row=id=>layers.children.find(node=>node.dataset.id===id);
  const button=id=>row(id).querySelector('.layer-name');
  const input=id=>row(id).querySelector('.layer-rename');
  const key=(node,key)=>node.onkeydown({key,preventDefault(){},stopPropagation(){}});
  const doubleClick=id=>{const name=button(id);name.onclick({detail:1});name.onclick({detail:2});name.ondblclick();return input(id);};
  return {state,get selected(){return sandbox.selected;},history,layers,row,button,input,key,doubleClick,saved:()=>saved};
}

test('double-click keeps the row in place, and Enter renames it in one Undo step',()=>{
  const h=harness(),row=h.row('one'),input=h.doubleClick('one');
  assert.equal(h.row('one'),row);assert.equal(input.selected,true);assert.deepEqual([...h.selected],['one']);
  input.value='  Main heading  ';h.key(input,'Enter');input.onblur();
  assert.equal(h.state.items[0].name,'Main heading');assert.equal(h.state.items[0].text,'Hello');assert.equal(h.state.items[0].x,10);
  assert.equal(h.button('one').textContent,'Main heading');assert.equal(h.button('one').focused,true);
  assert.equal(h.history.length,1);assert.equal(h.history[0].items[0].name,'Heading');assert.equal(h.saved(),1);
});

test('Escape, blank names and unchanged names leave the name and Undo alone',()=>{
  for(const [value,key] of [['Other','Escape'],['   ','Enter'],['Heading','Enter']]){
    const h=harness(),input=h.doubleClick('one');input.value=value;h.key(input,key);input.onblur();
    assert.equal(h.state.items[0].name,'Heading');assert.equal(h.history.length,0);assert.equal(h.saved(),0);
  }
});

test('clicking away saves the name and leaves the next item ready to select',()=>{
  const h=harness(),next=h.button('two'),input=h.doubleClick('one');input.value='Title';input.onblur();
  assert.equal(h.button('two'),next);next.onclick({detail:1});
  assert.deepEqual([...h.selected],['two']);assert.equal(h.state.items[0].name,'Title');assert.equal(h.history.length,1);
  assert.equal(h.row('one').querySelector('.layer-state').attributes['aria-label'],'Hide Title');
});

test('F2 renames hidden items, while a redraw cancels a stale name field',()=>{
  const h=harness();h.key(h.button('two'),'F2');const input=h.input('two');input.value='Hidden box';h.key(input,'Enter');
  assert.equal(h.state.items[1].hidden,true);assert.equal(h.state.items[1].name,'Hidden box');
  assert.equal(h.row('two').querySelector('.layer-state').attributes['aria-label'],'Restore Hidden box');
  const stale=h.doubleClick('one');stale.value='Old edit';h.layers.replaceChildren();stale.onblur();
  assert.equal(h.state.items[0].name,'Heading');assert.equal(h.history.length,1);
});
