'use strict';

/**
 * A minimal, generic HL7v2 parser.
 *
 * HL7v2 messages are structured as:
 *   segment (line) -> fields (separated by "|") -> components (separated by "^")
 *
 * The MSH segment is a special case: the character right after "MSH" IS the
 * field separator itself (normally "|"), and the very next field (MSH-2) is
 * the "encoding characters" (normally "^~\&") rather than ordinary data.
 * Every other segment splits on "|" like normal.
 */

function parseSegment(line) {
  const name = line.substring(0, 3);

  if (name === 'MSH') {
    const fieldSeparator = line.charAt(3);
    const rest = line.substring(4).split(fieldSeparator);
    // fields[0] = MSH-1 (the field separator character itself)
    // fields[1] = MSH-2 (encoding characters)
    // fields[2..] = MSH-3 onward, same as any other segment
    return { name, fields: [fieldSeparator, ...rest] };
  }

  const parts = line.split('|');
  // parts[0] is the segment name; fields[0] corresponds to field 1
  return { name, fields: parts.slice(1) };
}

class Hl7Message {
  constructor(raw) {
    const lines = raw
      .split(/\r\n|\r|\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    this.segments = lines.map(parseSegment);
  }

  /** All segments with this 3-letter name, in message order (handles repeating segments like OBX). */
  getSegments(segmentName) {
    return this.segments.filter((s) => s.name === segmentName);
  }

  /** First segment with this name, or undefined if the message doesn't contain it. */
  getSegment(segmentName) {
    return this.segments.find((s) => s.name === segmentName);
  }

  /**
   * Read a value by HL7 path, e.g. "PID.5.1" (segment.field.component) or
   * "PID.7" (segment.field, returns the raw field text including any "^" components).
   * Returns '' if the segment/field/component doesn't exist in this message,
   * rather than throwing — real-world messages are frequently missing optional fields.
   */
  get(path) {
    const [segmentName, fieldNum, componentNum] = path.split('.');
    const segment = this.getSegment(segmentName);
    if (!segment) return '';

    const fieldValue = segment.fields[Number(fieldNum) - 1] || '';
    if (componentNum === undefined) return fieldValue;

    const components = fieldValue.split('^');
    return components[Number(componentNum) - 1] || '';
  }
}

function parseHl7v2(raw) {
  return new Hl7Message(raw);
}

module.exports = { parseHl7v2, Hl7Message };
