const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, 'image-drop.js'), 'utf8');
const helpers = source.split('// BEGIN PICTURE HELPERS')[1].split('// END PICTURE HELPERS')[0];
const sizes = source.split('// BEGIN PAGE SIZE HELPERS')[1].split('// END PAGE SIZE HELPERS')[0];
const reader = source.split('// BEGIN PICTURE READER')[1].split('// END PICTURE READER')[0];
const context = vm.createContext({
  round: v => Math.round(v * 10) / 10,
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  atob,
});
vm.runInContext(helpers + sizes, context);
const run = code => JSON.parse(JSON.stringify(vm.runInContext(code, context)));

test('new page uses the picture size and includes no old items', () => {
  const plan = run('pictureDropPlan([{width:903,height:552}],"new",{width:393,height:852,background:"#000000"},{x:100,y:100})');
  assert.equal(plan.replace, true);
  assert.deepEqual(plan.canvas, { width: 903, height: 552, background: '#000000', picturePage: true, picturePageSize: { width: 903, height: 552 } });
  assert.deepEqual(plan.boxes, [{ x: 0, y: 0, w: 903, h: 552 }]);
});
test('add to page keeps the current canvas and fits the picture inside it', () => {
  const plan = run('pictureDropPlan([{width:903,height:552}],"add",{width:393,height:852,background:"#123456"},{x:200,y:400})');
  assert.equal(plan.replace, false);
  assert.deepEqual(plan.canvas, { width: 393, height: 852, background: '#123456' });
  assert.ok(plan.boxes[0].w <= 393);
});
test('a new page holds several pictures without placing one over another', () => {
  const plan = run('pictureDropPlan([{width:800,height:400},{width:400,height:300}],"new",{width:393,height:852},{x:0,y:0})');
  assert.deepEqual([plan.canvas.width, plan.canvas.height], [800, 700]);
  assert.deepEqual(plan.boxes, [{ x: 0, y: 0, w: 800, h: 400 }, { x: 200, y: 400, w: 400, h: 300 }]);
  assert.deepEqual(plan.canvas.picturePageSize,{width:800,height:700});
});

