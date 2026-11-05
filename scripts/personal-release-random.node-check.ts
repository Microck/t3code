import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";
import { normalizeAcpRandomCompatibility } from "./personal-release.ts";

const legacy = [
  'import * as Crypto from "effect/Crypto";',
  "type Requirements = Digest.Digest | Crypto.Crypto;",
  "const crypto = yield* Crypto.Crypto;",
  ...Array.from({ length: 4 }, () => "Effect.provideService(Crypto.Crypto, crypto)"),
].join("\n");

NodeTest.test("normalizes the known legacy Crypto shape without changing other text", () => {
  const result = normalizeAcpRandomCompatibility(legacy);
  NodeAssert.match(result, /import \* as Digest from "effect\/crypto\/Digest";/);
  NodeAssert.match(result, /import \* as SecureRandom from "effect\/crypto\/SecureRandom";/);
  NodeAssert.match(result, /type Requirements = Digest\.Digest \| SecureRandom\.SecureRandom;/);
  NodeAssert.match(result, /const random = yield\* SecureRandom\.SecureRandom;/);
  NodeAssert.equal(result.split("SecureRandom.SecureRandom, random)").length - 1, 4);
  NodeAssert.doesNotMatch(result, /effect\/Crypto|Crypto\.Crypto/);
});

NodeTest.test("leaves already-current code unchanged", () => {
  const current = 'import * as SecureRandom from "effect/crypto/SecureRandom";';
  NodeAssert.equal(normalizeAcpRandomCompatibility(current), current);
});

NodeTest.test("fails closed when the legacy shape is unexpected", () => {
  NodeAssert.throws(() =>
    normalizeAcpRandomCompatibility(legacy.replace("Crypto.Crypto", "Unexpected")),
  );
});

NodeTest.test("rejects an unrecognized legacy import and residual namespace reference", () => {
  NodeAssert.throws(() =>
    normalizeAcpRandomCompatibility(legacy.replace('"effect/Crypto"', "'effect/Crypto'")),
  );
  NodeAssert.throws(() => normalizeAcpRandomCompatibility(legacy + "\nconst cryptoModule = Crypto;"));
});
