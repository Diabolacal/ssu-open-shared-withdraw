export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

export function firstString(value: unknown, keys: string[]): string | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  for (const key of keys) {
    const next = record[key];
    if (typeof next === "string" && next.length > 0) return next;
  }
  return undefined;
}

export function findNestedString(value: unknown, keys: string[]): string | undefined {
  const seen = new Set<unknown>();
  const queue: unknown[] = [value];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || seen.has(next)) continue;
    seen.add(next);

    const direct = firstString(next, keys);
    if (direct) return direct;

    if (Array.isArray(next)) {
      queue.push(...next);
      continue;
    }

    const record = asRecord(next);
    if (record) queue.push(...Object.values(record));
  }
  return undefined;
}

export function readAssembly(value: unknown, fallbackId?: string): {
  id?: string;
  name?: string;
  state?: string;
  ownerCapId?: string;
} {
  return {
    id: firstString(value, ["id", "objectId", "object_id", "address"]) || fallbackId,
    name: firstString(value, ["name"]),
    state: firstString(value, ["state", "status"]),
    ownerCapId: findNestedString(value, ["owner_cap_id", "ownerCapId"]),
  };
}

export function readCharacter(value: unknown, fallbackId?: string): {
  id?: string;
  name?: string;
  ownerCapId?: string;
} {
  return {
    id: firstString(value, ["id", "character_id", "characterId", "objectId"]) || fallbackId,
    name: findNestedString(value, ["name"]),
    ownerCapId: findNestedString(value, ["owner_cap_id", "ownerCapId"]),
  };
}

export function compactAddress(value?: string): string {
  if (!value) return "-";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

