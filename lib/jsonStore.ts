import fs from "fs/promises";
import path from "path";

async function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(filePath);
  const serialized = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, serialized, "utf8");
}
