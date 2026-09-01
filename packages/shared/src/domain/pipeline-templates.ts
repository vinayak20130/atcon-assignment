/**
 * Names for copied pipeline templates.
 *
 * Org names are unique, so a second copy of the same blueprint cannot reuse
 * "Engineering (copy)". Kept pure so the service can ask for a name, then write.
 */
export function nextPipelineTemplateCopyName(sourceName: string, existingNames: readonly string[]): string {
  const taken = new Set(existingNames);
  const stem = sourceName.slice(0, 64).replace(/\s+$/, '');

  for (let attempt = 1; attempt < 50; attempt += 1) {
    const suffix = attempt === 1 ? ' (copy)' : ` (copy ${attempt})`;
    const candidate = `${stem}${suffix}`.slice(0, 80);
    if (!taken.has(candidate)) return candidate;
  }

  return `${stem} (copy ${Date.now()})`.slice(0, 80);
}
