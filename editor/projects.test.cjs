const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const code = readFileSync(join(__dirname, 'projects.js'), 'utf8');
const page = readFileSync(join(__dirname, '../index.html'), 'utf8');
const pictureCode = readFileSync(join(__dirname, 'image-drop.js'), 'utf8');
const saveCode = page.match(/^function save\(\)[^\n]+/m)[0];
const pictureHelpers = pictureCode.split('// BEGIN PICTURE HELPERS')[1].split('// END PICTURE HELPERS')[0];
const dropCode = pictureCode.split('// BEGIN DROP ACTION')[1].split('// END DROP ACTION')[0];
const pictureStoreCode = pictureCode.slice(pictureCode.indexOf('// Keep large pictures'));
const layout = text => ({ version: 1, canvas: { width: 393, height: 852 }, items: [{ id: 'text', text }] });
const playerKey = 'dark-player-layout-v2:/drafts/dark-player-layout/';
const libraryKey = 'dark-library-layout-v2:/drafts/dark-library-layout/';
const listKey = 'ui-design-editor-projects-v1:/';

function harness({ stored = new Map(), database = new Map(), pathname = '/', data, embedded = null, blocked = false, full = false } = {}) {
  const buttons = [];
  function node() {
    return { textContent: '', value: 'fit', open: false, attributes: {}, dataset: {}, children: [],
      classList: { remove() {} }, focus() {}, getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 1000 }),
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      close() { this.open = false; },
      append(child) { this.children.push(child);if(child.dataset.project)buttons.push(child); },
      querySelector(selector) { return selector === 'svg' ? null : this.children[0]; },
      querySelectorAll() { return buttons; },
    };
  }
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, node());
    return nodes.get(id);
  };
  get('initial-projects').textContent = JSON.stringify(data || { version: 1, active: 'player', projects: [{ id: 'player', name: 'Player', layout: null }, { id: 'library', name: 'Library', layout: layout('Library') }] });
  get('initial-layout').textContent = JSON.stringify(embedded);
  for(const id of ['player', 'library']){const button = get('project-' + id);button.dataset.project = id;button.append(node());buttons.push(button);}
  const db = { transaction: () => ({ objectStore: () => ({
    get(key) { const request = {};queueMicrotask(() => { request.result = structuredClone(database.get(key));request.onsuccess(); });return request; },
    put(value, key) { database.set(key, structuredClone(value)); },
  }) }) };
  let nextId = 0;
  const sandbox = vm.createContext({ $, document: { querySelectorAll: () => buttons, querySelector: selector => get(selector === '#editor-pages .project-page-list' ? 'project-list' : 'canvas'), createElement: node },
    location: { pathname }, original: () => layout('Player'), validEditorPage: value => value?.version === 1 && value.canvas && Array.isArray(value.items),
    localStorage: { getItem(key) { if (blocked) throw Error('Blocked');return stored.get(key) || null; }, setItem(key, value) { if (blocked || full) throw Error('Full');stored.set(key, value); } },
    indexedDB: { open() { const request = {};queueMicrotask(() => { request.result = db;request.onsuccess(); });return request; } },
    crypto: { randomUUID: () => String(++nextId) }, round: value => Math.round(value * 10) / 10,
    choosePictureDrop: async () => 'new',
    readPicture: async file => ({ name: file.name, src: 'data:image/png;base64,AAAA', width: 903, height: 552 }),
    readEditorPage: async () => layout('Imported page'),
    phonePoint: event => ({ x: event.clientX, y: event.clientY }), canvasViewCenter: () => ({ x: 196.5, y: 426 }),
    item: (id, name, kind, x, y, w, h, extra) => ({ id, name, kind, x, y, w, h, ...extra }),
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
    ${saveCode}
    function change(fn){history.push(JSON.stringify(state));fn();render();}
    function render(){save();renderProjects();}
    ${pictureHelpers}
    ${dropCode}
    ${pictureStoreCode}
    render();
    const projectsReady=initializeProjects();
  `, sandbox);
  const run = source => vm.runInContext(source, sandbox);
  return { get, buttons, stored, database, sandbox, run, ready: run('projectsReady'), json: source => JSON.parse(JSON.stringify(run(source))),
    drop: (name = 'Screenshot.png') => { sandbox.event = { dataTransfer: { files: [{ name, type: name.endsWith('.html') ? 'text/html' : 'image/png' }] }, clientX: 100, clientY: 100, preventDefault() {} };return run('handlePictureDrop(event)'); },
  };
}

test('both projects start in the browser and use the old draft keys', async () => {
  const h = harness();await h.ready;
  assert.equal(JSON.parse(h.stored.get(playerKey)).items[0].text, 'Player');
  assert.equal(JSON.parse(h.stored.get(libraryKey)).items[0].text, 'Library');
  assert.equal(h.database.size, 3);
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

test('a screenshot opened as a new page adds and selects a project, keeping Player’s work', async () => {
  const h = harness();await h.ready;
  h.run('state.items[0].text="My player";history.push("player undo");future.push("player redo");selected.add("text");');
  await h.drop();
  const id = h.run('activeProject');
  assert.notEqual(id, 'player');
  assert.equal(h.run('localProjects.length'), 3);
  assert.equal(h.buttons[2].querySelector('span').textContent, 'Screenshot');
  assert.equal(h.buttons[2].attributes['aria-current'], 'page');
  assert.equal(h.get('project-player').attributes['aria-current'], undefined);
  assert.deepEqual(h.json('[state.canvas.width,state.canvas.height]'), [903, 552]);
  assert.equal(h.run('state.items.length'), 1);
  assert.equal(h.run('state.items[0].imageBase'), true);
  assert.deepEqual(h.json('history'), []);
  assert.deepEqual(h.json('future'), []);
  assert.deepEqual(h.json('[...selected]'), []);
  assert.equal(h.database.get(playerKey).items[0].text, 'My player');
  await h.get('project-player').onclick();
  assert.equal(h.run('state.items[0].text'), 'My player');
  assert.deepEqual(h.json('history'), ['player undo']);
  assert.deepEqual(h.json('future'), ['player redo']);
  assert.deepEqual(h.json('[...selected]'), ['text']);
  await h.buttons[2].onclick();
  assert.equal(h.run('activeProject'), id);
  assert.equal(h.run('state.items[0].kind'), 'image');
});

test('a new screenshot project and its edits survive a reload at either home address', async () => {
  const h = harness();await h.ready;await h.drop();
  const id = h.run('activeProject');
  h.run('state.items[0].name="My screenshot";save();');
  for(const pathname of ['/', '/index.html', '/drafts/dark-player-layout/']){
    const next = harness({ stored: h.stored, database: h.database, pathname });await next.ready;
    assert.equal(next.run('activeProject'), id);
    assert.equal(next.run('state.items[0].name'), 'My screenshot');
    assert.equal(next.buttons[2].querySelector('span').textContent, 'Screenshot');
    assert.equal(next.buttons[2].attributes['aria-current'], 'page');
  }
  const catalog = JSON.parse(h.stored.get(listKey));
  assert.equal(catalog.projects.length, 3);
  assert.equal(catalog.projects[2].layout, undefined);
});

test('the picture store keeps new projects when the small text store is full', async () => {
  const h = harness({ blocked: true });await h.ready;await h.drop();
  const id = h.run('activeProject');
  h.run('state.items[0].name="Saved picture";save();');
  const next = harness({ database: h.database, blocked: true });await next.ready;
  assert.equal(next.run('activeProject'), id);
  assert.equal(next.run('state.items[0].name'), 'Saved picture');
  assert.equal(next.run('state.canvas.width'), 903);
  assert.equal(next.buttons[2].attributes['aria-current'], 'page');
  await next.run('switchProject("player")');
  assert.equal(next.run('state.items[0].text'), 'Player');
});

test('a full text store cannot restore an older project choice over the new one', async () => {
  const h = harness();await h.ready;
  h.sandbox.localStorage.setItem = () => { throw Error('Full'); };
  await h.drop();const id = h.run('activeProject');
  const next = harness({ stored: h.stored, database: h.database, full: true });await next.ready;
  assert.equal(next.run('activeProject'), id);
  assert.equal(next.run('state.items[0].kind'), 'image');
  await next.run('switchProject("library")');
  const again = harness({ stored: h.stored, database: h.database, full: true });await again.ready;
  assert.equal(again.run('activeProject'), 'library');
});

test('opening two screenshots with the same name creates two distinct projects', async () => {
  const h = harness();await h.ready;await h.drop();
  const first = h.run('activeProject');await h.drop();
  assert.notEqual(h.run('activeProject'), first);
  assert.deepEqual(h.json('localProjects.map(project=>project.name)'), ['Player', 'Library', 'Screenshot', 'Screenshot (2)']);
  await h.drop('Player.png');
  assert.equal(h.run('localProjects.at(-1).name'), 'Player (2)');
});

test('adding a screenshot, canceling, or failing to read a file leaves the project list alone', async () => {
  const h = harness();await h.ready;
  h.sandbox.choosePictureDrop = async () => 'add';await h.drop();
  assert.equal(h.run('activeProject'), 'player');
  assert.equal(h.run('state.items.length'), 2);
  assert.equal(h.run('history.length'), 1);
  h.sandbox.choosePictureDrop = async () => null;await h.drop();
  h.sandbox.choosePictureDrop = async () => 'new';
  h.sandbox.readPicture = async () => { throw Error('Could not open this picture.'); };await h.drop();
  assert.equal(h.run('localProjects.length'), 2);
  assert.equal(h.run('activeProject'), 'player');
  assert.equal(h.run('state.items.length'), 2);
  assert.equal(h.run('history.length'), 1);
});

test('an HTML page opened as new also creates a project', async () => {
  const h = harness();await h.ready;await h.drop('Saved page.html');
  assert.equal(h.run('localProjects.at(-1).name'), 'Saved page');
  assert.equal(h.run('state.items[0].text'), 'Imported page');
  await h.run('switchProject("player")');
  assert.equal(h.run('state.items[0].text'), 'Player');
});

test('an open image edit keeps a dropped file from creating or changing a project', async () => {
  const h = harness();await h.ready;h.run('imageEditSession={};');await h.drop();
  assert.equal(h.run('activeProject'), 'player');
  assert.equal(h.run('localProjects.length'), 2);
  assert.equal(h.run('state.items[0].text'), 'Player');
  assert.equal(h.sandbox.message, 'Choose Done or Cancel before opening a file.');
});

test('Copy HTML keeps new projects and their pictures in a separate file', async () => {
  const h = harness();await h.ready;await h.drop();
  const id = h.run('activeProject'), output = { textContent: '' };
  h.sandbox.exportDoc = { querySelector: () => output };h.run('exportProjects(exportDoc)');
  const data = JSON.parse(output.textContent);
  assert.equal(data.projects.length, 3);
  assert.equal(data.active, id);
  const saved = harness({ pathname: '/saved.html', data, embedded: h.json('state') });await saved.ready;
  assert.equal(saved.run('activeProject'), id);
  assert.equal(saved.run('state.items[0].kind'), 'image');
  assert.equal(saved.buttons.length, 3);
  await saved.run('switchProject("player")');
  assert.equal(saved.run('state.items[0].text'), 'Player');
  await saved.run(`switchProject(${JSON.stringify(id)})`);
  assert.equal(saved.run('state.canvas.width'), 903);
});

test('the home page contains both projects and the same project code', () => {
  assert.equal(page.split('// BEGIN LOCAL PROJECTS\n')[1].split('// END LOCAL PROJECTS')[0].trim(), code.trim());
  const data = JSON.parse(page.match(/id="initial-projects">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.projects.map(project => project.name), ['Player', 'Library']);
  assert.ok(data.projects[1].layout.items.some(item => item.id === 'page-title' && item.text === 'Library'));
});
