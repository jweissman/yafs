import { closeSync, fsyncSync, openSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function writeSynced(path: string, data: string) {
  const descriptor = openSync(path, "w");
  try {
    writeFileSync(descriptor, data);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function appendSynced(path: string, data: string) {
  const descriptor = openSync(path, "a");
  try {
    writeFileSync(descriptor, data);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function syncDirectory(path: string) {
  const descriptor = openSync(dirname(path), "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
