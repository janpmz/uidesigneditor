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
const spaceCode = readFileSync(join(__dirname,'space.js'),'utf8');
let nextId = 0;

function harness({ stored = new Map(), database = new Map(), pathname = '/', data, embedded = null, blocked = false, full = false, noDatabase = false, spaceUrl } = {}) {
  let focused;
  const listeners = new Map();
  function node(tag = 'div') {
    const events = new Map(), classes = new Set();
    const matches = (element, selector) => {
      const attribute = selector.match(/^\[data-([\w-]+)(?:="([^"]*)")?\]$/);
      if (!attribute) return element.tagName === selector;
      const key = attribute[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return key in element.dataset && (attribute[2] === undefined || element.dataset[key] === attribute[2]);
    };
    return { tagName: tag, textContent: '', value: 'fit', open: false, attributes: {}, dataset: {}, children: [],
      classList: { remove: name => classes.delete(name), add: name => classes.add(name), contains: name => classes.has(name) },
      focus() { focused = this; }, getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 1000 }),
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      addEventListener(type, fn, options) { if (!events.has(type)) events.set(type, []);events.get(type).push({ fn, once: options?.once }); },
      showModal() { this.open = true; },
      close() { this.open = false;for (const entry of events.get('close') || []) entry.fn();events.set('close', (events.get('close') || []).filter(entry => !entry.once)); },
      append(child) { child.parent = this;this.children.push(child); },
      remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      querySelectorAll(selector) { return this.children.flatMap(child => [...(matches(child, selector) ? [child] : []), ...child.querySelectorAll(selector)]); },
    };
  }
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, node());
    return nodes.get(id);
  };
  get('initial-projects').textContent = JSON.stringify(data || { version: 1, active: 'player', projects: [{ id: 'player', name: 'Player', layout: null }, { id: 'library', name: 'Library', layout: layout('Library') }] });
  get('initial-layout').textContent = JSON.stringify(embedded);
  const list = get('project-list');
  for(const id of ['player', 'library']){
    const row = node(), button = get('project-' + id), remove = get('delete-' + id);
    row.dataset.projectRow = id;button.dataset.project = id;button.append(node('span'));remove.dataset.deleteProject = id;row.append(button);row.append(remove);list.append(row);
  }
  const connections = [];
  function openDatabase() {
    let closed = false;
    const db = { close() { closed = true; }, transaction() {
      if (closed || sandbox.closeTransactions) throw Object.assign(Error("Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing."), { name: 'InvalidStateError' });
      const transaction = {}, writes = new Map(), removed = new Set();let queued = false, aborted = false;
      transaction.abort = () => { aborted = true; };
      function commit() {
        if (queued) return;queued = true;
        queueMicrotask(() => {
          if (aborted || (removed.size && sandbox.failDeletes) || (writes.size && sandbox.failWrites)) { transaction.error = Error('Store failed');transaction.onabort?.();return; }
          for (const key of removed) database.delete(key);
          for (const [key, value] of writes) database.set(key, value);
          transaction.oncomplete?.();
        });
      }
      transaction.objectStore = () => ({
        get(key) { const request = {};queueMicrotask(() => { request.result = structuredClone(database.get(key));request.onsuccess?.(); });commit();return request; },
        put(value, key) { if (removed.size && sandbox.failDeleteList) throw Error('Could not save list');writes.set(key, structuredClone(value));commit(); },
        delete(key) { removed.add(key);commit(); },
      });
      return transaction;
    } };
    connections.push(db);return db;
  }
  const sandbox = vm.createContext({ $, document: {
    querySelectorAll: selector => list.querySelectorAll(selector),
    querySelector: selector => selector === '#editor-pages .project-page-list' ? list : selector.startsWith('[data-') ? list.querySelector(selector) : get('canvas'),
    createElement: node, addEventListener(type, fn) { listeners.set(type, fn); },
  },
    location: spaceUrl?new URL(spaceUrl):{ pathname }, original: () => layout('Player'), validEditorPage: value => value?.version === 1 && value.canvas && Array.isArray(value.items),
    localStorage: { getItem(key) { if (blocked) throw Error('Blocked');return stored.get(key) || null; }, setItem(key, value) { if (blocked || full) throw Error('Full');stored.set(key, value); }, removeItem(key) { if (blocked) throw Error('Blocked');stored.delete(key); } },
    indexedDB: { open() { const request = {};queueMicrotask(() => { if (noDatabase || sandbox.failDatabaseOpen) { request.error = Error('Store unavailable');request.onerror();return; }request.result = openDatabase();request.onsuccess(); });return request; } },
    crypto: { randomUUID: () => String(++nextId) }, round: value => Math.round(value * 10) / 10,
    choosePictureDrop: async () => 'new',
    readPicture: async file => ({ name: file.name, src: 'data:image/png;base64,AAAA', width: 903, height: 552 }),
    readEditorPage: async () => layout('Imported page'),
    phonePoint: event => ({ x: event.clientX, y: event.clientY }), canvasViewCenter: () => ({ x: 196.5, y: 426 }),
    item: (id, name, kind, x, y, w, h, extra) => ({ id, name, kind, x, y, w, h, ...extra }),
    notify: message => { sandbox.message = message; },
    stage: { focus() {} }, canvasView: { x: 0, y: 0 }, canvasViewBusy: () => false,
    clearCanvasRegion() {}, closeCanvasMenu() {}, closeItemMenu() {}, resetCanvasView: () => { get('zoom').value = 'fit'; },
    ...(spaceUrl?{WebSocket,fetch:(path,options)=>fetch(new URL(path,spaceUrl),options),setTimeout,clearTimeout,
      navigator:{clipboard:{writeText:async value=>{sandbox.copied=value;}}},
      window:{addEventListener(type,fn){listeners.set('window:'+type,fn);},history:{replaceState(_state,_title,hash){sandbox.location.hash=hash;}}}}:{}),
  });
  function $(id) { return get(id); }
  vm.runInContext(`
    const copy=value=>JSON.parse(JSON.stringify(value));
    ${code}
    let state=localProjectLayout(activeProject),history=[],future=[],selected=new Set(),scale=1,editing=true,fieldEdit=null;
    let imageEditSession=null,canvasPan=null,canvasPinch=null,drag=null,pictureChoice={open:false};
    ${saveCode}
    function change(fn){history.push(JSON.stringify(state));fn();render();}
    function remember(){history.push(JSON.stringify(state));future=[];}
    function render(){save();renderProjects();}
    ${pictureHelpers}
    ${dropCode}
    ${pictureStoreCode}
    render();
    const projectsReady=initializeProjects();
  `, sandbox);
  const run = source => vm.runInContext(source, sandbox);
  const beginDelete = async id => { const done = run(`deleteProject(${JSON.stringify(id)})`);await Promise.resolve();return { done }; };
  return { get, get buttons() { return list.querySelectorAll('[data-project]'); }, get focused() { return focused; }, stored, database, connections, sandbox, run, listeners, beginDelete, ready: run('projectsReady'), json: source => JSON.parse(JSON.stringify(run(source))),
    remove: async id => { const { done } = await beginDelete(id);get('project-delete-confirm').onclick();get('project-delete-confirm').onclick();await done; },
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

test('renaming keeps the design and Undo steps and survives reload in both browser stores', async () => {
  const h = harness();await h.ready;
  const before=h.json('state');h.run('history.push("canvas edit");renameProject("  My player  ")');
  assert.equal(h.run('localProjects[0].name'),'My player');
  assert.equal(h.get('project-player').children[0].textContent,'My player');
  assert.equal(h.get('delete-player').attributes['aria-label'],'Delete My player');
  assert.deepEqual(h.json('state'),before);
  assert.deepEqual(h.json('history'),['canvas edit']);
  const next=harness({stored:h.stored});await next.ready;
  assert.equal(next.run('localProjects[0].name'),'My player');
  const databaseOnly=harness({database:h.database});await databaseOnly.ready;
  assert.equal(databaseOnly.run('localProjects[0].name'),'My player');
  assert.throws(()=>h.run('renameProject(" ")'),/project name/);
  assert.throws(()=>h.run('renameProject("a".repeat(201))'),/project name/);
  assert.equal(h.run('localProjects[0].name'),'My player');
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

test('closed browser stores reopen for edits, project lists and saved pictures', async () => {
  for (const closeEvent of ['silent', 'close', 'versionchange']) {
    const h = harness({ blocked: true });await h.ready;
    const first = h.run('pictureDB');
    if (closeEvent === 'versionchange') first.onversionchange();
    else { first.close();if (closeEvent === 'close') first.onclose(); }
    h.run('state.items[0].text="Kept after closing";state.items.push({id:"picture",kind:"image",src:"data:image/png;base64,AAAA"});save();renameProject("Kept name");');
    await h.run('switchProject("library")');
    await h.run('usePictureStore("readonly",store=>store.get(STORAGE))');
    assert.equal(h.connections.length, 2);
    assert.equal(h.database.get(playerKey).items[0].text, 'Kept after closing');
    assert.equal(h.database.get(listKey).projects[0].name, 'Kept name');
    assert.equal(h.sandbox.message, undefined);
    first.onclose();assert.equal(h.run('pictureDB'), h.connections[1]);
    h.run('pictureDB.close()');await h.run('switchProject("player")');
    assert.equal(h.run('state.items[0].text'), 'Kept after closing');
    const next = harness({ blocked: true, database: h.database });await next.ready;
    assert.equal(next.run('state.items[0].text'), 'Kept after closing');
    assert.equal(next.run('state.items[1].src'), 'data:image/png;base64,AAAA');
    assert.equal(next.run('localProjects[0].name'), 'Kept name');
  }
});

test('browser store failures stop after one retry and keep failed writes open for another save', async () => {
  const h = harness({ blocked: true });await h.ready;
  h.sandbox.closeTransactions = true;
  h.run('state.items[0].text="Still here";save();');
  await assert.rejects(h.run('usePictureStore("readonly",store=>store.get(STORAGE))'), { name: 'InvalidStateError' });
  assert.equal(h.connections.length, 2);
  assert.equal(h.run('state.items[0].text'), 'Still here');
  assert.match(h.sandbox.message, /Copy HTML/);
  h.sandbox.closeTransactions = false;h.sandbox.failWrites = true;
  h.run('save()');
  await assert.rejects(h.run('usePictureStore("readwrite",store=>store.put(copy(state),STORAGE))'), /Store failed/);
  assert.notEqual(h.database.get(playerKey).items[0].text, 'Still here');
  h.sandbox.failWrites = false;h.run('save()');
  await h.run('usePictureStore("readonly",store=>store.get(STORAGE))');
  assert.equal(h.database.get(playerKey).items[0].text, 'Still here');
});

test('New Project opens a blank canvas and keeps the current project’s work and undo steps', async () => {
  const h = harness();await h.ready;
  h.run('state.items[0].text="My player";history.push("player undo");future.push("player redo");selected.add("text");canvasView.x=123;');
  await h.get('project-new').onclick();
  const id = h.run('activeProject');
  assert.notEqual(id, 'player');
  assert.equal(h.buttons[2].querySelector('span').textContent, 'New Project');
  assert.equal(h.buttons[2].attributes['aria-current'], 'page');
  assert.deepEqual(h.json('state'), { version: 1, canvas: { width: 393, height: 852, background: '#000000' }, items: [] });
  assert.deepEqual(h.json('history'), []);
  assert.deepEqual(h.json('future'), []);
  assert.deepEqual(h.json('[...selected]'), []);
  assert.equal(h.get('zoom').value, 'fit');
  assert.equal(h.database.get(playerKey).items[0].text, 'My player');
  await h.get('project-player').onclick();
  assert.equal(h.run('state.items[0].text'), 'My player');
  assert.deepEqual(h.json('history'), ['player undo']);
  assert.deepEqual(h.json('future'), ['player redo']);
  assert.deepEqual(h.json('[...selected]'), ['text']);
  assert.equal(h.run('canvasView.x'), 123);
  await h.get('project-new').onclick();
  assert.notEqual(h.run('activeProject'), id);
  assert.equal(h.buttons[3].querySelector('span').textContent, 'New Project (2)');
});

test('blank projects survive reloads and Copy HTML with either browser store', async () => {
  for (const options of [{}, { blocked: true }, { noDatabase: true }]) {
    const h = harness(options);await h.ready;await h.get('project-new').onclick();
    const id = h.run('activeProject');
    const next = harness({ ...options, stored: h.stored, database: h.database });await next.ready;
    assert.equal(next.run('activeProject'), id);
    assert.deepEqual(next.json('state.items'), []);
    assert.equal(next.buttons[2].querySelector('span').textContent, 'New Project');
    const output = { textContent: '' };next.sandbox.exportDoc = { querySelector: () => output };next.run('exportProjects(exportDoc)');
    const saved = harness({ pathname: '/saved.html', data: JSON.parse(output.textContent), embedded: next.json('state') });await saved.ready;
    assert.equal(saved.run('activeProject'), id);
    assert.deepEqual(saved.json('state.items'), []);
    await saved.get('project-new').onclick();
    assert.equal(saved.buttons[3].querySelector('span').textContent, 'New Project (2)');
  }
});

test('New Project waits for saved work, ignores repeated clicks and stops during other edits', async () => {
  const h = harness();
  const creating = h.get('project-new').onclick();
  assert.equal(h.get('project-new').disabled, true);
  assert.equal(h.run('localProjects.length'), 2);
  await h.get('project-new').onclick();await creating;
  assert.equal(h.run('localProjects.length'), 3);
  assert.equal(h.get('project-new').disabled, false);
  h.sandbox.canvasViewBusy = () => h.run('pictureDropBusy');
  for (const busy of ['imageEditSession={}', 'drag={}', 'canvasPan={}', 'canvasPinch={}', 'pictureDropBusy=true', 'pictureChoice.open=true', 'projectSwitchBusy=true']) {
    h.run('imageEditSession=drag=canvasPan=canvasPinch=null;pictureDropBusy=pictureChoice.open=projectSwitchBusy=false;');
    h.run(busy);await h.get('project-new').onclick();
    assert.equal(h.run('localProjects.length'), 3);
  }
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

test('deleting needs both confirmations, with Cancel focused each time', async () => {
  const h = harness();await h.ready;
  const before = h.json('state'), saved = h.stored.get(listKey);
  const { done } = await h.beginDelete('player');
  assert.equal(h.get('project-delete-dialog').open, true);
  assert.equal(h.get('project-delete-title').textContent, 'Delete “Player”?');
  assert.match(h.get('project-delete-help').textContent, /can’t undo/);
  assert.equal(h.focused, h.get('project-delete-cancel'));
  assert.equal(h.get('project-player').disabled, true);
  assert.equal(h.get('delete-player').disabled, true);
  h.get('project-delete-confirm').onclick();
  assert.equal(h.get('project-delete-title').textContent, 'Delete “Player” for good?');
  assert.match(h.get('project-delete-help').textContent, /won’t come back/);
  assert.equal(h.get('project-delete-confirm').textContent, 'Delete for good');
  assert.equal(h.get('project-delete-confirm').classList.contains('danger'), true);
  assert.equal(h.focused, h.get('project-delete-cancel'));
  assert.equal(h.stored.get(listKey), saved);
  assert.equal(h.database.has(playerKey), true);
  h.get('project-delete-cancel').onclick();await done;
  assert.deepEqual(h.json('state'), before);
  assert.equal(h.stored.get(listKey), saved);
  assert.equal(h.run('projectSwitchBusy'), false);
  assert.equal(h.get('project-player').disabled, false);
  assert.equal(h.focused, h.get('delete-player'));
});

test('Cancel or Escape at either step keeps the project and its saved work', async () => {
  for (const finalStep of [false, true]) for (const escape of [false, true]) {
    const h = harness();await h.ready;const saved = h.stored.get(listKey);
    const { done } = await h.beginDelete('library');
    if (finalStep) h.get('project-delete-confirm').onclick();
    if (escape) {
      let prevented = false;
      h.get('project-delete-dialog').oncancel({ preventDefault() { prevented = true; } });
      assert.equal(prevented, false);h.get('project-delete-dialog').close();
    } else h.get('project-delete-cancel').onclick();
    await done;
    assert.deepEqual(h.json('localProjects.map(project=>project.id)'), ['player', 'library']);
    assert.equal(h.stored.get(listKey), saved);
    assert.equal(h.database.get(libraryKey).items[0].text, 'Library');
    assert.equal(h.get('project-delete-dialog').open, false);
  }
});

test('deleting the open project removes its saved work and undo steps, then opens a neighbor', async () => {
  const h = harness();await h.ready;
  h.run('state.items[0].text="Saved player";history.push("player undo");future.push("player redo");selected.add("text");');
  await h.run('switchProject("library")');
  h.run('state.items[0].text="My library";history.push("library undo");');
  await h.remove('library');
  assert.equal(h.run('activeProject'), 'player');
  assert.equal(h.run('state.items[0].text'), 'Saved player');
  assert.deepEqual(h.json('history'), ['player undo']);
  assert.deepEqual(h.json('future'), ['player redo']);
  assert.deepEqual(h.json('[...selected]'), ['text']);
  assert.equal(h.run('projectSessions.has("library")'), false);
  assert.equal(h.stored.has(libraryKey), false);
  assert.equal(h.database.has(libraryKey), false);
  assert.equal(h.buttons.length, 1);
  assert.equal(h.get('project-player').attributes['aria-current'], 'page');
  assert.equal(h.focused, h.get('project-player'));
  assert.deepEqual(JSON.parse(h.stored.get(listKey)).deleted, ['library']);
  await h.run('switchProject("library")');
  assert.equal(h.run('activeProject'), 'player');
});

test('deleting a closed project leaves the open project, undo steps and view alone', async () => {
  const h = harness();await h.ready;
  h.run('state.items[0].text="My player";history.push("undo");selected.add("text");canvasView.x=145;save();');
  const before = h.json('state');await h.remove('library');
  assert.equal(h.run('activeProject'), 'player');
  assert.deepEqual(h.json('state'), before);
  assert.deepEqual(h.json('history'), ['undo']);
  assert.deepEqual(h.json('[...selected]'), ['text']);
  assert.equal(h.run('canvasView.x'), 145);
});

test('deleted built-in projects stay gone at every home address, even with an older list in one store', async () => {
  const h = harness();await h.ready;
  const oldStored = new Map(h.stored), oldDatabase = new Map(h.database);
  await h.remove('player');
  for (const pathname of ['/', '/index.html', '/drafts/dark-player-layout/', '/drafts/dark-player-layout/index.html']) {
    for (const stale of ['none', 'text', 'pictures']) {
      const stored = new Map(stale === 'text' ? oldStored : h.stored);
      const database = new Map(stale === 'pictures' ? oldDatabase : h.database);
      const next = harness({ stored, database, pathname });await next.ready;
      assert.deepEqual(next.json('localProjects.map(project=>project.id)'), ['library']);
      assert.equal(next.run('activeProject'), 'library');
      assert.equal(stored.has(playerKey), false);
      assert.equal(database.has(playerKey), false);
      assert.equal(next.buttons.some(button => button.dataset.project === 'player'), false);
    }
  }
});

test('deleted picture projects stay gone when text storage is blocked or full', async () => {
  for (const options of [{ blocked: true }, { full: true }, { noDatabase: true }]) {
    const h = harness(options);await h.ready;await h.drop();
    const id = h.run('activeProject'), key = h.run(`projectStorage(${JSON.stringify(id)})`);
    await h.remove(id);
    assert.equal(h.stored.has(key), false);
    assert.equal(h.database.has(key), false);
    const next = harness({ ...options, stored: h.stored, database: h.database });await next.ready;
    assert.equal(next.run(`localProjects.some(project=>project.id===${JSON.stringify(id)})`), false);
    assert.equal(next.run(`projectSessions.has(${JSON.stringify(id)})`), false);
  }
});

test('deleting the last project opens a blank project and keeps both examples gone after reload', async () => {
  const h = harness();await h.ready;await h.remove('player');await h.remove('library');
  const id = h.run('activeProject');
  assert.notEqual(id, 'player');assert.notEqual(id, 'library');
  assert.equal(h.run('localProjects.length'), 1);
  assert.equal(h.run('localProjects[0].name'), 'New project');
  assert.deepEqual(h.json('state.items'), []);
  assert.deepEqual(h.json('history'), []);
  assert.deepEqual(h.json('future'), []);
  assert.deepEqual(h.json('[...selected]'), []);
  assert.equal(h.database.has(playerKey), false);
  assert.equal(h.database.has(libraryKey), false);
  const next = harness({ stored: h.stored, database: h.database });await next.ready;
  assert.equal(next.run('activeProject'), id);
  assert.deepEqual(next.json('localProjects.map(project=>project.id)'), [id]);
  assert.deepEqual(next.json('state.items'), []);
});

test('Copy HTML omits deleted projects, saved work and project buttons', async () => {
  const h = harness();await h.ready;await h.remove('player');
  const output = { textContent: '' };h.sandbox.exportDoc = { querySelector: () => output };h.run('exportProjects(exportDoc)');
  const data = JSON.parse(output.textContent);
  assert.deepEqual(data.projects.map(project => project.id), ['library']);
  const saved = harness({ pathname: '/saved.html', data, embedded: h.json('state') });await saved.ready;
  assert.equal(saved.run('activeProject'), 'library');
  assert.deepEqual(saved.buttons.map(button => button.dataset.project), ['library']);
  assert.equal(saved.run('projectSessions.has("player")'), false);
});

test('a failed delete keeps the project and reports the failure', async () => {
  const h = harness();await h.ready;h.sandbox.failDeletes = true;
  const saved = h.stored.get(listKey);await h.remove('player');
  assert.equal(h.run('activeProject'), 'player');
  assert.equal(h.run('localProjects.length'), 2);
  assert.equal(h.run('deletedProjects.size'), 0);
  assert.equal(h.stored.get(listKey), saved);
  assert.equal(h.database.has(playerKey), true);
  assert.match(h.sandbox.message, /Could not delete/);
  assert.equal(h.get('project-delete-dialog').open, false);
  assert.equal(h.run('projectSwitchBusy'), false);
  h.sandbox.failDeletes = false;await h.remove('player');
  assert.equal(h.run('activeProject'), 'library');
});

test('a failed list write aborts deletion and a full text store without a picture store keeps the draft', async () => {
  const h = harness();await h.ready;h.sandbox.failDeleteList = true;
  await h.remove('player');
  assert.equal(h.database.has(playerKey), true);
  assert.equal(h.stored.has(playerKey), true);
  assert.equal(h.run('activeProject'), 'player');
  assert.deepEqual(h.database.get(listKey).deleted, []);
  const full = harness({ noDatabase: true });await full.ready;
  full.sandbox.localStorage.setItem = () => { throw Error('Full'); };
  await full.remove('player');
  assert.equal(full.stored.has(playerKey), true);
  assert.equal(full.run('activeProject'), 'player');
  assert.match(full.sandbox.message, /Could not delete/);
});

test('a double-click on Continue cannot also confirm deletion', async () => {
  const h = harness();await h.ready;const { done } = await h.beginDelete('player');
  h.get('project-delete-confirm').onclick({ detail: 1 });
  h.get('project-delete-confirm').onclick({ detail: 2 });
  assert.equal(h.get('project-delete-confirm').disabled, false);
  assert.equal(h.run('localProjects.length'), 2);
  assert.equal(h.database.has(playerKey), true);
  h.get('project-delete-cancel').onclick();await done;
});

test('deleting stops during an image edit, move or file drop and ignores repeated clicks', async () => {
  const h = harness();await h.ready;
  for (const busy of ['imageEditSession={}', 'drag={}', 'canvasPan={}', 'canvasPinch={}', 'pictureDropBusy=true', 'pictureChoice.open=true']) {
    h.run('imageEditSession=drag=canvasPan=canvasPinch=null;pictureDropBusy=pictureChoice.open=false;');
    h.run(busy);await h.run('deleteProject("player")');
    assert.equal(h.get('project-delete-dialog').open, false);
    assert.equal(h.run('localProjects.length'), 2);
  }
  h.run('pictureChoice.open=false;');
  const { done } = await h.beginDelete('player');
  await h.run('deleteProject("library")');
  await h.run('switchProject("library")');
  assert.equal(h.get('project-delete-title').textContent, 'Delete “Player”?');
  assert.equal(h.run('activeProject'), 'player');
  h.get('project-delete-cancel').onclick();await done;
});

test('keys, file drops and pasted pictures cannot change the page while a delete dialog is open', async () => {
  const h = harness();await h.ready;const { done } = await h.beginDelete('player');
  let stopped = 0, prevented = 0;
  h.listeners.get('keydown')({ stopImmediatePropagation() { stopped++; } });
  h.listeners.get('drop')({ stopImmediatePropagation() { stopped++; }, preventDefault() { prevented++; } });
  h.listeners.get('paste')({ stopImmediatePropagation() { stopped++; }, preventDefault() { prevented++; } });
  assert.equal(stopped, 3);assert.equal(prevented, 2);
  h.get('project-delete-confirm').onclick();h.get('project-delete-confirm').onclick();
  h.get('project-delete-dialog').oncancel({ preventDefault() { prevented++; } });
  assert.equal(prevented, 3);assert.equal(h.get('project-delete-confirm').disabled, true);
  await done;
});

test('the home page starts with the four videos and keeps the same project code', () => {
  assert.equal(page.split('// BEGIN LOCAL PROJECTS\n')[1].split('// END LOCAL PROJECTS')[0].trim(), code.trim());
  assert.match(page, /<button type="button" class="project-page project-new" id="project-new"><svg[^>]*aria-hidden="true"[\s\S]*?<\/svg><span>New Project<\/span><\/button>/);
  const data = JSON.parse(page.match(/id="initial-projects">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.projects.map(project => project.name), ['Landing page', 'Player', 'Library']);
  assert.ok(data.projects[2].layout.items.some(item => item.id === 'page-title' && item.text === 'Library'));
  const actions = page.match(/<div class="export-actions">([\s\S]*?)<\/div>/)[1];
  assert.match(actions, /<button id="copy">Copy layout<\/button><button type="button" id="project-share" class="primary"[^>]*>Copy link<\/button>/);
  assert.equal(page.split('id="project-share"').length - 1, 1);
});

test('separate browser stores share a Space, keep Undo, preserve conflicts, and save copies', async t => {
  const {createSpaceServer}=await import('../server/index.mjs');
  const {once}=require('node:events');
  const app=await createSpaceServer();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const base='http://127.0.0.1:'+app.server.address().port;
  const browsers=[];
  t.after(async()=>{for(const h of browsers)h.run('spaceClient.close()');await app.close();});
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  const image={id:'picture',kind:'image',x:0,y:0,w:20,h:20,src:png};
  const mp4='data:video/mp4;base64,'+readFileSync(join(__dirname,'../assets/landing-screen-recording-153438-10s.mp4')).toString('base64');
  const clip={id:'clip',kind:'video',x:40,y:40,w:200,h:200,src:mp4};
  const design={version:1,canvas:{width:400,height:300,background:'#fff'},items:[{id:'hello',kind:'label',x:10,y:10,w:200,h:30,text:'Local work'},{...image,imageContents:{version:1,canvas:{width:20,height:20,background:'#fff'},items:[image]}},clip]};
  const data={version:1,active:'demo',projects:[{id:'demo',name:'Demo',layout:design}]};
  const open=async(url,stored=new Map(),database=new Map())=>{
    const h=harness({spaceUrl:url,data:structuredClone(data),stored,database});browsers.push(h);await h.ready;
    h.run(spaceCode);await h.run('spaceClient.ready');return h;
  };
  const waitFor=async(fn)=>{
    const deadline=Date.now()+3000;
    while(!fn()){if(Date.now()>deadline)assert.fail('Space did not update');await new Promise(resolve=>setTimeout(resolve,10));}
  };
  const first=await open(base+'/');
  const spaceId=first.run('onlineSpaceId');assert.match(spaceId,/^[a-f0-9]{64}$/);
  assert.equal(first.stored.get('ui-design-editor-last-space-v1'),spaceId);
  const second=await open(base+'/#space='+spaceId);
  assert.notEqual(first.stored,second.stored);
  assert.equal(second.run('state.items[1].src'),png);
  assert.equal(second.run('state.items[1].imageContents.items[0].src'),png);
  assert.equal(second.run('state.items[2].src'),mp4);
  assert.match(app.store.get(spaceId,'demo').layout.items[2].src,/^picture:/);
  assert.match(app.store.get(spaceId,'demo').layout.items[1].src,/^picture:/);
  await waitFor(()=>app.clients.get(spaceId)?.size===2);
  first.run('renameProject("Shared name")');await first.run('spaceClient.saved()');
  await waitFor(()=>second.run('localProjects[0].name')==='Shared name');
  assert.equal(app.store.get(spaceId,'demo').name,'Shared name');
  assert.equal(first.run('history.length'),0);
  assert.equal(second.run('history.length'),0);
  first.run("change(()=>state.items[0].text='Shared edit')");await first.run('spaceClient.saved()');
  await waitFor(()=>second.run('state.items[0].text')==='Shared edit');
  assert.ok(second.run('history.length')>0);
  assert.equal(first.run('history.length'),1);
  assert.equal(JSON.parse(first.stored.get('dark-demo-layout-v2:/drafts/dark-demo-layout/')).items[0].text,'Local work');

  // Hold the second page in an edit so a remote notice cannot replace its work.
  second.run("fieldEdit={};change(()=>state.items[0].text='Unsaved work')");
  first.run("change(()=>state.items[0].text='Newer saved work')");await first.run('spaceClient.saved()');
  await waitFor(()=>second.get('space-conflict').hidden===false);
  assert.equal(second.run('state.items[0].text'),'Unsaved work');
  second.run('fieldEdit=null');
  await assert.rejects(second.run('spaceClient.saved()'),/newer version/);
  await second.get('space-copy').onclick();
  assert.equal(second.run('state.items[0].text'),'Unsaved work');
  const copiedId=second.run('activeProject');assert.notEqual(copiedId,'demo');
  assert.equal(app.store.get(spaceId,'demo').layout.items[0].text,'Newer saved work');
  assert.equal(app.store.get(spaceId,copiedId).layout.items[0].text,'Unsaved work');
  const pictureId=app.store.get(spaceId,copiedId).layout.items[1].src.slice(8);
  assert.equal(app.store.getPicture(spaceId,copiedId,pictureId).src,png);
  const clipId=app.store.get(spaceId,copiedId).layout.items[2].src.slice(8);
  assert.equal(app.store.getPicture(spaceId,copiedId,clipId).src,mp4);
  await waitFor(()=>first.run('localProjects.length')===2);

  // A dirty local page survives reopening with a newer server copy.
  second.run("fieldEdit={};change(()=>state.items[0].text='Kept through reload');spaceClient.close()");
  const newer=app.store.get(spaceId,copiedId);
  app.store.save(spaceId,copiedId,{...newer,layout:{...newer.layout,items:[{...newer.layout.items[0],text:'Changed while away'}]}});
  const reopening=await open(base+'/',second.stored,second.database);
  assert.equal(reopening.run('onlineSpaceId'),spaceId);
  assert.equal(reopening.sandbox.location.hash,'#space='+spaceId);
  assert.equal(reopening.run('state.items[0].text'),'Kept through reload');
  assert.equal(reopening.get('space-conflict').hidden,false);
  assert.equal(app.store.get(spaceId,copiedId).layout.items[0].text,'Changed while away');
  await reopening.get('space-reload').onclick();
  assert.equal(reopening.run('state.items[0].text'),'Changed while away');
  await reopening.remove(copiedId);
  await waitFor(()=>first.run('localProjects.length')===1);
  assert.equal(reopening.run('activeProject'),'demo');
  assert.throws(()=>app.store.get(spaceId,copiedId),/not found/);

  const {spaceId:anotherSpace}=app.store.createSpace();
  const switched=await open(base+'/#space='+anotherSpace,first.stored,first.database);
  assert.equal(switched.run('onlineSpaceId'),anotherSpace);
  assert.equal(switched.stored.get('ui-design-editor-last-space-v1'),anotherSpace);
  assert.equal(app.store.hasSpace(spaceId),true);

  const missingId='e'.repeat(64),missingStore=new Map([['ui-design-editor-last-space-v1',missingId]]);
  const missing=await open(base+'/',missingStore);
  assert.equal(missing.run('onlineSpaceId'),missingId);
  assert.equal(missingStore.get('ui-design-editor-last-space-v1'),missingId);
  assert.equal(app.store.hasSpace(missingId),false);
  assert.match(missing.get('space-status').textContent,/Space not found/);
});

test('Spaces open, retry and save when the browser store closes or stays unavailable',async t=>{
  const {createSpaceServer}=await import('../server/index.mjs');
  const {once}=require('node:events');
  const app=await createSpaceServer();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const base='http://127.0.0.1:'+app.server.address().port,browsers=[];
  t.after(async()=>{for(const h of browsers)h.run('spaceClient.close()');await app.close();});
  for(const existing of [false,true])for(const unavailable of [false,true]){
    const spaceId=existing?app.store.createSpace().spaceId:null;
    const design={version:1,canvas:{width:393,height:852},items:[{id:'text',kind:'label',x:0,y:0,w:100,h:30,text:'Local work'}]};
    const data={version:1,active:'demo',projects:[{id:'demo',name:'Demo',layout:design}]};
    const h=harness({spaceUrl:base+'/'+(spaceId?'#space='+spaceId:''),data});browsers.push(h);await h.ready;
    h.run('pictureDB.close()');h.sandbox.failDatabaseOpen=unavailable;
    h.run(spaceCode);await h.run('spaceClient.ready');
    assert.equal(h.get('space-share').hidden,false,h.get('space-status').textContent);
    assert.equal(h.get('space-retry').hidden,true);
    assert.doesNotMatch(h.get('space-status').textContent,/transaction|closing|Could not open/);
    if(!unavailable)assert.equal(h.connections.length,2);
    const id=h.run('activeProject'),openedSpace=h.run('onlineSpaceId');
    h.run('change(()=>state.items[0]?state.items[0].text="Saved online":state.items.push({id:"text",kind:"label",x:0,y:0,w:100,h:30,text:"Saved online"}))');
    await h.run('spaceClient.saved()');
    assert.equal(app.store.get(openedSpace,id).layout.items[0].text,'Saved online');
    const remote={version:1,canvas:{width:393,height:852},items:[{id:'text',kind:'label',x:0,y:0,w:100,h:30,text:'From the Space'}]};
    app.store.save(openedSpace,'remote',{name:'Remote project',version:0,layout:remote});
    if(!unavailable)h.run('pictureDB.close()');
    await h.get('space-retry').onclick();
    assert.equal(h.get('space-retry').hidden,true);
    await h.run('switchProject("remote")');
    assert.equal(h.run('state.items[0].text'),'From the Space');
    if(!unavailable)assert.deepEqual(h.database.get(h.run('projectStorage("remote")')),remote);
  }
});

test('project links open the chosen project across browsers and saved choices',async t=>{
  const {createSpaceServer}=await import('../server/index.mjs');
  const {once}=require('node:events');
  const app=await createSpaceServer();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const base='http://127.0.0.1:'+app.server.address().port;
  const {spaceId}=app.store.createSpace(),spaceUrl=base+'/#space='+spaceId;
  const browsers=[];
  t.after(async()=>{for(const h of browsers)h.run('spaceClient.close()');await app.close();});
  for(const id of ['player','library','project-123'])app.store.save(spaceId,id,{name:id,version:0,layout:{version:1,canvas:{width:400,height:300},items:[{id:'title',kind:'label',x:0,y:0,w:100,h:30,text:id}]}});
  const open=async(url,stored=new Map(),database=new Map())=>{
    const h=harness({spaceUrl:url,stored,database});browsers.push(h);await h.ready;
    h.run(spaceCode);await h.run('spaceClient.ready');return h;
  };
  const first=await open(spaceUrl);
  assert.equal(first.get('project-share').hidden,false);
  await first.run('switchProject("library")');
  await first.get('project-share').onclick();
  assert.equal(first.sandbox.copied,spaceUrl+'&project=library');
  assert.equal(first.get('project-share').textContent,'Copied');
  first.get('project-share').onblur();
  assert.equal(first.get('project-share').textContent,'Copy link');
  const fresh=await open(first.sandbox.copied);
  assert.equal(fresh.run('onlineSpaceId'),spaceId);
  assert.equal(fresh.run('activeProject'),'library');
  assert.equal(fresh.run('state.items[0].text'),'library');
  await fresh.get('space-share').onclick();
  assert.equal(fresh.sandbox.copied,spaceUrl);

  const linked=await open(spaceUrl+'&project=project-123',first.stored,first.database);
  assert.equal(linked.run('activeProject'),'project-123');
  assert.equal(linked.run('state.items[0].text'),'project-123');
  await linked.run('switchProject("player")');
  await linked.get('project-share').onclick();
  assert.equal(linked.sandbox.copied,spaceUrl+'&project=player');

  first.run('createProject(blankProjectLayout(),"From link")');
  const newId=first.run('activeProject');
  await first.get('project-share').onclick();
  assert.equal(first.sandbox.copied,spaceUrl+'&project='+newId);
  assert.equal(app.store.get(spaceId,newId).name,'From link');
  const created=await open(first.sandbox.copied);
  assert.equal(created.run('activeProject'),newId);
  assert.deepEqual(created.json('state'),first.json('state'));

  let reloads=0;created.sandbox.location.reload=()=>{reloads++;};
  created.listeners.get('window:hashchange')();assert.equal(reloads,0);
  created.sandbox.location.hash='#space='+spaceId+'&project=library';
  created.listeners.get('window:hashchange')();assert.equal(reloads,1);
  const missing=await open(spaceUrl+'&project=project-gone');
  assert.equal(missing.run('onlineSpaceId'),spaceId);
  assert.equal(missing.run('localProjects.some(project=>project.id==="project-gone")'),false);
  assert.equal(missing.sandbox.message,'Project not found in this Space.');
});

test('saved HTML files stay local even when the browser remembers a Space',async()=>{
  const stored=new Map([['ui-design-editor-last-space-v1','a'.repeat(64)]]);
  const h=harness({spaceUrl:'file:///tmp/saved-design.html',stored});await h.ready;
  let requests=0;h.sandbox.fetch=()=>{requests++;throw Error('A file must stay local');};
  h.run(spaceCode);await h.run('spaceClient.ready');h.run('spaceClient.close()');
  assert.equal(h.run('onlineSpaceId'),null);
  assert.equal(requests,0);
  assert.equal(h.get('space-status').textContent,'Local projects');
  assert.equal(h.get('project-share').hidden,true);
});
