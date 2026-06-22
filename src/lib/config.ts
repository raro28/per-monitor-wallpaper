export interface MonitorEntry {
  file?: string;
  mode?: string;
}

export interface Config {
  monitors?: Record<string, MonitorEntry>;
  default?: string;
}

/** Tolerant parse: any invalid/non-object JSON yields an empty config. */
export function parseConfig(text: string): Config {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {};
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Config)
    : {};
}

/** The explicit per-connector override file, or null. */
export function fileForConnector(cfg: Config, connector: string): string | null {
  const file = cfg.monitors?.[connector]?.file;
  return typeof file === 'string' ? file : null;
}

/** The fallback file applied to monitors with no override, or null. */
export function defaultFile(cfg: Config): string | null {
  return typeof cfg.default === 'string' ? cfg.default : null;
}
