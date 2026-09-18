'use strict';

/**
 * Wraps our resources in a FHIR "transaction" Bundle. A plain "collection"
 * Bundle (what fhirMapper.js produces) is just a data container — a FHIR
 * server won't persist it as-is. To actually create/update resources you POST
 * a "transaction" Bundle to the server's base URL, where each entry carries
 * its own request (method + url) telling the server what to do with it.
 *
 * We use PUT to each resource's own id (an "upsert") rather than POST, so
 * resubmitting the same HL7v2 message twice updates the same resources
 * instead of creating duplicates.
 */
function toTransactionBundle(bundle) {
  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: bundle.entry.map(({ resource }) => ({
      resource,
      request: { method: 'PUT', url: `${resource.resourceType}/${resource.id}` },
    })),
  };
}

/** Submits our Bundle to a FHIR server as a transaction. Throws if the server rejects it. */
async function submitBundle(bundle, baseUrl) {
  const transactionBundle = toTransactionBundle(bundle);

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json' },
    body: JSON.stringify(transactionBundle),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`FHIR server rejected the bundle (HTTP ${response.status}): ${body}`);
  }

  return response.json();
}

/** Reads a Patient and their Encounters back from the FHIR server, proving the round trip. */
async function getPatientWithEncounters(patientId, baseUrl) {
  const patientResponse = await fetch(`${baseUrl}/Patient/${patientId}`, {
    headers: { Accept: 'application/fhir+json' },
  });

  if (patientResponse.status === 404) {
    return { patient: null, encounters: [] };
  }
  if (!patientResponse.ok) {
    throw new Error(`FHIR server error fetching patient (HTTP ${patientResponse.status})`);
  }
  const patient = await patientResponse.json();

  const encountersResponse = await fetch(`${baseUrl}/Encounter?subject=Patient/${patientId}`, {
    headers: { Accept: 'application/fhir+json' },
  });
  if (!encountersResponse.ok) {
    throw new Error(`FHIR server error fetching encounters (HTTP ${encountersResponse.status})`);
  }
  const searchSet = await encountersResponse.json();
  const encounters = (searchSet.entry || []).map((e) => e.resource);

  return { patient, encounters };
}

module.exports = { toTransactionBundle, submitBundle, getPatientWithEncounters };
