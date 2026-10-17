const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const script = readFileSync(join(__dirname, 'index.html'), 'utf8').match(/<script>\s*([\s\S]*?)<\/script>/)[1];
new vm.Script(script);

function harness(items) {
  let id = 0;
  const geometry = script.split('// BEGIN SELECTION GEOMETRY')[1].split('// END SELECTION GEOMETRY')[0];
  const clipboard = script.split('// BEGIN ITEM CLIPBOARD')[1].split('// END ITEM CLIPBOARD')[0];
  const context = vm.createContext({
    initial: structuredClone(items), crypto: { randomUUID: () => String(++id) },
  });
  vm.runInContext(`
    const copy=value=>JSON.parse(JSON.stringify(value));
    const round=value=>Math.round(value*10)/10;
    const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    const state={canvas:{width:393,height:852},items:initial};
    let selected=new Set(initial.map(entry=>entry.id));
    const history=[];
    function selectedItems(){return state.items.filter(entry=>selected.has(entry.id)&&!entry.hidden);}
    function change(fn){history.push(copy(state));fn();}
    function notify(){}
    ${geometry}
    ${clipboard}
  `, context);
  return source => JSON.parse(JSON.stringify(vm.runInContext(source, context)));
}

const item = (id, x, y, extra = {}) => ({ id, name: id, kind: 'label', x, y, w: 80, h: 24, text: 'Hello', ...extra });

test('the selection box includes partial overlaps and larger items behind it', () => {
  const run = harness([
    item('title', 20, 100), item('date', 20, 140),
    item('background', 0, 0, { w: 393, h: 852 }),
    item('outside', 120, 100), item('hidden', 20, 100, { hidden: true }),
  ]);
  assert.deepEqual(run('itemsInBox(state.items,{x:5,y:90,w:20,h:60})'), ['title', 'date', 'background']);
});

test('touching an edge or corner selects the item, while a gap does not', () => {
  const run = harness([item('edge', 30, 100), item('corner', 30, 120), item('apart', 30.1, 100)]);
  assert.deepEqual(run('itemsInBox(state.items,{x:10,y:80,w:20,h:40})'), ['edge', 'corner']);
});

test('a partial overlap selects the same items when drawing in either direction', () => {
  const run = harness([item('title', 20, 100), item('date', 20, 140)]);
  assert.deepEqual(run('itemsInBox(state.items,boxBetween({x:5,y:90},{x:25,y:150}))'), ['title', 'date']);
  assert.deepEqual(run('itemsInBox(state.items,boxBetween({x:25,y:150},{x:5,y:90}))'), ['title', 'date']);
});

test('copy keeps its own copy of the items, even after the original changes', () => {
  const run = harness([item('title', 28, 100, { color: '#a78bfa' })]);
  run('copySelectedItems(); state.items[0].text="Changed"; pasteCopiedItems(itemClipboard); state.items');
  assert.deepEqual(run('state.items.map(entry=>[entry.text,entry.color])'), [['Changed', '#a78bfa'], ['Hello', '#a78bfa']]);
});

test('pasting a group keeps its spacing and selects fresh copies in one undo step', () => {
  const run = harness([item('title', 28, 100), item('date', 28, 140)]);
  run('copySelectedItems(); pasteCopiedItems(itemClipboard); state.items');
  assert.deepEqual(run('state.items.slice(2).map(entry=>[entry.x,entry.y])'), [[40, 112], [40, 152]]);
  assert.deepEqual(run('[...selected]'), ['item-1', 'item-2']);
  assert.equal(run('history.length'), 1);
  assert.equal(run('history[0].items.length'), 2);
});

test('repeated paste offsets copies and gives every item its own identity', () => {
  const run = harness([item('title', 28, 100)]);
  assert.deepEqual(run('copySelectedItems(); pasteCopiedItems(itemClipboard); pasteCopiedItems(itemClipboard); state.items.map(entry=>[entry.id,entry.x,entry.y])'), [
    ['title', 28, 100], ['item-1', 40, 112], ['item-2', 52, 124],
  ]);
});

test('a pasted group can cross the page edge without changing its spacing', () => {
  const run = harness([item('one', 290, 790), item('two', 310, 825)]);
  assert.deepEqual(run('copySelectedItems(); pasteCopiedItems(itemClipboard); state.items.slice(2).map(entry=>[entry.x,entry.y])'), [[302, 802], [322, 837]]);
});

test('clipboard data round trips and rejects text, whole layouts, and invalid sizes', () => {
  const run = harness([item('button', 28, 100, { kind: 'button', icon: 'play-outline' })]);
  assert.equal(run('readCopiedItems(copySelectedItems())[0].icon'), 'play-outline');
  for (const text of ['hello', '{bad', JSON.stringify({ version: 1, items: [] }), JSON.stringify({ type: 'layout-items', version: 1, items: [item('bad', 0, 0, { w: -1 })] })]) {
    assert.equal(run(`readCopiedItems(${JSON.stringify(text)})`), null);
  }
});

test('text field targets keep their normal copy and paste behavior', () => {
  const run = harness([]);
  assert.equal(run('textFieldTarget({closest:()=>({tagName:"INPUT"})})'), true);
  assert.equal(run('textFieldTarget({closest:()=>null})'), false);
  assert.equal(run('textFieldTarget(null)'), false);
});
