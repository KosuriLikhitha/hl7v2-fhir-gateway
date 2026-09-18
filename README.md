# HL7v2-FHIR Gateway

A small REST service that ingests HL7v2 ADT (Admit/Discharge/Transfer) messages,
transforms them into FHIR resources, and persists them to a real FHIR server — the same
end-to-end flow a production interface engine (Mirth Connect, Rhapsody, InterSystems
HealthShare) runs, built here from scratch to understand the mechanics rather than
treat them as a black box.

Companion project: [hl7v2-to-fhir-transformer](../hl7v2-to-fhir-transformer/) is the
same core transform packaged as a standalone CLI — this project builds on it, adding
the networked "receive → validate → persist → query" parts a real system needs.

## What it actually does

1. **`POST /messages/hl7v2`** — accepts a raw HL7v2 message over HTTP.
2. **Validates** required fields (patient id, family name, event type) before
   attempting the transform, returning a specific error if something's missing.
3. **Transforms** it to a FHIR `Patient` + `Encounter`, reusing the parser/mapper from
   the CLI project (HL7v2's segment→field→component structure, plus code-system
   translation between HL7v2 and FHIR vocabularies).
4. **Persists it to a live FHIR server** — [HAPI FHIR's public test sandbox](https://hapi.fhir.org/baseR4)
   by default, via a FHIR *transaction* Bundle (a plain "collection" Bundle is just a
   data container; a server only persists resources from a transaction/batch Bundle).
5. **`GET /patients/:id`** — reads the Patient and their Encounters back from the FHIR
   server, proving the round trip actually worked.

Resources are **upserted by a deterministic id** (`PUT` to `Patient/{id}`, not `POST` for
a server-assigned one) derived from the HL7v2 message's own identifiers. That means
redelivering the same HL7v2 message twice updates the same resources instead of creating
duplicates — a real concern in production, since networks retry.

## Verified against the real FHIR server (not mocked)

This was actually run end-to-end against the live public sandbox:

```bash
$ curl -X POST http://localhost:3210/messages/hl7v2 --data-binary @sample-data/sample-adt-a01.hl7
# → HTTP 201, Bundle with Patient "pat-123456" and Encounter created

$ curl http://localhost:3210/patients/pat-123456
# → HTTP 200
{
  "patient": {
    "resourceType": "Patient",
    "id": "pat-123456",
    "meta": { "versionId": "1", "lastUpdated": "2026-09-16T08:48:39.253-04:00" },
    "name": [{ "family": "MUELLER", "given": ["ANNA"] }],
    "gender": "female",
    "birthDate": "1985-03-12"
  },
  "encounters": [
    {
      "resourceType": "Encounter",
      "id": "pat-123456-A01-20260915120000",
      "status": "in-progress",
      "class": { "code": "IMP" },
      "subject": { "reference": "Patient/pat-123456" },
      "location": [{ "location": { "display": "WARD1" } }]
    }
  ]
}

# Resubmitting the identical message afterward: Encounter count stays 1 (upsert, no duplicate).
```

One real-world detail discovered only by actually integrating with a live server (not
something you'd find by reading the spec alone): HAPI's public sandbox rejects
client-assigned resource ids that are purely numeric, since they'd collide with its own
auto-generated ids — hence the `pat-` prefix on patient ids in `src/fhirMapper.js`.

## Usage

```bash
npm install
npm test                # unit tests (fetch calls are stubbed — no network needed)
npm start                # starts the server on :3000 (or $PORT)

# in another terminal:
curl -X POST http://localhost:3000/messages/hl7v2 \
  --data-binary @sample-data/sample-adt-a01.hl7 \
  -H "Content-Type: text/plain"

curl http://localhost:3000/patients/pat-123456
```

Or with Docker:
```bash
docker build -t hl7v2-fhir-gateway .
docker run -p 3000:3000 hl7v2-fhir-gateway
```

By default it targets the public HAPI FHIR sandbox. Point it at any other FHIR server
(e.g. a local one) with `FHIR_BASE_URL`:
```bash
FHIR_BASE_URL=http://localhost:8080/fhir npm start
```

## Project structure

```
src/
  parseHl7.js     generic HL7v2 parser (segments → fields → components)
  fhirMapper.js   HL7v2 → FHIR field mapping, code translation, deterministic ids
  fhirClient.js   builds transaction Bundles; submits to / queries the FHIR server
  validate.js     required-field validation before transforming
  server.js       Express app: POST /messages/hl7v2, GET /patients/:id
test/             16 tests — parser, mapper, validation, and FHIR client (fetch stubbed)
sample-data/      example HL7v2 ADT^A01 message
Dockerfile
.github/workflows/ci.yml   runs the test suite on every push
```

## Scope / what's intentionally left out

Deliberately scoped to be a complete, correct, demonstrable slice rather than a partial
general-purpose engine: one message type (ADT^A01), two resource types, no auth (the
public sandbox is open by design; a production version would need OAuth2/SMART on
FHIR), no persistent queue (a dropped connection means the message needs resending —
a real interface engine like Mirth handles retry/queueing, which is exactly what makes
tools like it worth using at scale instead of a script like this one).
