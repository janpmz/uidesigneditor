const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const code = readFileSync(join(__dirname, 'projects.js'), 'utf8');
const page = readFileSync(join(__dirname, '../index.html'), 'utf8');
const pictureCode = readFileSync(join(__dirname, 'image-drop.js'), 'utf8');
const saveCode = page.match(/^function save\(\)[^\n]+/m)[0];
const pictureSaveCode = pictureCode.match(/function savePictureDraft\(localSaved\)\{[\s\S]*?\n\}/)[0];
const layout = text => ({ version: 1, canvas: { width: 393, height: 852 }, items: [{ id: 'text', text }] });
const playerKey = 'dark-player-layout-v2:/drafts/dark-player-layout/';
const libraryKey = 'dark-library-layout-v2:/drafts/dark-library-layout/';

function harness({ stored = new Map(), database = new Map(), pathname = '/', data, embedded = null, blocked = false } = {}) {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', value: 'fit', open: false, attributes: {}, dataset: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      close() { this.open = false; },
    });
    return nodes.get(id);
  };
  get('initial-projects').textContent = JSON.stringify(data || { version: 1, active: 'player', projects: [{ id: 'player', name: 'Player', layout: null }, { id: 'library', name: 'Library', layout: layout('Library') }] });
  get('initial-layout').textContent = JSON.stringify(embedded);
  const buttons = ['player', 'library'].map(id => { const button = get('project-' + id);button.dataset.project = id;return button; });
  const sandbox = vm.createContext({ $, document: { querySelectorAll: () => buttons, querySelector: () => get('canvas') },
    location: { pathname }, original: () => layout('Player'), validEditorPage: value => value?.version === 1 && value.canvas && Array.isArray(value.items),
    localStorage: { getItem(key) { if (blocked) throw Error('Blocked');return stored.get(key) || null; }, setItem(key, value) { if (blocked) throw Error('Full');stored.set(key, value); } },
    pictureDB: { transaction: () => ({ objectStore: () => ({
      get(key) { const request = {};queueMicrotask(() => { request.result = structuredClone(database.get(key));request.onsuccess(); });return request; },
      put(value, key) { database.set(key, structuredClone(value)); },
    }) }) },
    notify: message => { sandbox.message = message; },
    stage: { focus() {} }, canvasView: { x: 0, y: 0 }, canvasViewBusy: () => false,
    clearCanvasRegion() {}, closeCanvasMenu() {}, closeItemMenu() {}, resetCanvasView: () => { get('zoom').value = 'fit'; },
  });
  function $(id) { return get(id); }
  vm.runInContext(`
    const copy=value=>JSON.parse(JSON.stringify(value));
    ${code}
    let state=localProjectLayout(activeProject),history=[],future=[],selected=new Set(),scale=1,editing=true,fieldEdit=null;
    let imageEditSession=null,canvasPan=null,canvasPinch=null,drag=null,pictureChoice={open:false};
    let pictureStoreReady=true,pictureSaved='',pictureSaveWarning=false,pictureLocalSaved=true;
    function warnPictureSave(){}
    ${pictureSaveCode}
    ${saveCode}
    function render(){save();renderProjects();}
    const picturesReady=Promise.resolve();
    render();
    const projectsReady=initializeProjects();
  `, sandbox);
  const run = source => vm.runInContext(source, sandbox);
  return { get, stored, database, sandbox, run, ready: run('projectsReady'), json: source => JSON.parse(JSON.stringify(run(source))) };
}

test('both projects start in the browser and use the old draft keys', async () => {
  const h = harness();await h.ready;
  assert.equal(JSON.parse(h.stored.get(playerKey)).items[0].text, 'Player');
  assert.equal(JSON.parse(h.stored.get(libraryKey)).items[0].text, 'Library');
  assert.equal(h.database.size, 2);
  assert.equal(h.get('project-player').attributes['aria-current'], 'page');
  assert.equal(h.get('project-library').attributes['aria-current'], undefined);
  assert.equal(h.run('projectStorage("library")'), libraryKey);
  const oldAddress = harness({ pathname: '/drafts/dark-player-layout/' });await oldAddress.ready;
  assert.equal(oldAddress.run('STORAGE'), playerKey);
  const indexAddress = harness({ pathname: '/index.html' });await indexAddress.ready;
  assert.equal(indexAddress.run('STORAGE'), playerKey);
  const savedFile = harness({ pathname: '/saved.html', stored: new Map([['dark-player-layout-v2:/saved.html', JSON.stringify(layout('Saved file edits'))]]) });await savedFile.ready;
  assert.equal(savedFile.run('state.items[0].text'), 'Saved file edits');
});

