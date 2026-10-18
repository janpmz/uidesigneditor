const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { webcrypto } = require('node:crypto');
const vm = require('node:vm');

const code = readFileSync(join(__dirname, 'webmcp.js'), 'utf8');
const pictureCode = readFileSync(join(__dirname, 'image-drop.js'), 'utf8');
const pictureHelpers = pictureCode.split('// BEGIN PICTURE HELPERS')[1].split('// END PICTURE HELPERS')[0]
  + pictureCode.split('// BEGIN PAGE SIZE HELPERS')[1].split('// END PAGE SIZE HELPERS')[0];
const pageReader = pictureCode.slice(pictureCode.indexOf('function validEditorPage('), pictureCode.indexOf('function renderPicture('));
const pngHeader = Buffer.alloc(24);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(pngHeader);
pngHeader.write('IHDR', 12); pngHeader.writeUInt32BE(640, 16); pngHeader.writeUInt32BE(480, 20);
const png = 'data:image/png;base64,' + pngHeader.toString('base64');
const plain = value => JSON.parse(JSON.stringify(value));

async function harness(options = {}) {
  const tools = new Map(), nodes = new Map(), downloads = [], scenes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', open: false, onclick() {} });
    return nodes.get(id);
  };
  const initial = { version: 1, canvas: { width: 393, height: 852, background: '#ffffff' }, items: [
    { id: 'title', name: 'Title', kind: 'label', x: 20, y: 20, w: 120, h: 40, text: 'Hello', color: '#000000' },
  ] };
  scenes.set('player', initial); scenes.set('library', { ...initial, items: [] });
  const registry = { registerTool(definition) { tools.set(definition.name, definition); }, unregisterTool(name) { tools.delete(name); } };
  const sandbox = {
    crypto: webcrypto, TextEncoder, Uint8Array, ArrayBuffer, DataView, atob, Blob, File,
    document: { getElementById: get, fonts: { ready: Promise.resolve() }, documentElement: { clientWidth: 900, clientHeight: 900 },
      ...(options.support === false || options.navigator ? {} : { modelContext: registry }) },
    navigator: options.navigator ? { modelContext: registry } : {},
    CSS: { supports: (_, value) => /^(#[0-9a-f]{3,8}|transparent|black|white)$/i.test(value) },
    state: initial, activeProject: 'player', localProjects: [{ id: 'player', name: 'Player' }, { id: 'library', name: 'Library' }],
    selected: new Set(), editing: true, history: [], future: [], drag: null, fieldEdit: null,
    canvasGesture: null, canvasEditBusy: false, canvasPan: null, canvasPinch: null,
    pictureDropBusy: false, imageEditSession: null, projectSwitchBusy: false,
    picturesReady: options.ready || Promise.resolve(), projectsReady: Promise.resolve(),
    ICONS: { 'play-outline': 1, 'play-circle': 2, stop: 3 }, $: get, copy: plain, round: value => Math.round(value * 10) / 10,
    canvasViewBusy: () => false, canvasViewCenter: () => ({ x: 196.5, y: 426 }),
    clearCanvasRegion() {}, closeCanvasMenu() {}, closeItemMenu() {}, resetCanvasView() {},
    item: (id, name, kind, x, y, w, h, extra = {}) => ({ id, name, kind, x, y, w, h, fontSize: 11, iconSize: 18, color: '#999999', background: 'transparent', borderColor: '#666666', borderWidth: 0, radius: 0, align: 'center', opacity: 1, text: '', icon: '', hidden: false, ...extra }),
    change(fn) { sandbox.history.push(JSON.stringify(sandbox.state)); sandbox.future.length = 0; fn(); },
    createProject(layout, name) { scenes.set(sandbox.activeProject, sandbox.state); sandbox.activeProject = 'new-' + sandbox.localProjects.length; sandbox.localProjects.push({ id: sandbox.activeProject, name }); sandbox.state = layout; sandbox.selected.clear(); sandbox.history = []; sandbox.future = []; },
    async switchProject(id) { scenes.set(sandbox.activeProject, sandbox.state); sandbox.activeProject = id; sandbox.state = scenes.get(id); },
    async readPicture(file) { return options.readPicture ? options.readPicture(file) : { name: file.name, src: png, width: 640, height: 480 }; },
    DOMParser: class { parseFromString(html) { return { getElementById: id => id === 'initial-layout' ? { textContent: html.match(/id="initial-layout">([\s\S]*?)<\/script>/)?.[1] || 'null' } : null }; } },
    exportHtml: () => '<!doctype html><script type="application/json" id="initial-layout">' + JSON.stringify(sandbox.state) + '</script>',
    downloadBlob: (blob, filename) => downloads.push({ blob, filename }),
    html2canvas: async () => ({ width: 10, height: 10, toDataURL: () => png }),
    rememberRegion: box => ({ box, sources: sandbox.state.items.filter(entry => entry.kind === 'image') }),
    makeRegionPlan: async region => ({ entry: { id: 'fragment', name: 'Picture selection', kind: 'image', x: region.box.x, y: region.box.y, w: region.box.w, h: region.box.h, src: png, pictureFragment: true }, patches: [{ id: 'picture', src: png }] }),
    applyRegionPatches(plan) { for (const patch of plan.patches) Object.assign(sandbox.state.items.find(entry => entry.id === patch.id), patch); },
  };
  get('undo').onclick = () => { sandbox.future.push(JSON.stringify(sandbox.state)); sandbox.state = JSON.parse(sandbox.history.pop()); };
  get('redo').onclick = () => { sandbox.history.push(JSON.stringify(sandbox.state)); sandbox.state = JSON.parse(sandbox.future.pop()); };
  const context = vm.createContext(sandbox);
  if (options.frame) sandbox.window = { self: {}, top: {} };
  vm.runInContext(pictureHelpers + pageReader + code, context);
  await new Promise(resolve => setImmediate(resolve));
  const call = async (name, args = {}) => plain(await tools.get(name).execute(args));
  const target = async () => { const { projectId, revision } = await call('read_design'); return { projectId, revision }; };
  return { tools, sandbox, get, downloads, scenes, call, target };
}

test('tools register on the page, and browsers without them keep the editor', async () => {
  const h = await harness();
  assert.equal(h.tools.size, 9);
  assert.equal(h.get('codex-tools-status').textContent, 'Codex tools ready');
  assert.equal(h.tools.get('read_design').annotations.readOnlyHint, true);
  assert.equal(h.tools.get('edit_design').annotations.readOnlyHint, false);
  const unsupported = await harness({ support: false });
  assert.equal(unsupported.tools.size, 0);
  assert.match(unsupported.get('codex-tools-status').textContent, /supported/);
  assert.equal((await harness({ navigator: true })).tools.size, 9);
  assert.equal((await harness({ frame: true })).tools.size, 0);
});

test('a batch edits items in one Undo step, and Undo and Redo restore it', async () => {
  const h = await harness(), before = plain(h.sandbox.state);
  const result = await h.call('edit_design', { ...await h.target(), updates: [{ id: 'title', changes: { text: 'Changed', x: 80 } }], addItems: [{ kind: 'button', x: 20, y: 200, w: 160, h: 44, text: 'Continue' }] });
  assert.equal(result.ok, true);
  assert.equal(result.design.items[0].text, 'Changed');
  assert.equal(result.design.items[0].w, 120);
  assert.equal(result.addedIds.length, 1);
  assert.equal(h.sandbox.history.length, 1);
  assert.equal(result.design.items[1].opacity, 1);
  assert.deepEqual((await h.call('undo_design', { ...await h.target(), direction: 'undo' })).design, before);
  assert.equal((await h.call('undo_design', { ...await h.target(), direction: 'redo' })).design.items[0].text, 'Changed');
});

test('stale edits and edits to a different project cannot overwrite user work', async () => {
  const h = await harness(), old = await h.target();
  h.sandbox.state.items[0].text = 'User edit';
  assert.equal((await h.call('edit_design', { ...old, removeIds: ['title'] })).ok, false);
  assert.equal((await h.call('edit_design', { ...await h.target(), projectId: 'library', removeIds: ['title'] })).ok, false);
  assert.equal(h.sandbox.state.items[0].text, 'User edit');
  assert.equal(h.sandbox.history.length, 0);
});

test('invalid batches make no partial edit and reject unknown fields, ids, colors and unsafe pictures', async () => {
  const h = await harness(), before = plain(h.sandbox.state);
  const inputs = [
    { updates: [{ id: 'title', changes: { x: 40 } }, { id: 'missing', changes: { x: 1 } }] },
    { updates: [{ id: 'title', changes: { background: 'url(https://example.com/image.png)' } }] },
    { updates: [{ id: 'title', changes: { x: Infinity } }] },
    { updates: [{ id: 'title', changes: { onclick: 'alert(1)' } }] },
    { addItems: [{ kind: 'image', x: 0, y: 0, w: 10, h: 10, src: 'https://example.com/image.png' }] },
    { addItems: [{ id: 'title', kind: 'label', x: 0, y: 0, w: 10, h: 10 }] },
    { canvas: { width: 16000, height: 16000, background: '#000000' } },
  ];
  for (const input of inputs) assert.equal((await h.call('edit_design', { ...await h.target(), ...input })).ok, false);
  assert.deepEqual(plain(h.sandbox.state), before);
  assert.equal(h.sandbox.history.length, 0);
});

test('new designs keep existing projects and project ids can select them again', async () => {
  const h = await harness(), before = plain(h.sandbox.state);
  const created = await h.call('create_design', { ...await h.target(), name: 'Landing', canvas: { width: 800, height: 600, background: '#000000' }, items: [] });
  assert.equal(created.ok, true);
  assert.equal(created.projects.length, 3);
  assert.deepEqual(plain(h.scenes.get('player')), before);
  const switched = await h.call('select_project', { projectId: 'player' });
  assert.deepEqual(switched.design, before);
  assert.equal((await h.call('select_project', { projectId: 'missing' })).ok, false);
});

test('screenshots open at their own size and read results omit image bytes unless asked', async () => {
  const h = await harness();
  const imported = await h.call('import_image', { ...await h.target(), name: 'Screenshot.png', dataUrl: png, mode: 'new' });
  assert.equal(imported.ok, true);
  assert.equal(imported.design.canvas.width, 640);
  assert.equal(imported.design.canvas.height, 480);
  assert.equal(imported.design.items.length, 1);
  assert.equal(imported.design.items[0].src, undefined);
  assert.equal(imported.design.items[0].imageDataOmitted, true);
  assert.equal((await h.call('read_design', { includeImages: true })).design.items[0].src, png);
  assert.equal(h.sandbox.localProjects.length, 3);
});

test('a picture that finishes reading after a user edit makes no change, and busy calls stay blocked', async () => {
  let finish;
  const h = await harness({ readPicture: () => new Promise(resolve => { finish = resolve; }) });
  const pending = h.call('import_image', { ...await h.target(), name: 'Screenshot.png', dataUrl: png, mode: 'add' });
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await h.call('read_design')).ok, false);
  assert.equal((await h.call('read_design')).ok, false);
  h.sandbox.state.items[0].text = 'User edit';
  finish({ src: png, width: 640, height: 480 });
  assert.equal((await pending).ok, false);
  assert.equal(h.sandbox.state.items.length, 1);
  assert.equal(h.sandbox.history.length, 0);
  assert.equal((await h.call('read_design')).design.items[0].text, 'User edit');
});

