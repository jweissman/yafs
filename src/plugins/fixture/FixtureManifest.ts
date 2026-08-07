import { fixtureStreams } from "./FixtureStreamManifest";
import { object, only, relative } from "../../mounts/ManifestValidation";
import { FixtureConfig } from "../../mounts/types";

export function fixtureConfig(value: unknown): FixtureConfig {
  const config = object(value, "fixture config");
  only(config, ["files", "streams"], "fixture config");
  const files = validFixtureFiles(config.files);
  return { files, streams: fixtureStreams(config.streams) };
}

function validFixtureFiles(value: unknown) {
  const files = object(value, "fixture files");
  const valid = Object.entries(files).every(
    (entry) => relative(entry[0]) && typeof entry[1] === "string",
  );
  if (!valid) {
    throw new Error("Invalid fixture files");
  }
  return files as Record<string, string>;
}
