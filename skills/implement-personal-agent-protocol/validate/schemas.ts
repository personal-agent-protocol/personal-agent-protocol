// Loads the JSON Schemas in ../schemas and validates documents against them by name.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateSchema, type SchemaError } from "./schema.ts";

export const SCHEMA_DIR = join(import.meta.dirname, "..", "schemas");

let cache: Record<string, object> | undefined;

// Every schema, keyed by file name, such as "poppy.schema.json".
export function loadSchemas(dir: string = SCHEMA_DIR): Record<string, object> {
    if (cache && dir === SCHEMA_DIR) return cache;
    const schemas: Record<string, object> = {};
    for (const file of readdirSync(dir)) {
        if (file.endsWith(".schema.json")) {
            schemas[file] = JSON.parse(readFileSync(join(dir, file), "utf8")) as object;
        }
    }
    if (dir === SCHEMA_DIR) cache = schemas;
    return schemas;
}

// Validates a value against a schema by file name, such as "poppy.schema.json", or a fragment of
// one, such as "poppy.schema.json#/$defs/https_url".
export function check(name: string, value: unknown): SchemaError[] {
    const schemas = loadSchemas();
    const [file] = name.split("#");
    if (!schemas[file]) throw new Error(`No schema named ${file} in ${SCHEMA_DIR}`);
    const schema = name.includes("#") ? { $ref: name } : schemas[file];
    return validateSchema(schema, value, schemas);
}