test('a picture can switch to every preset and back to its page size', () => {
  for(const phone of ['393,852','402,874','440,956','768,1024','1440,900','1920,1080','1080,1080','794,1123']){
    const result=run(`(()=>{
      const layout={canvas:{width:903,height:552,picturePage:true},items:[{x:0,y:0,w:903,h:552},{x:100,y:100,w:160,h:70}]};
      setPageSize(layout,${JSON.stringify(phone)});const phoneChoices=pageSizeChoices(layout),phoneMode=Boolean(layout.canvas.picturePage);
      setPageSize(layout,'page');return {layout,phoneChoices,phoneMode};
    })()`);
    assert.equal(result.phoneMode,false);
    assert.deepEqual(result.phoneChoices.options[0],{value:'page',text:'Page · 903 × 552'});
    assert.equal(result.phoneChoices.value,phone);
    assert.deepEqual(result.layout.canvas,{width:903,height:552,picturePage:true,picturePageSize:{width:903,height:552}});
    assert.deepEqual(result.layout.items[0],{x:0,y:0,w:903,h:552});
    for(const key of ['x','y','w','h'])assert.ok(Math.abs(result.layout.items[1][key]-{x:100,y:100,w:160,h:70}[key])<=.2);
  }
});
test('the page option survives saving and reloading while a phone size is active', () => {
  assert.deepEqual(run(`(()=>{
    const layout={canvas:{width:800,height:500,picturePage:true},items:[]};setPageSize(layout,'402,874');
    const saved=JSON.parse(JSON.stringify(layout));setPageSize(saved,'page');return [pageSizeChoices(saved).value,saved.canvas];
  })()`),['page',{width:800,height:500,picturePage:true,picturePageSize:{width:800,height:500}}]);
});
test('a picture with phone dimensions still has separate Page and iPhone choices', () => {
  const choices=run('pageSizeChoices({canvas:{width:393,height:852,picturePage:true},items:[]})');
  assert.equal(choices.value,'page');assert.deepEqual(choices.options.slice(0,2).map(option=>option.value),['page','393,852']);
});
test('every draft offers phones, a tablet, a website, slides, a square, a page and a custom size', () => {
  const choices=run('pageSizeChoices({canvas:{width:393,height:852},items:[]})');
  assert.equal(choices.page,null);
  assert.deepEqual(choices.options.map(option=>option.value),['393,852','402,874','440,956','768,1024','1440,900','1920,1080','1080,1080','794,1123','custom']);
  assert.match(choices.options.find(option=>option.value==='1440,900').text,/Website/);
  const custom=run('pageSizeChoices({canvas:{width:2345,height:678},items:[]})');
  assert.equal(custom.value,'2345,678');
  assert.deepEqual(custom.options.at(-2),{value:'2345,678',text:'2345 × 678'});
});
test('custom sizes can keep item sizes and positions, and reject invalid sides', () => {
  const result=run(`(()=>{
    const layout={canvas:{width:393,height:852,background:'#fff'},items:[{x:-20,y:900,w:180,h:60}]};
    setPageSize(layout,'2345,678',false);return layout;
  })()`);
  assert.deepEqual(result.canvas,{width:2345,height:678,background:'#fff'});
  assert.deepEqual(result.items,[{x:-20,y:900,w:180,h:60}]);
  for(const value of ['0,20','1.5,20','16001,20','10,NaN','custom','-1,50']){
    assert.deepEqual(run(`(()=>{const layout=${JSON.stringify(result)};setPageSize(layout,${JSON.stringify(value)});return layout;})()`),result);
  }
  assert.ok(run('(()=>{const layout={canvas:{width:16000,height:16000},items:[{x:0,y:0,w:.1,h:.1}]};setPageSize(layout,"1,1");return layout.items[0].w;})()')>0);
});
test('only phone presets have rounded canvas edges', () => {
  for(const [width,height] of [[393,852],[402,874],[440,956]]){
    assert.equal(run(`isPhoneCanvas({width:${width},height:${height}})`),true);
    assert.equal(run(`isPhoneCanvas({width:${width},height:${height},picturePage:true})`),false);
  }
  for(const [width,height] of [[1440,900],[1080,1080],[2345,678],[794,1123]])assert.equal(run(`isPhoneCanvas({width:${width},height:${height}})`),false);
});
test('old picture pages recover their page size after a switch to a phone', () => {
  const header=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(header);header.write('IHDR',12);header.writeUInt32BE(903,16);header.writeUInt32BE(552,20);
  const src='data:image/png;base64,'+header.toString('base64');
  assert.deepEqual(run(`picturePageSizeFor({canvas:{width:393,height:852},items:[{imageBase:true,src:${JSON.stringify(src)},x:0,y:0,w:393,h:852}]})`),{width:903,height:552});
  assert.equal(run('storedPictureSize("data:image/png;base64,AAAA")'),null);
});

