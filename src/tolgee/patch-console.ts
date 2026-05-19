const sanitize = (val: any): any => {
  if (val === null || val === undefined) return val;
  const t = typeof val;
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return val;
  }
  if (t === 'symbol') {
    return val.toString();
  }
  if (t === 'function') {
    return val.toString();
  }
  try {
    if (val instanceof Error) {
      return val.stack || val.message;
    }
    const seen = new WeakSet();
    const str = JSON.stringify(val, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      if (typeof value === 'symbol') {
        return value.toString();
      }
      return value;
    });
    return str || String(val);
  } catch (e) {
    try {
      return String(val);
    } catch (err) {
      return '[Non-serializable Object]';
    }
  }
};

const patchConsole = (method: keyof Console) => {
  const orig = console[method];
  if (typeof orig === 'function') {
    console[method] = function(...args: any[]) {
      const sanitizedArgs = args.map(sanitize);
      return (orig as any).apply(console, sanitizedArgs);
    } as any;
  }
};

patchConsole('log');
patchConsole('warn');
patchConsole('error');
patchConsole('info');
patchConsole('debug');