test('HTML imports use only saved design data and reject other HTML and unsafe saved styles', async () => {
  const h = await harness(), saved = h.sandbox.exportHtml();
  assert.equal((await h.call('import_html', { ...await h.target(), name: 'Saved.html', html: saved + '<script>throw new Error("Must not run")</script>', mode: 'new' })).ok, true);
  const count = h.sandbox.localProjects.length;
  assert.equal((await h.call('import_html', { ...await h.target(), name: 'Other.html', html: '<h1>Other page</h1>', mode: 'new' })).ok, false);
  h.sandbox.state.items[0].background = 'url(https://example.com/image.png)';
  const unsafe = h.sandbox.exportHtml(); delete h.sandbox.state.items[0].background;
  assert.equal((await h.call('import_html', { ...await h.target(), name: 'Unsafe.html', html: unsafe, mode: 'new' })).ok, false);
  assert.equal(h.sandbox.localProjects.length, count);
});

test('picture areas move in one Undo step and reject boxes outside the page', async () => {
  const h = await harness();
  h.sandbox.state.items.push({ id: 'picture', kind: 'image', name: 'Picture', x: 0, y: 0, w: 393, h: 852, src: png, imageBase: true });
  const moved = await h.call('move_image_region', { ...await h.target(), box: { x: 10, y: 20, w: 50, h: 40 }, x: 100, y: 200 });
  assert.equal(moved.ok, true);
  assert.equal(moved.design.items.at(-1).x, 100);
  assert.equal(moved.design.items.at(-1).pictureFragment, true);
  assert.equal(h.sandbox.history.length, 1);
  assert.equal((await h.call('move_image_region', { ...await h.target(), box: { x: 390, y: 20, w: 50, h: 40 }, x: 100, y: 200 })).ok, false);
});