function sizePickerHarness(){
  const nodes=new Map(),history=[],listeners=new Map();
  const get=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'',checked:false,open:false,options:[],
      replaceChildren(){this.options=[];},append(option){this.options.push(option);},focus(){},select(){},
      reportValidity(){return this.valid!==false;},showModal(){this.open=true;},
      close(){this.open=false;this.onclose?.();},addEventListener(type,fn){this['on'+type]=fn;},
    });
    return nodes.get(id);
  };
  const sandbox=vm.createContext({$:get,round:value=>Math.round(value*10)/10,atob,
    state:{version:1,canvas:{width:393,height:852,background:'#fff'},items:[{x:10,y:20,w:100,h:60}]},
    canvasViewBusy:()=>false,canvasPan:null,canvasPinch:null,drag:null,pictureChoice:{open:false},
    clearCanvasRegion(){},document:{createElement:()=>({}),addEventListener(type,fn){listeners.set(type,fn);}},
  });
  const execute=code=>vm.runInContext(code,sandbox),plain=code=>JSON.parse(JSON.stringify(execute(code)));
  sandbox.change=fn=>{history.push(plain('state'));fn();execute('renderPageSizePicker($("page-size"))');};
  execute(helpers+sizes+source.split('// BEGIN PAGE SIZE PICKER')[1].split('// END PAGE SIZE PICKER')[0]);
  execute('renderPageSizePicker($("page-size"))');
  return {get,sandbox,history,listeners,plain,execute,
    open(){get('page-size').value='custom';get('page-size').onchange();},
    apply(width,height,resize=false){get('canvas-width').value=String(width);get('canvas-height').value=String(height);get('canvas-resize-items').checked=resize;get('canvas-size-form').onsubmit({preventDefault(){}});},
  };
}
test('custom size opens with the current size, applies once and can undo or cancel',()=>{
  const h=sizePickerHarness(),before=h.plain('state');h.open();
  assert.equal(h.get('canvas-size-dialog').open,true);
  assert.equal(h.get('canvas-width').value,393);assert.equal(h.get('canvas-height').value,852);
  assert.equal(h.get('page-size').value,'393,852');assert.equal(h.history.length,0);
  h.apply(2345,678);
  assert.equal(h.get('canvas-size-dialog').open,false);assert.equal(h.history.length,1);
  assert.deepEqual(h.plain('state.canvas'),{width:2345,height:678,background:'#fff'});
  assert.deepEqual(h.plain('state.items'),before.items);assert.equal(h.get('page-size').value,'2345,678');
  h.sandbox.state=h.history.pop();h.execute('renderPageSizePicker($("page-size"))');
  assert.deepEqual(h.plain('state'),before);
  h.open();h.get('canvas-width').value=500;h.get('canvas-size-cancel').onclick();
  assert.deepEqual(h.plain('state'),before);assert.equal(h.history.length,0);
  h.open();h.get('canvas-size-dialog').close();assert.deepEqual(h.plain('state'),before);
});
test('custom size can resize items and makes no change for the same or invalid size',()=>{
  const h=sizePickerHarness();h.open();h.apply(393,852);assert.equal(h.history.length,0);
  h.open();h.apply(0,500);assert.equal(h.get('canvas-size-dialog').open,true);assert.equal(h.history.length,0);
  h.apply(786,1704,true);assert.deepEqual(h.plain('state.items'),[{x:20,y:40,w:200,h:120}]);
  assert.equal(h.history.length,1);
  h.open();const next={canvas:{width:900,height:600},items:[]};h.sandbox.state=next;
  h.apply(1000,1000);assert.deepEqual(h.plain('state'),next);assert.equal(h.history.length,1);
});