test('switching keeps each project’s edits, undo steps, selection and view', async () => {
  const h = harness();await h.ready;
  h.run('state.items[0].text="My player";history.push("player undo");future.push("player redo");selected.add("text");canvasView.x=123;save();');
  await h.run('switchProject("library")');
  assert.equal(h.run('state.items[0].text'), 'Library');
  assert.deepEqual(h.json('history'), []);
  assert.equal(h.get('project-library').attributes['aria-current'], 'page');
  h.run('state.items[0].text="My library";history.push("library undo");save();');
  await h.run('switchProject("player")');
  assert.equal(h.run('state.items[0].text'), 'My player');
  assert.deepEqual(h.json('history'), ['player undo']);
  assert.deepEqual(h.json('future'), ['player redo']);
  assert.deepEqual(h.json('[...selected]'), ['text']);
  assert.equal(h.run('canvasView.x'), 123);
  await h.run('switchProject("library")');
  assert.equal(h.run('state.items[0].text'), 'My library');
  assert.deepEqual(h.json('history'), ['library undo']);
  assert.equal(h.database.get(playerKey).items[0].text, 'My player');
  assert.equal(h.database.get(libraryKey).items[0].text, 'My library');
});

test('reload opens the last project and keeps edits from the old library page', async () => {
  const stored = new Map([[libraryKey, JSON.stringify(layout('Old library edits'))]]);
  const h = harness({ stored });await h.ready;await h.run('switchProject("library")');
  assert.equal(h.run('state.items[0].text'), 'Old library edits');
  const next = harness({ stored });await next.ready;
  assert.equal(next.run('activeProject'), 'library');
  assert.equal(next.run('state.items[0].text'), 'Old library edits');
});

test('large pictures saved by the old library page survive the move to Projects', async () => {
  const picture = layout('Library with a picture');picture.items.push({ id: 'image', kind: 'image', src: 'data:image/png;base64,AAAA' });
  const h = harness({ database: new Map([[libraryKey, picture]]) });await h.ready;
  await h.run('switchProject("library")');
  assert.deepEqual(h.json('state'), picture);
  assert.deepEqual(JSON.parse(h.stored.get(libraryKey)), picture);
});

test('switching waits for saved projects and stops during an image edit or move', async () => {
  const h = harness({ database: new Map([[libraryKey, layout('Saved library')]]) });
  await h.run('switchProject("library")');
  assert.equal(h.run('state.items[0].text'), 'Saved library');
  h.run('imageEditSession={};renderProjects();');
  assert.equal(h.get('project-player').disabled, true);
  await h.run('switchProject("player")');
  assert.equal(h.run('activeProject'), 'library');
  h.run('imageEditSession=null;drag={};');await h.run('switchProject("player")');
  assert.equal(h.run('activeProject'), 'library');
});

test('Copy HTML keeps both projects and opens the chosen project in a separate file', async () => {
  const h = harness();await h.ready;
  h.run('state.items[0].text="My player";');await h.run('switchProject("library")');
  h.run('state.items[0].text="My library </script>";');
  const output = { textContent: '' };h.sandbox.exportDoc = { querySelector: () => output };
  h.run('exportProjects(exportDoc)');
  assert.doesNotMatch(output.textContent, /<\/script>/);
  const data = JSON.parse(output.textContent);
  assert.equal(data.active, 'library');
  const saved = harness({ pathname: '/saved.html', data, embedded: layout('My library </script>') });await saved.ready;
  assert.equal(saved.run('activeProject'), 'library');
  assert.equal(saved.run('state.items[0].text'), 'My library </script>');
  await saved.run('switchProject("player")');
  assert.equal(saved.run('state.items[0].text'), 'My player');
  assert.notEqual(saved.run('STORAGE'), playerKey);
});

test('projects still switch when the browser’s small text store is full', async () => {
  const h = harness({ blocked: true });await h.ready;
  h.run('state.items[0].text="My player";');await h.run('switchProject("library")');await h.run('switchProject("player")');
  assert.equal(h.run('state.items[0].text'), 'My player');
  assert.equal(h.database.get(playerKey).items[0].text, 'My player');
});

test('the home page contains both projects and the same project code', () => {
  assert.equal(page.split('// BEGIN LOCAL PROJECTS\n')[1].split('// END LOCAL PROJECTS')[0].trim(), code.trim());
  const data = JSON.parse(page.match(/id="initial-projects">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.projects.map(project => project.name), ['Player', 'Library']);
  assert.ok(data.projects[1].layout.items.some(item => item.id === 'page-title' && item.text === 'Library'));
});
