// Read wire fields without assuming their application schema. Never writes game data.
export function readWire(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > 16 * 1024 * 1024) throw new Error('Invalid wire buffer');
  let position = 0;
  function varint() {
    let value = 0n;
    for (let i = 0; i < 10; i++) {
      if (position >= buffer.length) throw new Error('Truncated varint');
      const byte = buffer[position++]; value |= BigInt(byte & 127) << BigInt(7 * i);
      if (!(byte & 128)) return value;
    }
    throw new Error('Invalid varint');
  }
  const fields = [];
  while (position < buffer.length) {
    const offset = position, tag = varint(), field = Number(tag >> 3n), wire = Number(tag & 7n);
    if (!field || field > 536870911 || fields.length > 50000) throw new Error('Invalid field');
    const entry = { field, wire, offset };
    if (wire === 0) entry.value = varint().toString();
    else if (wire === 2) {
      const length = Number(varint());
      if (!Number.isSafeInteger(length) || position + length > buffer.length) throw new Error('Truncated bytes');
      entry.bytes = buffer.subarray(position, position + length); position += length;
    } else if (wire === 1 || wire === 5) {
      const length = wire === 1 ? 8 : 4;
      if (position + length > buffer.length) throw new Error('Truncated fixed field');
      entry.bits = buffer.subarray(position, position + length);
      entry.float = wire === 1 ? buffer.readDoubleLE(position) : buffer.readFloatLE(position); position += length;
    } else throw new Error('Unsupported wire type');
    fields.push(entry);
  }
  return fields;
}

export function numericTree(buffer, depth = 0) {
  if (depth > 16) throw new Error('Wire depth limit');
  return readWire(buffer).map(entry => {
    const result = { field: entry.field, wire: entry.wire };
    if (entry.value !== undefined) result.value = entry.value;
    if (entry.bits) result.hex = entry.bits.toString('hex');
    if (Number.isFinite(entry.float)) result.float = entry.float;
    if (entry.bytes) {
      result.length = entry.bytes.length;
      if (entry.bytes.length) { try { result.fields = numericTree(entry.bytes, depth + 1); } catch { /* Opaque strings and blobs are intentionally omitted. */ } }
    }
    return result;
  });
}