const action = source.split('// BEGIN DROP ACTION')[1].split('// END DROP ACTION')[0];
function dropHarness(choice) {
  const history = [], reads = [];
  const start = { version: 1, canvas: { width: 393, height: 852, background: '#000000' }, items: [{ id: 'title', kind: 'label', text: 'Original' }] };
  let id = 0;
  const sandbox = vm.createContext({
    ...context, state: structuredClone(start), selected: new Set(), editing: true, scale: 1,
    picturesReady: Promise.resolve(), choosePictureDrop: async () => choice,
    readPicture: async file => { reads.push(file); return { name: file.name, src: 'data:image/png;base64,AAAA', width: 903, height: 552 }; },
    crypto: { randomUUID: () => String(++id) },
    item: (id, name, kind, x, y, w, h, extra) => ({ id, name, kind, x, y, w, h, ...extra }),
    $: id => id === 'stage' ? { classList: { remove() {} }, focus() {}, getBoundingClientRect: () => ({left:-500,top:-500,right:1000,bottom:1000}) } : id === 'phone' ? { getBoundingClientRect: () => ({ left: 0, top: 0, right: 393, bottom: 852 }) } : null,
    phonePoint:event=>({x:event.clientX,y:event.clientY}),canvasViewCenter:()=>({x:196.5,y:426}),resetCanvasView(){},
    notify() {},
  });
  sandbox.change = fn => { history.push(JSON.parse(JSON.stringify(sandbox.state))); fn(); };
  vm.runInContext(helpers + action, sandbox);
  sandbox.event = { dataTransfer: { files: [{ name: 'Screenshot.heic', type: 'image/heic' }] }, clientX: 100, clientY: 100, preventDefault() {} };
  return { start, history, reads, sandbox, drop: () => vm.runInContext('handlePictureDrop(event)', sandbox) };
}
test('cancel leaves the draft and undo history as they were', async () => {
  const harness = dropHarness(null); await harness.drop();
  assert.deepEqual(JSON.parse(JSON.stringify(harness.sandbox.state)), harness.start);
  assert.equal(harness.history.length, 0);
  assert.equal(harness.reads.length, 0);
});
test('new page replaces old items in one undo step', async () => {
  const harness = dropHarness('new'); await harness.drop();
  assert.equal(harness.history.length, 1);
  assert.deepEqual(harness.history[0], harness.start);
  assert.equal(harness.sandbox.state.items.length, 1);
  assert.equal(harness.sandbox.state.items[0].kind, 'image');
  assert.equal(harness.sandbox.state.canvas.width, 903);
});
test('add to page keeps the old items', async () => {
  const harness = dropHarness('add'); await harness.drop();
  assert.equal(harness.sandbox.state.items.length, 2);
  assert.equal(harness.sandbox.state.items[0].id, 'title');
  assert.equal(harness.sandbox.state.canvas.width, 393);
});
test('a picture dropped outside the page keeps that spot and one undo step', async () => {
  const h=dropHarness('add');h.sandbox.event.clientX=750;h.sandbox.event.clientY=-200;
  await h.drop();const entry=h.sandbox.state.items[1];
  assert.ok(entry.x>393);assert.ok(entry.y<0);
  assert.ok(Math.abs(entry.x+entry.w/2-750)<.1);assert.ok(Math.abs(entry.y+entry.h/2+200)<.1);
  assert.equal(h.history.length,1);assert.deepEqual(h.history[0],h.start);
});

