'use strict';

const express = require('express');
const { parseHl7v2 } = require('./parseHl7');
const { toFhirBundle } = require('./fhirMapper');
const { validateRequiredFields } = require('./validate');
const { submitBundle, getPatientWithEncounters } = require('./fhirClient');

const FHIR_BASE_URL = process.env.FHIR_BASE_URL || 'https://hapi.fhir.org/baseR4';
const PORT = process.env.PORT || 3000;

function createApp() {
  const app = express();

  // Real HL7v2 senders rarely set a JSON/form content-type; accept any
  // content-type as raw text so the body isn't silently dropped.
  app.use(express.text({ type: '*/*', limit: '1mb' }));

  app.post('/messages/hl7v2', async (req, res) => {
    const raw = req.body;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return res.status(400).json({ error: 'Request body must be a non-empty HL7v2 message' });
    }

    const message = parseHl7v2(raw);

    const validationError = validateRequiredFields(message);
    if (validationError) {
      return res.status(422).json({ error: validationError });
    }

    const bundle = toFhirBundle(message);

    try {
      await submitBundle(bundle, FHIR_BASE_URL);
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }

    res.status(201).json(bundle);
  });

  app.get('/patients/:id', async (req, res) => {
    try {
      const result = await getPatientWithEncounters(req.params.id, FHIR_BASE_URL);
      if (!result.patient) {
        return res.status(404).json({ error: `No patient found with id ${req.params.id}` });
      }
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.get('/health', (req, res) => res.json({ status: 'ok', fhirBaseUrl: FHIR_BASE_URL }));

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`HL7v2-FHIR gateway listening on port ${PORT}`);
    console.log(`Forwarding to FHIR server: ${FHIR_BASE_URL}`);
  });
}

module.exports = { createApp };
