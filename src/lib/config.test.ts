import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, fileForConnector, defaultFile } from './config.js';

test('parseConfig: valid object', () => {
  assert.deepEqual(parseConfig('{"default":"/a.jpg"}'), { default: '/a.jpg' });
});
test('parseConfig: invalid JSON -> {}', () => {
  assert.deepEqual(parseConfig('not json'), {});
});
test('parseConfig: non-object JSON -> {}', () => {
  assert.deepEqual(parseConfig('[1,2]'), {});
  assert.deepEqual(parseConfig('"x"'), {});
  assert.deepEqual(parseConfig('null'), {});
});
test('fileForConnector: returns the entry file', () => {
  const c = { monitors: { 'DP-1': { file: '/a.jpg', mode: 'zoom' } } };
  assert.equal(fileForConnector(c, 'DP-1'), '/a.jpg');
});
test('fileForConnector: missing entry/file -> null', () => {
  assert.equal(fileForConnector({ monitors: {} }, 'DP-1'), null);
  assert.equal(fileForConnector({}, 'DP-1'), null);
  assert.equal(fileForConnector({ monitors: { 'DP-1': {} } }, 'DP-1'), null);
});
test('defaultFile: string or null', () => {
  assert.equal(defaultFile({ default: '/d.jpg' }), '/d.jpg');
  assert.equal(defaultFile({}), null);
});
