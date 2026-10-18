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
      select() { this.selected = true; },
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

test('the AI prompt keeps its size when the user switches tabs', () => {
  const h = harness();
  assert.equal(h.get('codex-prompt-details').hidden, false);
  h.get('toggle-codex-prompt').onclick();
  assert.equal(h.get('codex-prompt-details').hidden, true);
  assert.equal(h.get('inspector-info').hidden, false);
  h.get('inspector-tab-edit').onclick();
  h.get('inspector-tab-info').onclick();
  assert.equal(h.get('codex-prompt-details').hidden, true);
  h.get('toggle-codex-prompt').onclick();
  assert.equal(h.get('toggle-codex-prompt').attributes['aria-expanded'], 'true');
  h.sandbox.selected.add('title');h.run('syncInspectorTabs()');
  assert.equal(h.get('codex-prompt-details').hidden, false);
  assert.equal(h.get('inspector').hidden, false);
  h.get('inspector-tab-info').onclick();
  assert.equal(h.get('codex-prompt-details').hidden, false);
});

test('the copied prompt stays short, includes the current site and ends with the guide', async () => {
  const h = harness('http://127.0.0.1:3000/drafts/dark-player-layout/?key=private#selection');
  let copied;
  h.sandbox.navigator = { clipboard: { writeText: async text => { copied = text; } } };
  await h.get('copy-codex-prompt').onclick();
  assert.match(copied, /^Help me design this project\./);
  assert.match(copied, /Read the instructions: https:\/\/uidesigneditor\.com\/instructions\.txt$/);
  assert.match(copied, /\n\nMy Space URL: http:\/\/127\.0\.0\.1:3000\/drafts\/dark-player-layout\/\n\nRead the instructions:/);
  assert.doesNotMatch(copied, /key=private|#selection|read_design|projectId|revision/);
  assert.ok(copied.trim().split(/\s+/).length < 40);
});

test('Copy works while the AI panel is small and shows that the prompt was copied', async () => {
  const h = harness();let copied;
  h.sandbox.navigator = { clipboard: { writeText: async text => { copied = text; } } };
  h.get('toggle-codex-prompt').onclick();
  await h.get('copy-codex-prompt').onclick();
  assert.equal(copied, h.get('codex-prompt').value);
  assert.equal(h.get('codex-prompt-details').hidden, true);
  assert.equal(h.get('copy-codex-prompt').textContent, 'Copied');
  h.get('copy-codex-prompt').onblur();
  assert.equal(h.get('copy-codex-prompt').textContent, 'Copy prompt');
});

test('a failed copy opens the AI panel so the user can copy the selected text', async () => {
  const h = harness();
  h.sandbox.navigator = { clipboard: { writeText: async () => { throw new Error('Copy blocked'); } } };
  h.get('inspector-tab-edit').onclick();
  await h.get('copy-codex-prompt').onclick();
  assert.equal(h.get('codex-prompt-details').hidden, false);
  assert.equal(h.get('codex-prompt').focused, true);
  assert.equal(h.get('codex-prompt').selected, true);
  assert.equal(h.get('inspector-info').hidden, true);
  assert.equal(h.get('inspector').hidden, false);
  assert.match(h.get('codex-prompt-status').textContent, /Press Ctrl\+C/);
});

test('copied prompts keep the Space link when it changes after the page opens',async()=>{
  const h=harness('https://uidesigneditor.com/?private=value');let copied;
  h.sandbox.location.hash='space='+'a'.repeat(64);
  h.sandbox.navigator={clipboard:{writeText:async text=>{copied=text;}}};
  await h.get('copy-codex-prompt').onclick();
  assert.ok(copied.split('\n').includes('My Space URL: https://uidesigneditor.com/#space='+'a'.repeat(64)));
  assert.doesNotMatch(copied,/private=value/);
  h.sandbox.location.hash='space='+'b'.repeat(64);
  await h.get('copy-codex-prompt').onclick();
  assert.ok(copied.split('\n').includes('My Space URL: https://uidesigneditor.com/#space='+'b'.repeat(64)));
  assert.match(copied,/Read the instructions: https:\/\/uidesigneditor\.com\/instructions\.txt/);
  assert.equal(copied.split('My Space URL:').length-1,1);
  h.sandbox.location.hash='space='+'b'.repeat(64)+'&project=project-123';
  await h.get('copy-codex-prompt').onclick();
  assert.ok(copied.split('\n').includes('My Space URL: https://uidesigneditor.com/#space='+'b'.repeat(64)+'&project=project-123'));
});

test('saved files keep the public site address in their prompt', () => {
  const h = harness('file:///tmp/design.html');
  assert.match(h.get('codex-prompt').value, /My Space URL: https:\/\/uidesigneditor\.com\/$/m);
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
  const info = ['Free design editor', 'No signup', 'Connect your AI', 'Share your space', 'Open source on GitHub', 'About', 'Privacy policy'];
  for (const file of ['index.html', ...['dark-library-layout', 'dark-chapter-layout', 'dark-add-layout'].map(name => `drafts/${name}/index.html`)]) {
    const html = readFileSync(join(root, file), 'utf8');
    new vm.Script(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
    const content = html.match(/<section class="inspector-info"[^>]*>([\s\S]*?)<\/section>/)[1];
    assert.deepEqual(content.replace(/<[^>]+>/g, ' ').trim().split(/\s{2,}/).map(text => text.trim()), info);
    assert.doesNotMatch(content, /id="copy-codex-prompt"/);
    assert.match(html, /<\/section>\s*<section class="codex-prompt"[^>]*>[\s\S]*?id="copy-codex-prompt"[\s\S]*?<\/section>\s*<footer class="inspector-credit">/);
    assert.equal(html.split('id="copy-codex-prompt"').length - 1, 1);
    assert.equal(html.split('id="editor-inspector"').length - 1, 1);
    assert.equal(html.split('// BEGIN INSPECTOR TABS\n').length - 1, 1);
    if (html.includes('const toolLocations=')) assert.match(html, /\['editor-inspector','home-inspector','tools-edit'\]/);
    const projects = html.match(/<nav class="project-pages" id="editor-pages"[\s\S]*?<\/nav>/)[0];
    if (file === 'index.html') {
      assert.deepEqual([...projects.matchAll(/data-project="([^"]+)"/g)].map(([, id]) => id), ['landing', 'player', 'library']);
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
