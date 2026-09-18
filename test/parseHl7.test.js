'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseHl7v2 } = require('../src/parseHl7');

const sample = [
  'MSH|^~\\&|SENDING_APP|SENDING_FACILITY|RECEIVING_APP|RECEIVING_FACILITY|20260915120000||ADT^A01|MSG00001|P|2.5',
  'EVN|A01|20260915120000',
  'PID|1||123456^^^HOSPITAL^MR||MUELLER^ANNA^^^^^L||19850312|F|||HAUPTSTRASSE 1^^BERLIN^^10115^DE||^PRN^PH^^^30^1234567',
  'PV1|1|I|WARD1^ROOM2^BED3^HOSPITAL||||1234^SCHMIDT^HANS^^^^^L|||MED||||ADM|A0',
].join('\r');

test('parses field-level values', () => {
  const message = parseHl7v2(sample);
  assert.equal(message.get('PID.7'), '19850312');
  assert.equal(message.get('PID.8'), 'F');
  assert.equal(message.get('PV1.2'), 'I');
  assert.equal(message.get('EVN.1'), 'A01');
});

test('parses component-level values', () => {
  const message = parseHl7v2(sample);
  assert.equal(message.get('PID.5.1'), 'MUELLER');
  assert.equal(message.get('PID.5.2'), 'ANNA');
  assert.equal(message.get('PID.3.1'), '123456');
  assert.equal(message.get('PV1.3.1'), 'WARD1');
});

test('MSH-1 (field separator) and MSH-2 (encoding characters) are handled as the special case they are', () => {
  const message = parseHl7v2(sample);
  assert.equal(message.get('MSH.1'), '|');
  assert.equal(message.get('MSH.2'), '^~\\&');
  assert.equal(message.get('MSH.9.1'), 'ADT');
  assert.equal(message.get('MSH.9.2'), 'A01');
});

test('missing segments/fields return empty string rather than throwing', () => {
  const message = parseHl7v2(sample);
  assert.equal(message.get('OBX.5'), '');
  assert.equal(message.get('PID.99'), '');
});

test('accepts LF-terminated messages, not just CR', () => {
  const lfSample = sample.replace(/\r/g, '\n');
  const message = parseHl7v2(lfSample);
  assert.equal(message.get('PID.8'), 'F');
});