test('HEIC drops work with a macOS file type or just a file name', () => {
  for (const file of [
    { name: 'Screenshot.heic', type: 'image/heic' },
    { name: 'Screenshot.HEIC', type: '' },
    { name: 'Photo.heif', type: 'application/octet-stream' },
    { name: 'Photo', type: 'image/heif-sequence' },
  ]) assert.equal(run(`pictureType(${JSON.stringify(file)})`), 'image/heic');
  assert.equal(run('pictureType({name:"Screenshot.PNG",type:""})'), 'image/png');
  assert.equal(run('pictureType({name:"notes.txt",type:"text/plain"})'), null);
});
test('a large picture fits without changing its shape', () => {
  const box = run('picturePlacement(1600,800,{width:400,height:800},{x:200,y:400})');
  assert.deepEqual(box, { w: 360, h: 180, x: 20, y: 310 });
});
test('pictures keep their drop spot across page edges', () => {
  assert.deepEqual(run('picturePlacement(100,50,{width:400,height:800},{x:0,y:800})'), { w: 100, h: 50, x: -50, y: 775 });
  assert.deepEqual(run('picturePlacement(100,50,{width:400,height:800},{x:400,y:0},3)'), { w: 100, h: 50, x: 386, y: 11 });
});
test('a very thin picture still has a width after fitting', () => {
  assert.equal(run('picturePlacement(1,16000,{width:393,height:852},{x:100,y:100})').w, .1);
});
test('copies accept embedded PNG pictures and reject active or remote sources', () => {
  assert.equal(run('safePictureSource("data:image/png;base64,AAAA")'), true);
  for (const value of ['https://example.com/picture.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,AAAA']) assert.equal(run(`safePictureSource(${JSON.stringify(value)})`), false);
});
test('HEIC uses the included reader when the browser cannot open it', async () => {
  const calls = [], image = { naturalWidth: 903, naturalHeight: 552 };
  const sandbox = vm.createContext({
    Blob,
    pictureType: () => 'image/heic',
    pictureDeadline: promise => promise,
    loadPictureBlob: async blob => { if (blob.type !== 'image/png') throw new Error('No native HEIC support'); return image; },
    HeicTo: async options => { calls.push(options); return new Blob(['png'], { type: 'image/png' }); },
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/png;base64,AAAA' }) },
    file: new Blob(['heic'], { type: 'image/heic' }),
  });
  vm.runInContext(reader, sandbox);
  const result = await vm.runInContext('readPicture(file)', sandbox);
  assert.deepEqual([result.width, result.height, result.src], [903, 552, 'data:image/png;base64,AAAA']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'image/png');
});
test('a bad HEIC file gives a clear error', async () => {
  const sandbox = vm.createContext({
    Blob, pictureType: () => 'image/heic', pictureDeadline: promise => promise,
    loadPictureBlob: async () => { throw new Error('Bad picture'); },
    HeicTo: async () => { throw new Error('Bad HEIC'); }, file: new Blob(['bad'], { type: 'image/heic' }),
  });
  vm.runInContext(reader, sandbox);
  await assert.rejects(vm.runInContext('readPicture(file)', sandbox), /Could not open this HEIC picture/);
});
test('the main page and saved copies keep a working HEIC reader', async () => {
  const pages = ['../index.html', ...readdirSync(join(__dirname, '../drafts'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => '../drafts/' + entry.name + '/index.html')];
  const vendor = readFileSync(join(__dirname, 'vendor/heic-to-1.6.6.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  for (const page of pages) {
    const html = readFileSync(join(__dirname, page), 'utf8');
    const included = html.match(/<script data-vendor="heic-to"[^>]*>\n([\s\S]*?)\n<\/script>/)[1];
    let workerBlob;
    const stopped = new Error('Worker captured');
    const sandbox = vm.createContext({
      Blob,
      URL: { createObjectURL(blob) { workerBlob = blob; return 'blob:test'; } },
      Worker: class { constructor() { throw stopped; } },
    });
    vm.runInContext(included, sandbox);
    await assert.rejects(sandbox.HeicTo({ blob: new Blob(['heic']), type: 'image/png' }), error => error === stopped);
    assert.ok(workerBlob, page + ': HEIC reader must create its worker.');
    try { new vm.Script(await workerBlob.text()); }
    catch (error) { assert.fail(page + ': HEIC reader could not start: ' + error.message); }
    assert.ok(included === vendor, page + ': Keep the HEIC reader unchanged.');
  }
});
for (const page of readdirSync(join(__dirname, '../drafts'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)) {
  test(page + ': saved copies keep the drop tools and HEIC reader', () => {
    const html = readFileSync(join(__dirname, '../drafts', page, 'index.html'), 'utf8');
    assert.equal(html.split('// BEGIN PICTURE DROP\n')[1].split('// END PICTURE DROP')[0].trimEnd(), source.trimEnd());
    assert.ok(html.includes('<script data-vendor="heic-to"'));
    assert.ok(html.includes('data-license="heic-to"'));
    assert.equal(html.split('id="picture-drop-choice"').length - 1, 1);
    const choice = html.match(/<dialog id="picture-drop-choice"[\s\S]*?<\/dialog>/)[0];
    assert.deepEqual(choice.replace(/<[^>]*>/g, ' ').trim().split(/\s{2,}/), ['Open file', 'New project', 'Add to project']);
    assert.ok(html.includes("renderPageSizePicker($('page-size'));"));
    assert.equal(html.includes('preset.onchange=()=>{const [w,h]=preset.value.split'),false);
    new vm.Script(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
  });
}
