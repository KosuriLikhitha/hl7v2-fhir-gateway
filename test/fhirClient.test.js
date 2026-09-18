'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toTransactionBundle, submitBundle, getPatientWithEncounters } = require('../src/fhirClient');

test('toTransactionBundle wraps each resource in a PUT request to its own id (upsert)', () => {
  const bundle = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [
      { resource: { resourceType: 'Patient', id: '123456' } },
      { resource: { resourceType: 'Encounter', id: '123456-A01-20260915120000' } },
    ],
  };

  const transaction = toTransactionBundle(bundle);

  assert.equal(transaction.type, 'transaction');
  assert.equal(transaction.entry[0].request.method, 'PUT');
  assert.equal(transaction.entry[0].request.url, 'Patient/123456');
  assert.equal(transaction.entry[1].request.url, 'Encounter/123456-A01-20260915120000');
});

test('submitBundle POSTs the transaction bundle and throws with the server body on failure', async (t) => {
  let capturedRequest;
  t.mock.method(global, 'fetch', async (url, options) => {
    capturedRequest = { url, options };
    return { ok: true, json: async () => ({ resourceType: 'Bundle', type: 'transaction-response' }) };
  });

  const bundle = { resourceType: 'Bundle', type: 'collection', entry: [{ resource: { resourceType: 'Patient', id: '1' } }] };
  await submitBundle(bundle, 'https://example.test/fhir');

  assert.equal(capturedRequest.url, 'https://example.test/fhir');
  assert.equal(capturedRequest.options.method, 'POST');
  const sentBody = JSON.parse(capturedRequest.options.body);
  assert.equal(sentBody.type, 'transaction');
});

test('submitBundle throws a descriptive error when the server rejects the bundle', async (t) => {
  t.mock.method(global, 'fetch', async () => ({
    ok: false,
    status: 400,
    text: async () => 'OperationOutcome: invalid resource',
  }));

  const bundle = { resourceType: 'Bundle', type: 'collection', entry: [] };
  await assert.rejects(
    () => submitBundle(bundle, 'https://example.test/fhir'),
    /HTTP 400.*OperationOutcome/s
  );
});

test('getPatientWithEncounters returns null patient (not a throw) on 404', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 404 }));

  const result = await getPatientWithEncounters('does-not-exist', 'https://example.test/fhir');
  assert.equal(result.patient, null);
  assert.deepEqual(result.encounters, []);
});

test('getPatientWithEncounters combines the Patient read and Encounter search', async (t) => {
  let callCount = 0;
  t.mock.method(global, 'fetch', async (url) => {
    callCount += 1;
    if (url.includes('/Patient/')) {
      return { ok: true, status: 200, json: async () => ({ resourceType: 'Patient', id: '123456' }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [{ resource: { resourceType: 'Encounter', id: 'enc-1' } }],
      }),
    };
  });

  const result = await getPatientWithEncounters('123456', 'https://example.test/fhir');
  assert.equal(callCount, 2);
  assert.equal(result.patient.id, '123456');
  assert.equal(result.encounters.length, 1);
});
