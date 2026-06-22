import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeArrangement } from './layout.js';

test('empty -> scale 1, no tiles', () => {
  assert.deepEqual(computeArrangement([], 100, 100), { scale: 1, tiles: [] });
});

test('single monitor fills area on the limiting axis, centered', () => {
  const a = computeArrangement([{ connector: 'DP-1', geometry: { x: 0, y: 0, width: 200, height: 100 } }], 100, 100);
  // bbox 200x100, area 100x100 -> scale = min(100/200, 100/100) = 0.5
  assert.equal(a.scale, 0.5);
  const t = a.tiles[0].rect;
  assert.equal(t.width, 100);
  assert.equal(t.height, 50);
  // centered: x offset (100-100)/2=0, y offset (100-50)/2=25
  assert.equal(t.x, 0);
  assert.equal(t.y, 25);
});

test('two monitors with negative origin normalized and scaled together', () => {
  const a = computeArrangement([
    { connector: 'DP-1', geometry: { x: -100, y: 0, width: 100, height: 100 } },
    { connector: 'HDMI-1', geometry: { x: 0, y: 0, width: 100, height: 200 } },
  ], 200, 200);
  // bbox: x[-100..100]=200 wide, y[0..200]=200 tall -> scale=min(200/200,200/200)=1
  assert.equal(a.scale, 1);
  const dp = a.tiles.find(t => t.connector === 'DP-1')!.rect;
  const hdmi = a.tiles.find(t => t.connector === 'HDMI-1')!.rect;
  // normalized: DP at x 0, HDMI at x 100; bbox 200x200 fits exactly -> no centering offset
  assert.deepEqual(dp, { x: 0, y: 0, width: 100, height: 100 });
  assert.deepEqual(hdmi, { x: 100, y: 0, width: 100, height: 200 });
});

test('rotated (portrait) tile keeps its given geometry', () => {
  // rotation is already reflected in the geometry passed in (tall = portrait)
  const a = computeArrangement([{ connector: 'HDMI-1', geometry: { x: 0, y: 0, width: 100, height: 200 } }], 200, 200);
  assert.equal(a.scale, 1);
  assert.deepEqual(a.tiles[0].rect, { x: 50, y: 0, width: 100, height: 200 }); // centered horizontally
});
