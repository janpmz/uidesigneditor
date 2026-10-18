const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const root = join(__dirname, '..');
const code = readFileSync(join(__dirname, 'inspector-tabs.js'), 'utf8');
function harness(url = 'https://uidesigneditor.com/') {
  const nodes = new Map(), listeners = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, dataset: {}, attributes: {}, textContent: '',
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name]; },
      focus() { this.focused = true; },
    });
    return nodes.get(id);
  };
  get('codex-prompt').value = readFileSync(join(__dirname, 'inspector-tabs.html'), 'utf8').match(/<textarea id="codex-prompt"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const buttons = ['edit', 'info'].map(name => { const button = get('inspector-tab-' + name);button.dataset.inspectorTab = name;return button; });
  const sandbox = vm.createContext({ selected: new Set(), regionSelection: null, $: get, location: new URL(url),
    stage: { contains: target => target.onStage },
    document: { querySelectorAll: () => buttons, addEventListener: (name, fn) => listeners.set(name, fn) },
  });
  vm.runInContext(code, sandbox);
  return { get, sandbox, run: source => vm.runInContext(source, sandbox), pointer: event => listeners.get('pointerdown')(event) };
}

test('Info opens first, and selecting an item opens Edit', () => {
  const h = harness();
  assert.equal(h.get('inspector-info').hidden, false);
  assert.equal(h.get('inspector').hidden, true);
  assert.equal(h.get('inspector-tab-info').attributes['aria-selected'], 'true');
  assert.equal(h.get('quick-edit').textContent, 'Info');
  h.sandbox.selected.add('title');h.run('syncInspectorTabs()');
  assert.equal(h.get('inspector-info').hidden, true);
  assert.equal(h.get('inspector').hidden, false);
  assert.equal(h.get('quick-edit').textContent, 'Edit');
});

test('the copied prompt opens the current site in a new chat and leaves private URL fields out', async () => {
  const h = harness('http://127.0.0.1:3000/drafts/dark-player-layout/?key=private#selection');
  let copied;
  h.sandbox.navigator = { clipboard: { writeText: async text => { copied = text; } } };
  await h.get('copy-codex-prompt').onclick();
  assert.match(copied, /^Open http:\/\/127\.0\.0\.1:3000\/drafts\/dark-player-layout\/ in Codex's built-in browser/);
  assert.doesNotMatch(copied, /key=private|#selection|https:\/\/uidesigneditor.com/);
  assert.match(copied, /new named project/);
  assert.match(copied, /visible and open/);
  assert.match(copied, /open the same Space link/);
});

test('copied prompts keep the Space link when it changes after the page opens',async()=>{
  const h=harness('https://uidesigneditor.com/?private=value');let copied;
  h.sandbox.location.hash='space='+'a'.repeat(64);
  h.sandbox.navigator={clipboard:{writeText:async text=>{copied=text;}}};
  await h.get('copy-codex-prompt').onclick();
  assert.ok(copied.startsWith('Open https://uidesigneditor.com/#space='+'a'.repeat(64)+' in Codex'));
  assert.doesNotMatch(copied,/private=value/);
});

test('saved files keep the public site address in their prompt', () => {
  const h = harness('file:///tmp/design.html');
  assert.match(h.get('codex-prompt').value, /^Open https:\/\/uidesigneditor\.com\//);
});

test('Info stays open during redraws until the user changes their selection', () => {
  const h = harness();h.sandbox.selected.add('title');h.run('syncInspectorTabs()');
  h.get('inspector-tab-info').onclick();h.run('syncInspectorTabs()');
  assert.equal(h.get('inspector-info').hidden, false);
  assert.deepEqual([...h.sandbox.selected], ['title']);
  h.sandbox.selected.add('button');h.run('syncInspectorTabs()');
  assert.equal(h.get('inspector').hidden, false);
});

test('clicking a selected canvas item opens Edit, and tab keys update focus and panels', () => {
  const h = harness();h.sandbox.selected.add('title');h.run('syncInspectorTabs();showInspectorTab("info")');
  h.pointer({ button: 0, target: { onStage: true, closest: () => ({}) } });
  assert.equal(h.get('inspector').hidden, false);
  let prevented = false;h.get('inspector-tab-edit').onkeydown({ key: 'ArrowRight', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.get('inspector-info').hidden, false);
  assert.equal(h.get('inspector-tab-info').focused, true);
  assert.equal(h.get('inspector-tab-edit').tabIndex, -1);
});

test('the root is the working editor and each sidebar keeps the Info text', () => {
  const info = ['Local projects or a shared Space', 'Local projects stay in your browser', 'Create a Space to share projects across browsers', 'No signup', 'Free to use', 'Open source on GitHub'];
  for (const file of ['index.html', ...['dark-player-layout', 'dark-library-layout', 'dark-chapter-layout', 'dark-add-layout'].map(name => `drafts/${name}/index.html`)]) {
    const html = readFileSync(join(root, file), 'utf8');
    new vm.Script(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
    const content = html.match(/<section class="inspector-info"[^>]*>([\s\S]*?)<\/section>/)[1];
    const facts = content.slice(0, content.indexOf('<div class="codex-prompt">'));
    assert.deepEqual(facts.replace(/<[^>]+>/g, ' ').trim().split(/\s{2,}/).map(text => text.trim()), info);
    assert.equal(html.split('id="editor-inspector"').length - 1, 1);
    assert.equal(html.split('// BEGIN INSPECTOR TABS\n').length - 1, 1);
    if (html.includes('const toolLocations=')) assert.match(html, /\['editor-inspector','home-inspector','tools-edit'\]/);
    const projects = html.match(/<nav class="project-pages" id="editor-pages"[\s\S]*?<\/nav>/)[0];
    if (file === 'index.html' || file === 'drafts/dark-player-layout/index.html') {
      assert.deepEqual([...projects.matchAll(/data-project="([^"]+)"/g)].map(([, id]) => id), ['player', 'library']);
      assert.match(projects, />Projects<\/h2>/);
      assert.doesNotMatch(projects, /href=/);
    }
    if (file === 'index.html') {
      assert.match(html, /id="phone"/);
      assert.match(html, /id="stage"/);
      assert.doesNotMatch(html, /class="hero"|class="hero-copy"|http-equiv="refresh"/);
    }
  }
});
