/**
 * 📦 compiler.ts — Pure, zero-dependency i18n ICU-Lite pluralization and parameter compiler.
 * Safe for both Client (browser) and Server (Node.js/Edge) runtimes.
 */

/**
 * Compiles plural ICU rules such as:
 * "{count, plural, zero {aucun article} one {1 article} other {{count} articles}}"
 */
export function compilePlural(
  text: string,
  lang: string,
  params: Record<string, string | number>
): string {
  // Matches ICU plural blocks: {variableName, plural, rules...}
  const pluralRegex = /\{([^,]+),\s*plural,\s*([^{}]+(?:\{[^{}]*\}[^{}]*)*)\}/g;

  return text.replace(pluralRegex, (match, varName, rulesText) => {
    const trimmedVarName = varName.trim();
    const value = Number(params[trimmedVarName]);
    if (isNaN(value)) return match;

    // Parse the rules
    const rules: Record<string, string> = {};
    const ruleRegex = /([\w=]+)\s*\{([^}]+)\}/g;
    let rMatch;

    // Using a simple loop to avoid regex execution trapping
    while ((rMatch = ruleRegex.exec(rulesText)) !== null) {
      rules[rMatch[1]] = rMatch[2];
    }

    // Resolve active plural category using standard browser/Node API
    const pr = new Intl.PluralRules(lang);
    const category = pr.select(value);

    // Order of resolution:
    // 1. Exact numeric match (e.g. =0, =1, =2)
    // 2. Language-specific category (zero, one, two, few, many, other)
    // 3. Fallback to "other"
    const ruleToUse = rules[`=${value}`] || rules[category] || rules['other'];
    if (!ruleToUse) return match;

    // Replace '#' with the numeric value
    let compiled = ruleToUse.replace(/#/g, String(value));
    // Replace {trimmedVarName} with the numeric value
    compiled = compiled.replace(new RegExp(`{${trimmedVarName}}`, 'g'), String(value));

    return compiled;
  });
}

/**
 * Standard interpolation function to substitute variables like {name} with values
 */
export function interpolate(text: string, params: Record<string, string | number>): string {
  let val = text;
  Object.entries(params).forEach(([k, v]) => {
    val = val.replace(new RegExp(`{${k}}`, 'g'), String(v));
  });
  return val;
}
