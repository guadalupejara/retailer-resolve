// Uploads ./evidence/** to the Supabase "evidence" bucket, keeping the same paths
// that evidence.storage_path uses (minus the leading "evidence/").
//
//   npm i @supabase/supabase-js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-evidence.mjs
//
// Run it from your machine, never from the browser. Not tested against a live
// project from here; if it fails, drag the evidence folder into the bucket in the
// Supabase dashboard instead (same result).
import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const supabase = createClient(url, key);
const root = new URL("../evidence", import.meta.url).pathname;
const types = { ".pdf": "application/pdf", ".png": "image/png", ".txt": "text/plain" };

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

for (const file of walk(root)) {
  const path = relative(root, file);
  const { error } = await supabase.storage.from("evidence")
    .upload(path, readFileSync(file), { contentType: types[extname(file)], upsert: true });
  console.log(error ? `FAIL ${path}: ${error.message}` : `ok   ${path}`);
}
