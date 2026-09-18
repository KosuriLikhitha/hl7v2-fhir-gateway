'use strict';

// HL7v2 and FHIR use different coded vocabularies for the same real-world
// concepts, so values from the source message have to be translated, not
// passed through as-is. These tables cover the codes used by ADT^A01
// messages; extend them if you map additional trigger events.
const GENDER_MAP = { M: 'male', F: 'female', O: 'other', U: 'unknown' };
const CLASS_MAP = { I: 'IMP', O: 'AMB', E: 'EMER', P: 'PRENC', R: 'AMB' };
const EVENT_STATUS_MAP = {
  A01: 'in-progress', // admit
  A02: 'in-progress', // transfer
  A03: 'finished', // discharge
  A04: 'in-progress', // register
};

function toFhirDate(hl7Date) {
  // HL7v2 dates are YYYYMMDD (or longer, with time); FHIR wants YYYY-MM-DD.
  if (!hl7Date || hl7Date.length < 8) return undefined;
  return `${hl7Date.slice(0, 4)}-${hl7Date.slice(4, 6)}-${hl7Date.slice(6, 8)}`;
}

/** Builds a FHIR Patient resource from a parsed HL7v2 message's PID segment. */
function buildPatient(message) {
  // Prefixed rather than the raw HL7v2 id: public FHIR servers (e.g. HAPI's test
  // sandbox) reject client-assigned ids that are purely numeric, since they'd
  // collide with the server's own auto-generated numeric ids.
  const id = `pat-${message.get('PID.3.1')}`;
  const family = message.get('PID.5.1');
  const given = message.get('PID.5.2');
  const rawGender = message.get('PID.8');
  const birthDate = toFhirDate(message.get('PID.7'));

  return {
    resourceType: 'Patient',
    id,
    name: [{ family, given: given ? [given] : [] }],
    gender: GENDER_MAP[rawGender] || 'unknown',
    ...(birthDate ? { birthDate } : {}),
  };
}

/** Builds a FHIR Encounter resource from a parsed HL7v2 message's PV1/EVN segments, referencing the Patient by id. */
function buildEncounter(message, patientId) {
  const rawClass = message.get('PV1.2');
  const rawEventType = message.get('EVN.1');
  const eventDateTime = message.get('EVN.2') || message.get('MSH.7') || 'unknown-time';
  const location = message.get('PV1.3.1');

  // Deterministic id (derived from patient + event type + event time) rather than a
  // random/server-assigned one: if the same HL7v2 message is delivered twice (a real
  // possibility — networks retry), re-processing it upserts the same Encounter instead
  // of creating a duplicate.
  const id = `${patientId}-${rawEventType}-${eventDateTime}`;

  return {
    resourceType: 'Encounter',
    id,
    status: EVENT_STATUS_MAP[rawEventType] || 'unknown',
    class: { code: CLASS_MAP[rawClass] || 'AMB' },
    subject: { reference: `Patient/${patientId}` },
    ...(location ? { location: [{ location: { display: location } }] } : {}),
  };
}

/**
 * Transforms a parsed HL7v2 ADT message into a FHIR Bundle containing the
 * corresponding Patient and Encounter resources.
 */
function toFhirBundle(message) {
  const patient = buildPatient(message);
  const encounter = buildEncounter(message, patient.id);

  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [{ resource: patient }, { resource: encounter }],
  };
}

module.exports = { toFhirBundle, buildPatient, buildEncounter, GENDER_MAP, CLASS_MAP, EVENT_STATUS_MAP };
