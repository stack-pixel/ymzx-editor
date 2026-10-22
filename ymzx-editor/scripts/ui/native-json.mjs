// Unreal serializes int64 IDs as JSON numbers. Preserve integers outside JS's
// exact range as decimal strings while keeping ordinary numbers and floats.
export function parseNativeJson(raw) {
  if (typeof raw !== 'string') throw Error('Expected native JSON text');
  const numeric = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const safe = BigInt(Number.MAX_SAFE_INTEGER);
  const pieces = [];
  let index = 0, start = 0;
  while (index < raw.length) {
    if (raw[index] === '"') {
      index++;
      while (index < raw.length) {
        if (raw[index] === '\\') index += 2;
        else if (raw[index++] === '"') break;
      }
      continue;
    }
    if (raw[index] === '-' || /\d/.test(raw[index])) {
      numeric.lastIndex = index;
      const match = numeric.exec(raw);
      if (match) {
        const token = match[0];
        if (/^-?\d+$/.test(token)) {
          const value = BigInt(token);
          if (value > safe || value < -safe) {
            pieces.push(raw.slice(start,index), '"', token, '"');
            start = index + token.length;
          }
        }
        index += token.length;
        continue;
      }
    }
    index++;
  }
  pieces.push(raw.slice(start));
  return JSON.parse(pieces.join(''));
}
