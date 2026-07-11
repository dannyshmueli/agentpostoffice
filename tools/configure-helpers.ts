export interface D1ListEntry {
  name?: unknown;
  uuid?: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function findD1DatabaseId(entries: D1ListEntry[], name: string): string | null {
  const match = entries.find((entry) => entry.name === name && typeof entry.uuid === "string" && UUID_RE.test(entry.uuid));
  return typeof match?.uuid === "string" ? match.uuid : null;
}

export function resourceListContains(output: string, name: string): boolean {
  const plain = output.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
  for (const line of plain.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("name:") && trimmed.slice("name:".length).trim() === name) return true;
    if (trimmed.includes("│")) {
      const cells = trimmed.split("│").map((cell) => cell.trim()).filter(Boolean);
      if (cells.includes(name)) return true;
    }
  }
  return false;
}
