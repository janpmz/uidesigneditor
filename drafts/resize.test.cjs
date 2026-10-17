const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

for (const page of ['dark-player-layout', 'dark-library-layout', 'dark-chapter-layout']) {
  const html = readFileSync(join(__dirname, page, 'index.html'), 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  new vm.Script(script);
  const helper = script.split('// BEGIN ITEM SCALE')[1].split('// END ITEM SCALE')[0];
  const resize = vm.runInNewContext(helper + '\nscaleItemFromCorner', {
    round: value => Math.round(value * 10) / 10,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  });
  const canvas = { width: 393, height: 852 };
  const sample = () => ({
    x: 20, y: 20, w: 100, h: 50, fontSize: 20, iconSize: 16,
    radius: 8, borderWidth: 2, iconOffsetX: 2, lineHeight: 1.35,
    color: '#a78bfa', opacity: 0.8,
  });

  test(page + ': the corner scales text, icons, borders and corners with the box', () => {
    const start = sample(), item = { ...start };
    resize(item, start, 50, 25, canvas);
    assert.deepEqual([item.w, item.h, item.fontSize, item.iconSize, item.radius, item.borderWidth, item.iconOffsetX],
      [150, 75, 30, 24, 12, 3, 3]);
    assert.equal(item.contentScale, 1.5);
    assert.deepEqual([item.x, item.y, item.lineHeight, item.color, item.opacity], [20, 20, 1.35, '#a78bfa', 0.8]);
  });

  test(page + ': shrinking also shrinks the contents and their spacing', () => {
    const start = { ...sample(), w: 200, h: 100, fontSize: 40, iconSize: 32, contentScale: 2 };
    const item = { ...start };
    resize(item, start, -100, -50, canvas);
    assert.deepEqual([item.w, item.h, item.fontSize, item.iconSize, item.contentScale], [100, 50, 20, 16, 1]);
  });

  test(page + ': each pointer move uses the size at the start of the drag', () => {
    const start = sample(), item = { ...start };
    resize(item, start, 20, 10, canvas);
    resize(item, start, 50, 25, canvas);
    assert.deepEqual([item.w, item.h, item.fontSize, item.iconSize], [150, 75, 30, 24]);
  });

  test(page + ': resizing can extend past the page edge', () => {
    const start = { ...sample(), x: 200, y: 780 }, item = { ...start };
    resize(item, start, 200, 100, canvas);
    assert.deepEqual([item.w, item.h, item.fontSize], [300, 150, 60]);
    assert.ok(item.x + item.w > canvas.width);
    assert.ok(item.y + item.h > canvas.height);
  });

  test(page + ': thin shapes stay thin and zero borders stay zero', () => {
    const start = { x: 20, y: 20, w: 200, h: 1, borderWidth: 0, radius: 0 }, item = { ...start };
    resize(item, start, 100, 0.5, canvas);
    assert.deepEqual([item.w, item.h, item.borderWidth, item.radius], [300, 1.5, 0, 0]);
    assert.equal(item.fontSize, undefined);
    assert.equal(item.iconSize, undefined);
  });

  test(page + ': a small drag keeps its size without rounding to four pixels', () => {
    const start = sample(), item = { ...start };
    resize(item, start, 17, 8.5, canvas);
    assert.deepEqual([item.w, item.h, item.fontSize], [117, 58.5, 23.4]);
  });
}
