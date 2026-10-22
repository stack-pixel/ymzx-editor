// Validate every reflected input before any native invocation. Missing UObject
// inputs can crash the client even for functions whose names sound read-only.
export function validateNativeArguments(fn, parameters) {
  if (!fn || !Array.isArray(fn.Arguments)) throw Error('Native function schema is absent');
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw Error('Native parameters must be an object');
  const args = new Map(fn.Arguments.map(arg => [arg.Name, arg]));
  for (const key of Object.keys(parameters)) if (!args.has(key)) throw Error('Unknown native argument: ' + key);
  for (const [key, arg] of args) {
    if (!Object.hasOwn(parameters, key)) throw Error('Missing native argument: ' + key);
    const value = parameters[key];
    if (value === null || value === undefined) throw Error('Null native argument: ' + key);
    if (arg.ContainerType) {
      if (arg.ContainerType === 'TArray' && !Array.isArray(value)) throw Error('Native array required: ' + key);
      continue;
    }
    if (/\*$|^TSubclassOf</.test(arg.Type)) {
      if (typeof value !== 'string' || !value.startsWith('/') || value.length > 4096 || /[\x00-\x1f]/.test(value)) throw Error('Nonempty native object path required: ' + key);
    } else if (['FString', 'FName', 'FText'].includes(arg.Type)) {
      if (typeof value !== 'string' || value.includes('\0')) throw Error('Native string required: ' + key);
    } else if (arg.Type === 'bool') {
      if (typeof value !== 'boolean') throw Error('Native boolean required: ' + key);
    } else if (/^(u?int(8|16|32)|byte)$/.test(arg.Type)) {
      if (!Number.isSafeInteger(value)) throw Error('Native integer required: ' + key);
    } else if (/^(u?int64)$/.test(arg.Type)) {
      if (!(typeof value === 'string' && /^-?\d+$/.test(value)) && !Number.isSafeInteger(value)) throw Error('Exact native integer required: ' + key);
    } else if (['float', 'double'].includes(arg.Type)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('Finite native number required: ' + key);
    }
    const choices = arg.MetaData?.EnumValues?.split(',');
    if (choices && !choices.includes(value)) throw Error('Unknown native enum value: ' + key);
  }
  return parameters;
}
