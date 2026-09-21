'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseHl7v2 } = require('../src/parseHl7');
const { validateRequiredFields } = require('../src/validate');

const validMessage = [
  'MSH|^~\\&|SENDING_APP|SENDING_FACILITY|RECEIVING_APP|RECEIVING_FACILITY|20260915120000||ADT^A01|MSG00001|P|2.5',
  'EVN|A01|20260915120000',
  'PID|1||123456^^^HOSPITAL^MR||MUELLER^ANNA^^^^^L||19850312|F',
  'PV1|1|I|WARD1',
].join('\r');

test('accepts a message with all required fields present', () => {
  assert.equal(validateRequiredFields(parseHl7v2(validMessage)), null);
});

test('rejects a message missing the patient identifier', () => {
  const missingId = validMessage.replace('PID|1||123456^^^HOSPITAL^MR', 'PID|1||');
  const error = validateRequiredFields(parseHl7v2(missingId));
  assert.match(error, /patient identifier/);
});

test('rejects a message missing the event type', () => {
  const missingEvn = validMessage.replace('EVN|A01|20260915120000', 'EVN||20260915120000');
  const error = validateRequiredFields(parseHl7v2(missingEvn));
  assert.match(error, /event type/);
});

test('rejects a message with an unsupported message type', () => {
  const wrongType = validMessage.replace('ADT^A01', 'ADT^A08');
  const error = validateRequiredFields(parseHl7v2(wrongType));
  assert.match(error, /Unsupported message type/);
  assert.match(error, /ADT\^A08/);
});
