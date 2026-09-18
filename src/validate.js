'use strict';

/**
 * Rejects messages missing the fields our transform needs, with a specific
 * error naming which field — before attempting the transform, not after.
 * Returns an error message string, or null if the message is valid.
 */
function validateRequiredFields(message) {
  const required = [
    ['PID.3.1', 'patient identifier (PID-3.1)'],
    ['PID.5.1', 'patient family name (PID-5.1)'],
    ['EVN.1', 'event type (EVN-1)'],
  ];

  for (const [path, label] of required) {
    if (!message.get(path)) {
      return `Missing required field: ${label}`;
    }
  }

  return null;
}

module.exports = { validateRequiredFields };
