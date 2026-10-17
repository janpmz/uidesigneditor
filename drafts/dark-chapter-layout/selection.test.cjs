const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const geometry = script.split('// BEGIN SELECTION GEOMETRY')[1].split('// END SELECTION GEOMETRY')[0];
const context = vm.createContext({});
vm.runInContext('const round=v=>Math.round(v*10)/10;const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));' + geometry, context);
const run = source => JSON.parse(JSON.stringify(vm.runInContext(source, context)));

test('drawing in either direction selects the same fully enclosed items', () => {
  assert.deepEqual(run(`(()=>{
    const items=[{id:'title',x:30,y:280,w:270,h:28},{id:'number',x:5,y:280,w:20,h:20},{id:'next',x:30,y:340,w:270,h:28},{id:'hidden',x:30,y:280,w:20,h:20,hidden:true}];
    const a={x:25,y:275},b={x:310,y:320};
    return [itemsInBox(items,boxBetween(a,b)),itemsInBox(items,boxBetween(b,a))];
  })()`), [['title'], ['title']]);
});

test('a rectangle can enclose a whole list without selecting its large background', () => {
  assert.deepEqual(run(`itemsInBox([
    {id:'background',x:0,y:0,w:393,h:852},
    {id:'row1',x:28,y:283,w:337,h:48},
    {id:'row2',x:28,y:343,w:337,h:48},
    {id:'divider',x:28,y:257,w:337,h:1}
  ],{x:20,y:275,w:353,h:120})`), ['row1', 'row2']);
});

test('moving a group past the top and left edges keeps its spacing', () => {
  assert.deepEqual(run(`(()=>{
    const items=[{x:28,y:283,w:24,h:24},{x:62,y:279,w:270,h:28}];
    moveWithin(items,-200,-400,{width:393,height:852});return items;
  })()`), [{x:-172,y:-117,w:24,h:24},{x:-138,y:-121,w:270,h:28}]);
});

test('a group can move past the bottom and right edges', () => {
  assert.deepEqual(run(`(()=>{
    const items=[{x:28,y:283,w:24,h:24},{x:62,y:339,w:270,h:28}];
    moveWithin(items,900,900,{width:393,height:852});return items;
  })()`), [{x:928,y:1183,w:24,h:24},{x:962,y:1239,w:270,h:28}]);
});

test('selection and repeated small group moves retain the supplied positions', () => {
  assert.deepEqual(run(`(()=>{
    const items=[{id:'a',x:29.3,y:257,w:337,h:1},{id:'b',x:62,y:283,w:270,h:28}];
    itemsInBox(items,{x:0,y:250,w:393,h:100});
    moveWithin(items,.1,.1,{width:393,height:852});moveWithin(items,-.1,-.1,{width:393,height:852});return items;
  })()`), [{id:'a',x:29.3,y:257,w:337,h:1},{id:'b',x:62,y:283,w:270,h:28}]);
});
