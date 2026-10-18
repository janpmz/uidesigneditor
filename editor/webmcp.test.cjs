const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { webcrypto } = require('node:crypto');
const vm = require('node:vm');

const code = readFileSync(join(__dirname, 'webmcp.js'), 'utf8');
const canvasCode = readFileSync(join(__dirname, 'canvas-selection.js'), 'utf8');
const orderCode = canvasCode.slice(canvasCode.indexOf('function orderedCanvasItems('), canvasCode.indexOf('function arrangeSelection('));
const pictureCheck = canvasCode.slice(canvasCode.indexOf('function isPagePicture('), canvasCode.indexOf('function regionSources('));
const regionSourcesCode = canvasCode.slice(canvasCode.indexOf('function regionSources('), canvasCode.indexOf('function clearCanvasRegion('));
const rememberRegionCode = canvasCode.slice(canvasCode.indexOf('function rememberRegion('), canvasCode.indexOf('function canvasSurface('));
const applyRegionCode = canvasCode.slice(canvasCode.indexOf('function applyRegionPatches('), canvasCode.indexOf('function prepareRegion('));
const mergeCode = canvasCode.slice(canvasCode.indexOf('function backgroundMergeForItems('), canvasCode.indexOf('async function mergeSelectionIntoBackground('));
const pixelCode = readFileSync(join(__dirname, 'pixel-tools.js'), 'utf8');
const fitCode = readFileSync(join(__dirname, 'fit-content.js'), 'utf8');
const projectsCode = readFileSync(join(__dirname, 'projects.js'), 'utf8');
const renameCode = projectsCode.slice(projectsCode.indexOf('function renameProject('), projectsCode.indexOf('function openProject('));
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
  const tools = new Map(), nodes = new Map(), downloads = [], scenes = new Map(), renders = [], loadedPictures = [];
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', open: false, onclick() {}, querySelectorAll: () => sandbox.state.items.filter(entry => !entry.hidden).map(entry => ({ dataset: { id: entry.id } })) });
    return nodes.get(id);
  };
  const initial = { version: 1, canvas: { width: 393, height: 852, background: '#ffffff' }, items: [
    { id: 'title', name: 'Title', kind: 'label', x: 20, y: 20, w: 120, h: 40, text: 'Hello', color: '#000000' },
  ] };
  scenes.set('player', initial); scenes.set('library', { ...initial, items: [] });
  const registry = { registerTool(definition) { tools.set(definition.name, definition); }, unregisterTool(name) { tools.delete(name); } };
  const sandbox = {
    crypto: webcrypto, TextEncoder, Uint8Array, ArrayBuffer, DataView, atob, Blob, File,
    document: { getElementById: get, fonts: { ready: options.fonts || Promise.resolve() }, documentElement: { clientWidth: 900, clientHeight: 900 },
      ...(options.support === false || options.navigator ? {} : { modelContext: registry }) },
    navigator: options.navigator ? { modelContext: registry } : {},
    CSS: { supports: (_, value) => /^(#[0-9a-f]{3,8}|transparent|black|white)$/i.test(value) },
    state: initial, activeProject: 'player', localProjects: [{ id: 'player', name: 'Player' }, { id: 'library', name: 'Library' }],
    selected: new Set(), editing: true, history: [], future: [], drag: null, fieldEdit: null,
    canvasGesture: null, canvasEditBusy: false, canvasPan: null, canvasPinch: null,
    pictureDropBusy: false, imageEditSession: null, projectSwitchBusy: false,
    picturesReady: options.ready || Promise.resolve(), projectsReady: Promise.resolve(),
    ICONS: { 'play-outline': 1, 'play-circle': 2, stop: 3 }, $: get, copy: plain, round: value => Math.round(value * 10) / 10, clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    canvasViewBusy: () => false, canvasViewCenter: () => ({ x: 196.5, y: 426 }),
    clearCanvasRegion() {}, closeCanvasMenu() {}, closeItemMenu() {}, resetCanvasView() {},
    renderProjects() { sandbox.projectRenders = (sandbox.projectRenders || 0) + 1; },
    saveProjectList() { sandbox.savedProjects = plain(sandbox.localProjects); },
    measureContentBox: options.measure || (entry => ({ x: entry.x + 5, y: entry.y + 5, w: 60, h: 20 })),
    item: (id, name, kind, x, y, w, h, extra = {}) => ({ id, name, kind, x, y, w, h, fontSize: 11, iconSize: 18, color: '#999999', background: 'transparent', borderColor: '#666666', borderWidth: 0, radius: 0, align: 'center', opacity: 1, text: '', icon: '', hidden: false, ...extra }),
    change(fn) { sandbox.history.push(JSON.stringify(sandbox.state)); sandbox.future.length = 0; fn(); },
    createProject(layout, name) { scenes.set(sandbox.activeProject, sandbox.state); sandbox.activeProject = 'new-' + sandbox.localProjects.length; sandbox.localProjects.push({ id: sandbox.activeProject, name }); sandbox.state = layout; sandbox.selected.clear(); sandbox.history = []; sandbox.future = []; },
    async switchProject(id) { scenes.set(sandbox.activeProject, sandbox.state); sandbox.activeProject = id; sandbox.state = scenes.get(id); },
    async readPicture(file) { return options.readPicture ? options.readPicture(file) : { name: file.name, src: png, width: 640, height: 480 }; },
    DOMParser: class { parseFromString(html) { return { getElementById: id => id === 'initial-layout' ? { textContent: html.match(/id="initial-layout">([\s\S]*?)<\/script>/)?.[1] || 'null' } : null }; } },
    exportHtml: () => '<!doctype html><script type="application/json" id="initial-layout">' + JSON.stringify(sandbox.state) + '</script>',
    downloadBlob: (blob, filename) => downloads.push({ blob, filename }),
    html2canvas: async (phone, renderOptions) => { renders.push(renderOptions); return options.html2canvas ? options.html2canvas(phone, renderOptions) : { width: 10, height: 10, toDataURL: () => png }; },
    selectionImage: async src => { loadedPictures.push(src); return options.selectionImage ? options.selectionImage(src) : { naturalWidth: 640, naturalHeight: 480 }; },
    makeRegionPlan: options.makeRegionPlan || (async region => ({ entry: { id: 'fragment', name: 'Picture selection', kind: 'image', x: region.box.x, y: region.box.y, w: region.box.w, h: region.box.h, src: png, pictureFragment: true }, patches: [{ id: 'picture', src: png }] })),
    spaceClient: options.spaceClient,
  };
  get('undo').onclick = () => { sandbox.future.push(JSON.stringify(sandbox.state)); sandbox.state = JSON.parse(sandbox.history.pop()); };
  get('redo').onclick = () => { sandbox.history.push(JSON.stringify(sandbox.state)); sandbox.state = JSON.parse(sandbox.future.pop()); };
  const context = vm.createContext(sandbox);
  if (options.frame) sandbox.window = { self: {}, top: {} };
  vm.runInContext(pictureHelpers + pageReader + pictureCheck + pixelCode + regionSourcesCode + rememberRegionCode + applyRegionCode + mergeCode + orderCode + fitCode + renameCode + code, context);
  sandbox.measureContentBox = options.measure || (entry => ({ x: entry.x + 5, y: entry.y + 5, w: 60, h: 20 }));
  await new Promise(resolve => setImmediate(resolve));
  const call = async (name, args = {}) => plain(await tools.get(name).execute(args));
  const target = async () => { const { projectId, revision } = await call('read_design'); return { projectId, revision }; };
  return { tools, sandbox, get, downloads, scenes, renders, loadedPictures, call, target };
}

test('tools register on the page, and browsers without them keep the editor', async () => {
  const h = await harness();
  assert.equal(h.tools.size, 14);
  assert.equal(h.get('codex-tools-status').textContent, 'Paste this into Codex, Claude, etc:');
  assert.equal(h.tools.get('read_design').annotations.readOnlyHint, true);
  assert.equal(h.tools.get('edit_design').annotations.readOnlyHint, false);
  const unsupported = await harness({ support: false });
  assert.equal(unsupported.tools.size, 0);
  assert.equal(unsupported.get('codex-tools-status').textContent, 'Paste this into Codex, Claude, etc:');
  assert.equal((await harness({ navigator: true })).tools.size, 14);
  assert.equal((await harness({ frame: true })).tools.size, 0);
});

test('a new connection gets tool and field help plus a usage guide without reading the Info prompt', async () => {
  const h = await harness();
  const checkFields = schema => {
    for (const field of Object.values(schema.properties || {})) {
      assert.ok(field.description?.length > 10, 'Each input field needs useful help.');
      checkFields(field);
    }
    if (schema.items) checkFields(schema.items);
  };
  for (const tool of h.tools.values()) {
    assert.ok(tool.description.length > 100);
    checkFields(tool.inputSchema);
  }
  const result = await h.call('read_design', { iconSearch: 'play' });
  assert.equal(result.ok, true);
  assert.match(result.help.coordinates, /canvas pixels/);
  assert.match(result.help.itemOrder, /arrange_items/);
  assert.match(result.help.itemActions, /fit_items_to_content/);
  assert.match(result.help.images, /erase_image_region/);
  assert.match(result.help.images, /merge_image_items/);
  assert.match(result.help.workflow.join(' '), /rename/);
  assert.deepEqual(result.icons, ['play-outline', 'play-circle']);
  assert.equal(result.help.limits.maxItems, 5000);
  assert.equal(h.tools.has('delete_project'), false);
});

test('item order changes one step, keeps chosen items in order and holds the picture background', async () => {
  const h = await harness(), title = h.sandbox.state.items[0];
  h.sandbox.state.items = [
    { id: 'base', kind: 'image', imageBase: true, x: 0, y: 0, w: 393, h: 852, src: png },
    ...['a', 'b', 'c', 'd'].map(id => ({ ...title, id })),
  ];
  h.sandbox.selected = new Set(['b']);
  const before = plain(h.sandbox.state);
  let result = await h.call('arrange_items', { ...await h.target(), itemIds: ['c', 'a'], direction: 'forward' });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.deepEqual(result.design.items.map(entry => entry.id), ['base', 'b', 'a', 'd', 'c']);
  assert.deepEqual(result.selectedIds, ['b']);
  assert.equal(h.sandbox.history.length, 1);
  result = await h.call('undo_design', { ...await h.target(), direction: 'undo' });
  assert.equal(result.ok, true);
  assert.deepEqual(plain(h.sandbox.state), before);
  result = await h.call('arrange_items', { ...await h.target(), itemIds: ['a'], direction: 'backward' });
  assert.equal(result.changed, false);
  assert.equal(h.sandbox.history.length, 0);
  result = await h.call('arrange_items', { ...await h.target(), itemIds: ['base'], direction: 'forward' });
  assert.equal(result.changed, false);
  result = await h.call('arrange_items', { ...await h.target(), itemIds: ['c', 'd'], direction: 'backward' });
  assert.deepEqual(result.design.items.map(entry => entry.id), ['base', 'a', 'c', 'd', 'b']);
});

test('fit uses canvas measurements, skips other item types and shares one Undo step', async () => {
  const measured = [], h = await harness({ measure: entry => { measured.push(entry.id); return { x: entry.x + 5, y: entry.y + 5, w: 60, h: 20 }; } });
  h.sandbox.state.items.push(
    { ...h.sandbox.state.items[0], id: 'button', kind: 'button' },
    { id: 'shape', kind: 'shape', x: 0, y: 0, w: 80, h: 80 },
    { ...h.sandbox.state.items[0], id: 'hidden', hidden: true },
  );
  const before = plain(h.sandbox.state);
  const result = await h.call('fit_items_to_content', { ...await h.target(), itemIds: ['title', 'button', 'shape', 'hidden'] });
  assert.equal(result.ok, true);
  assert.deepEqual(measured, ['title', 'button']);
  assert.deepEqual(result.fittedIds, ['title', 'button']);
  assert.deepEqual(result.unchangedIds, ['shape', 'hidden']);
  assert.equal(result.design.items[0].text, 'Hello');
  assert.equal(result.design.items[0].w, 60);
  assert.equal(h.sandbox.history.length, 1);
  assert.deepEqual((await h.call('undo_design', { ...await h.target(), direction: 'undo' })).design, before);
});

test('fit makes no Undo step when boxes already fit and rejects edits made while fonts load', async () => {
  const unchanged = await harness({ measure: ({ x, y, w, h }) => ({ x, y, w, h }) });
  const result = await unchanged.call('fit_items_to_content', { ...await unchanged.target(), itemIds: ['title'] });
  assert.deepEqual(result.fittedIds, []);
  assert.deepEqual(result.unchangedIds, ['title']);
  assert.equal(unchanged.sandbox.history.length, 0);
  let finish, started;
  const fonts = new Promise(resolve => { finish = resolve; }), waiting = new Promise(resolve => { started = resolve; });
  const h = await harness({ fonts: { then(resolve, reject) { started(); return fonts.then(resolve, reject); } } });
  const pending = h.call('fit_items_to_content', { ...await h.target(), itemIds: ['title'] });
  await waiting;
  h.sandbox.state.items[0].text = 'User edit';finish();
  assert.equal((await pending).ok, false);
  assert.equal(h.sandbox.history.length, 0);
  assert.equal(h.sandbox.state.items[0].text, 'User edit');
});

test('rename saves the name, keeps the design and Undo history, and changes the revision', async () => {
  const h = await harness(), before = plain(h.sandbox.state), old = await h.target();
  h.sandbox.history.push('older canvas step');
  const result = await h.call('rename_project', { ...old, name: '  New name  ' });
  assert.equal(result.ok, true);
  assert.equal(result.projectId, 'player');
  assert.equal(result.projects[0].name, 'New name');
  assert.equal(h.sandbox.savedProjects[0].name, 'New name');
  assert.deepEqual(result.design, before);
  assert.deepEqual(h.sandbox.history, ['older canvas step']);
  assert.notEqual(result.revision, old.revision);
  assert.equal((await h.call('rename_project', { ...old, name: 'Old request' })).ok, false);
  assert.equal(h.sandbox.localProjects[0].name, 'New name');
  const renders = h.sandbox.projectRenders;
  assert.equal((await h.call('rename_project', { ...await h.target(), name: 'New name' })).ok, true);
  assert.equal(h.sandbox.projectRenders, renders);
  assert.equal((await h.call('rename_project', { ...await h.target(), name: '  ' })).ok, false);
});

test('new item tools reject duplicate or missing ids and old revisions without making changes', async () => {
  for (const name of ['arrange_items', 'fit_items_to_content']) {
    const h = await harness(), before = plain(h.sandbox.state);
    const args = name === 'arrange_items' ? { direction: 'forward' } : {};
    for (const itemIds of [[], ['missing'], ['title', 'title'], ['title', 'missing']]) {
      assert.equal((await h.call(name, { ...await h.target(), ...args, itemIds })).ok, false);
    }
    const old = await h.target();h.sandbox.state.items[0].text = 'User edit';
    assert.equal((await h.call(name, { ...old, ...args, itemIds: ['title'] })).ok, false);
    h.sandbox.state.items[0].text = before.items[0].text;
    assert.deepEqual(plain(h.sandbox.state), before);
    assert.equal(h.sandbox.history.length, 0);
  }
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

function pictureScene(h) {
  h.sandbox.state.items.unshift({ id: 'picture', kind: 'image', name: 'Page picture', x: 0, y: 0, w: 393, h: 852, src: png, imageBase: true, imageContents: { saved: true } });
  h.sandbox.state.items.push({ id: 'piece', kind: 'image', name: 'Moved piece', x: 50, y: 60, w: 40, h: 30, src: png, pictureFragment: true, opacity: .5 });
}

test('erase applies the canvas picture patches, keeps other items and supports Undo and Redo', async () => {
  const h = await harness({ makeRegionPlan: async region => {
    assert.deepEqual(plain(region.box), { x: 40, y: 50, w: 100, h: 100 });
    return { entry: { id: 'discarded-crop' }, patches: [{ id: 'picture', src: png + 'AAAA' }, { id: 'piece', hidden: true }] };
  } });
  pictureScene(h);h.sandbox.selected = new Set(['title', 'piece']);
  const before = plain(h.sandbox.state);
  const result = await h.call('erase_image_region', { ...await h.target(), box: { x: 40, y: 50, w: 100, h: 100 } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.erasedIds, ['picture', 'piece']);
  assert.equal(h.sandbox.state.items.length, before.items.length);
  assert.equal(h.sandbox.state.items[0].src, png + 'AAAA');
  assert.equal(h.sandbox.state.items[0].imageContents, undefined);
  assert.equal(h.sandbox.state.items[2].hidden, true);
  assert.deepEqual(plain(h.sandbox.state.items[1]), before.items[1]);
  assert.deepEqual(result.selectedIds, ['title']);
  assert.equal(h.sandbox.history.length, 1);
  const erased = plain(h.sandbox.state);
  await h.call('undo_design', { ...await h.target(), direction: 'undo' });
  assert.deepEqual(plain(h.sandbox.state), before);
  await h.call('undo_design', { ...await h.target(), direction: 'redo' });
  assert.deepEqual(plain(h.sandbox.state), erased);
});

test('erase rejects boxes outside the page, empty areas, hidden pictures and old revisions', async () => {
  const h = await harness();pictureScene(h);
  for (const box of [{ x: -1, y: 0, w: 20, h: 20 }, { x: 390, y: 0, w: 20, h: 20 }, { x: 0, y: 850, w: 20, h: 20 }, { x: 0, y: 0, w: 0, h: 20 }]) {
    assert.equal((await h.call('erase_image_region', { ...await h.target(), box })).ok, false);
  }
  const old = await h.target();h.sandbox.state.items[1].text = 'User edit';
  assert.equal((await h.call('erase_image_region', { ...old, box: { x: 0, y: 0, w: 20, h: 20 } })).ok, false);
  h.sandbox.state.items = [h.sandbox.state.items[1], { ...h.sandbox.state.items[2], hidden: true }];
  assert.equal((await h.call('erase_image_region', { ...await h.target(), box: { x: 50, y: 60, w: 40, h: 30 } })).ok, false);
  h.sandbox.state.items[1].hidden = false;
  assert.equal((await h.call('erase_image_region', { ...await h.target(), box: { x: 150, y: 160, w: 40, h: 30 } })).ok, false);
  assert.equal(h.sandbox.history.length, 0);
});

test('erase leaves the page alone if the picture read fails or a user edit happens during the read', async () => {
  const failed = await harness({ makeRegionPlan: async () => { throw new Error('Could not read picture.'); } });pictureScene(failed);
  const before = plain(failed.sandbox.state);
  assert.equal((await failed.call('erase_image_region', { ...await failed.target(), box: { x: 0, y: 0, w: 20, h: 20 } })).ok, false);
  assert.deepEqual(plain(failed.sandbox.state), before);
  assert.equal(failed.sandbox.history.length, 0);
  let finish, started;
  const waiting = new Promise(resolve => { started = resolve; });
  const changed = await harness({ makeRegionPlan: () => { started(); return new Promise(resolve => { finish = resolve; }); } });pictureScene(changed);
  const pending = changed.call('erase_image_region', { ...await changed.target(), box: { x: 0, y: 0, w: 20, h: 20 } });
  await waiting;changed.sandbox.state.items[1].text = 'User edit';
  finish({ patches: [{ id: 'picture', hidden: true }] });
  assert.equal((await pending).ok, false);
  assert.equal(changed.sandbox.state.items[0].hidden, undefined);
  assert.equal(changed.sandbox.state.items[1].text, 'User edit');
  assert.equal(changed.sandbox.history.length, 0);
});

test('merge combines the requested pieces and backgrounds, keeps other items and supports Undo and Redo', async () => {
  const h = await harness();pictureScene(h);
  h.sandbox.state.items.push(
    { id: 'background-2', kind: 'image', x: 0, y: 400, w: 393, h: 452, src: png, imageBase: true },
    { id: 'piece-2', kind: 'image', x: 20, y: 500, w: 40, h: 30, src: png, pictureFragment: true },
    { id: 'other-picture', kind: 'image', x: 100, y: 100, w: 40, h: 30, src: png },
  );
  h.sandbox.selected = new Set(['title', 'piece', 'piece-2']);
  const before = plain(h.sandbox.state);
  const result = await h.call('merge_image_items', { ...await h.target(), itemIds: ['piece-2', 'piece'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.mergedIds, ['piece-2', 'piece']);
  assert.equal(result.backgroundId, 'picture');
  assert.deepEqual(result.design.items.map(entry => entry.id), ['picture', 'title', 'other-picture']);
  assert.equal(result.design.items[0].name, 'Page background');
  assert.equal(result.design.items[0].imageContents, undefined);
  assert.equal(result.design.items[0].imageBase, true);
  assert.deepEqual(plain(h.sandbox.state.items[1]), before.items[1]);
  assert.deepEqual(plain(h.sandbox.state.items[2]), before.items.at(-1));
  assert.deepEqual(result.selectedIds, ['title']);
  assert.equal(h.sandbox.history.length, 1);
  assert.equal(h.loadedPictures.length, 4);
  const render = h.renders[0], element = (id, className = 'item') => ({ dataset: { id }, classList: { contains: name => name === className } });
  for (const id of ['piece', 'piece-2', 'picture', 'background-2']) assert.equal(render.ignoreElements(element(id)), false);
  for (const id of ['title', 'other-picture']) assert.equal(render.ignoreElements(element(id)), true);
  assert.equal(render.ignoreElements(element('', 'selection-overlay')), true);
  const merged = plain(h.sandbox.state);
  await h.call('undo_design', { ...await h.target(), direction: 'undo' });
  assert.deepEqual(plain(h.sandbox.state), before);
  await h.call('undo_design', { ...await h.target(), direction: 'redo' });
  assert.deepEqual(plain(h.sandbox.state), merged);
});

test('merge rejects mixed, missing, repeated or hidden items, missing backgrounds and old revisions', async () => {
  const h = await harness();pictureScene(h);const before = plain(h.sandbox.state);
  for (const itemIds of [[], ['title'], ['piece', 'title'], ['missing'], ['piece', 'piece'], ['picture']]) {
    assert.equal((await h.call('merge_image_items', { ...await h.target(), itemIds })).ok, false);
  }
  h.sandbox.state.items[2].hidden = true;
  assert.equal((await h.call('merge_image_items', { ...await h.target(), itemIds: ['piece'] })).ok, false);
  h.sandbox.state.items[2].hidden = false;
  h.sandbox.state.items[0].hidden = true;
  assert.equal((await h.call('merge_image_items', { ...await h.target(), itemIds: ['piece'] })).ok, false);
  h.sandbox.state = plain(before);
  const old = await h.target();h.sandbox.state.items[1].text = 'User edit';
  assert.equal((await h.call('merge_image_items', { ...old, itemIds: ['piece'] })).ok, false);
  assert.equal(h.sandbox.history.length, 0);
  assert.equal(h.loadedPictures.length, 0);
  assert.equal(h.renders.length, 0);
});

test('merge leaves the page alone after a picture failure or an edit during either picture read', async () => {
  for (const failAt of ['selectionImage', 'html2canvas']) {
    const failed = await harness({ [failAt]: async () => { throw new Error('Could not read picture.'); } });pictureScene(failed);
    const before = plain(failed.sandbox.state);
    assert.equal((await failed.call('merge_image_items', { ...await failed.target(), itemIds: ['piece'] })).ok, false);
    assert.deepEqual(plain(failed.sandbox.state), before);
    assert.equal(failed.sandbox.history.length, 0);
    let finish, started;
    const waiting = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { finish = resolve; });
    const changed = await harness({ [failAt]: () => { started(); return gate; } });pictureScene(changed);
    const pending = changed.call('merge_image_items', { ...await changed.target(), itemIds: ['piece'] });
    await waiting;changed.sandbox.state.items[1].text = 'User edit';
    finish(failAt === 'selectionImage' ? { naturalWidth: 640, naturalHeight: 480 } : { toDataURL: () => png });
    assert.equal((await pending).ok, false);
    assert.equal(changed.sandbox.state.items.length, 3);
    assert.equal(changed.sandbox.state.items[1].text, 'User edit');
    assert.equal(changed.sandbox.history.length, 0);
  }
});

test('erase and merge wait for the shared save before reporting success', async () => {
  for (const name of ['erase_image_region', 'merge_image_items']) {
    let finish, started, done = false;
    const waiting = new Promise(resolve => { started = resolve; });
    const h = await harness({ spaceClient: { ready: Promise.resolve(), saved: () => { started(); return new Promise(resolve => { finish = resolve; }); } } });pictureScene(h);
    const args = name === 'erase_image_region' ? { box: { x: 0, y: 0, w: 20, h: 20 } } : { itemIds: ['piece'] };
    const pending = h.call(name, { ...await h.target(), ...args }).then(result => { done = true; return result; });
    await waiting;assert.equal(done, false);finish();
    assert.equal((await pending).ok, true);
    assert.equal(h.sandbox.history.length, 1);
  }
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
  const instructions = readFileSync(join(__dirname, '../instructions.txt'), 'utf8');
  assert.match(instructions, /WebMCP site tools/);
  assert.match(instructions, /read_design/);
  assert.match(instructions, /new named project/);
  assert.match(instructions, /visible and open/);
  assert.match(instructions, /open the same Space link/);
  assert.match(instructions, /erase_image_region/);
  assert.match(instructions, /merge_image_items/);
  for (const path of ['../index.html', ...['dark-library-layout', 'dark-chapter-layout', 'dark-add-layout'].map(name => '../drafts/' + name + '/index.html')]) {
    const html = readFileSync(join(__dirname, path), 'utf8');
    const script = html.match(/<script data-editor-webmcp>\n([\s\S]*?)\n<\/script>/)[1];
    assert.equal(script.trimEnd(), code.trimEnd());
    new vm.Script(script);
    assert.equal(html.split('<script data-editor-webmcp>').length - 1, 1);
    const prompt = html.match(/<textarea id="codex-prompt"[^>]*>([\s\S]*?)<\/textarea>/)[1];
    assert.match(prompt, /Read the instructions: https:\/\/uidesigneditor\.com\/instructions\.txt/);
    assert.match(prompt, /My Space URL: https:\/\/uidesigneditor\.com\/$/);
    assert.equal(prompt, readFileSync(join(__dirname, 'inspector-tabs.html'), 'utf8').match(/<textarea id="codex-prompt"[^>]*>([\s\S]*?)<\/textarea>/)[1]);
    assert.doesNotMatch(prompt, /DataTransfer|file drop|localhost/);
  }
});
