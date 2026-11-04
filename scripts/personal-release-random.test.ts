import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeAcpRandomCompatibility } from "./personal-release.ts";

const legacy = [
  'import * as Crypto from "effect/Crypto";',
  "type Requirements = Digest.Digest | Crypto.Crypto;",
  "const crypto = yield* Crypto.Crypto;",
  ...Array.from({ length: 4 }, () => "Effect.provideService(Crypto.Crypto, crypto)"),
].join("\n");

test("normalizes the known legacy Crypto shape without changing other text", () => {
  const result = normalizeAcpRandomCompatibility(legacy);
  assert.match(result, /import \* as Digest from "effect\/crypto\/Digest";/);
  assert.match(result, /import \* as SecureRandom from "effect\/crypto\/SecureRandom";/);
  assert.match(result, /type Requirements = Digest\.Digest \| SecureRandom\.SecureRandom;/);
  assert.match(result, /const random = yield\* SecureRandom\.SecureRandom;/);
  assert.equal(result.split("SecureRandom.SecureRandom, random)").length - 1, 4);
  assert.doesNotMatch(result, /effect\/Crypto|Crypto\.Crypto/);
});

test("leaves already-current code unchanged", () => {
  const current = 'import * as SecureRandom from "effect/crypto/SecureRandom";';
  assert.equal(normalizeAcpRandomCompatibility(current), current);
});

test("fails closed when the legacy shape is unexpected", () => {
  assert.throws(() => normalizeAcpRandomCompatibility(legacy.replace("Crypto.Crypto", "Unexpected")));
});
