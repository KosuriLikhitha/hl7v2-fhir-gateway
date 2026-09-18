'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseHl7v2 } = require('../src/parseHl7');
const { toFhirBundle } = require('../src/fhirMapper');

const sample = [
  'MSH|^~\\&|SENDING_APP|SENDING_FACILITY|RECEIVING_APP|RECEIVING_FACILITY|20260915120000||ADT^A01|MSG00001|P|2.5',
  'EVN|A01|20260915120000',
  'PID|1||123456^^^HOSPITAL^MR||MUELLER^ANNA^^^^^L||19850312|F|||HAUPTSTRASSE 1^^BERLIN^^10115^DE||^PRN^PH^^^30^1234567',
  'PV1|1|I|WARD1^ROOM2^BED3^HOSPITAL||||1234^SCHMIDT^HANS^^^^^L|||MED||||ADM|A0',
].join('\r');

test('builds a Bundle with a correctly mapped Patient and Encounter', () => {
  const bundle = toFhirBundle(parseHl7v2(sample));

  assert.equal(bundle.resourceType, 'Bundle');
  assert.equal(bundle.entry.length, 2);

  const [patient, encounter] = bundle.entry.map((e) => e.resource);

  assert.deepEqual(patient, {
    resourceType: 'Patient',
    id: 'pat-123456',
    name: [{ family: 'MUELLER', given: ['ANNA'] }],
    gender: 'female',
    birthDate: '1985-03-12',
  });

  assert.deepEqual(encounter, {
    resourceType: 'Encounter',
    id: 'pat-123456-A01-20260915120000',
    status: 'in-progress',
    class: { code: 'IMP' },
    subject: { reference: 'Patient/pat-123456' },
    location: [{ location: { display: 'WARD1' } }],
  });
});

test('Encounter id is deterministic (same input -> same id), for idempotent upserts on redelivery', () => {
  const bundleA = toFhirBundle(parseHl7v2(sample));
  const bundleB = toFhirBundle(parseHl7v2(sample));
  assert.equal(bundleA.entry[1].resource.id, bundleB.entry[1].resource.id);
});

test('falls back to safe defaults for unmapped HL7v2 codes instead of throwing', () => {
  const withUnknownCodes = sample
    .replace('|F|||', '|X|||') // unrecognized gender code
    .replace('PV1|1|I|', 'PV1|1|Z|'); // unrecognized class code

  const bundle = toFhirBundle(parseHl7v2(withUnknownCodes));
  const [patient, encounter] = bundle.entry.map((e) => e.resource);

  assert.equal(patient.gender, 'unknown');
  assert.equal(encounter.class.code, 'AMB');
});