test('tools wait for saved data and do not edit during a drag, text edit or open choice', async () => {
  let finish;
  const h = await harness({ ready: new Promise(resolve => { finish = resolve; }) });
  let done = false;
  const pending = h.call('read_design').then(result => { done = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(done, false); finish(); assert.equal((await pending).ok, true);
  for (const flag of ['drag', 'fieldEdit', 'imageEditSession', 'canvasEditBusy', 'pictureDropBusy', 'projectSwitchBusy']) {
    h.sandbox[flag] = true;
    assert.equal((await h.call('read_design')).ok, false);
    h.sandbox[flag] = null;
  }
  for (const id of ['project-delete-dialog', 'canvas-size-dialog']) {
    h.get(id).open = true;
    assert.equal((await h.call('read_design')).ok, false);
    h.get(id).open = false;
  }
});

test('exports return editable data or download a file without changing the design', async () => {
  const h = await harness(), before = plain(h.sandbox.state), current = await h.target();
  const exported = await h.call('export_design', { ...current, format: 'json', delivery: 'inline' });
  assert.deepEqual(JSON.parse(exported.content), before);
  assert.match((await h.call('export_design', { ...current, format: 'html', delivery: 'inline' })).content, /id="initial-layout"/);
  assert.equal((await h.call('export_design', { ...current, format: 'png', delivery: 'inline' })).content, png);
  assert.equal((await h.call('export_design', { ...current, format: 'html', delivery: 'download' })).downloaded, true);
  assert.equal(h.downloads[0].filename, 'design.html');
  assert.deepEqual(plain(h.sandbox.state), before);
  assert.equal(h.sandbox.history.length, 0);
});

test('built pages and editable exports include the same tools and the new prompt', () => {
  for (const path of ['../index.html', ...['dark-library-layout', 'dark-chapter-layout', 'dark-add-layout'].map(name => '../drafts/' + name + '/index.html')]) {
    const html = readFileSync(join(__dirname, path), 'utf8');
    const script = html.match(/<script data-editor-webmcp>\n([\s\S]*?)\n<\/script>/)[1];
    assert.equal(script.trimEnd(), code.trimEnd());
    new vm.Script(script);
    assert.equal(html.split('<script data-editor-webmcp>').length - 1, 1);
    const prompt = html.match(/<textarea id="codex-prompt"[^>]*>([\s\S]*?)<\/textarea>/)[1];
    assert.match(prompt, /WebMCP site tools/);
    assert.match(prompt, /read_design/);
    assert.doesNotMatch(prompt, /DataTransfer|file drop|localhost/);
  }
});
