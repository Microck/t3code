import { assert, describe, it } from "@effect/vitest";

import { parseElicitationForm } from "./elicitationForm.ts";

describe("parseElicitationForm", () => {
  it("rejects invalid supplied optional numbers while keeping blank fields optional", () => {
    for (const type of ["integer", "number"] as const) {
      const form = parseElicitationForm(
        { type: "object", properties: { count: { type } } },
        "How many?",
      );
      assert(form !== undefined);
      assert.strictEqual(form.questions[0]?.answerType, type);
      assert.strictEqual(form.questions[0]?.required, false);
      assert.deepStrictEqual(form.content({}), {});
      assert.deepStrictEqual(form.content({ count: "  " }), {});
      assert.deepStrictEqual(form.content({ count: "0" }), { count: 0 });
      for (const count of ["two", "NaN", "Infinity", "1e999", ["1"]]) {
        assert.isUndefined(form.content({ count }));
      }
      assert.deepStrictEqual(
        form.content({ count: "1.5" }),
        type === "integer" ? undefined : { count: 1.5 },
      );
    }
  });
  for (const type of ["string", "array"] as const) {
    it.each([
      { values: [" padded ", "", "plain"], labels: ["padded", '""', "plain"] },
      { values: [" a", "a", "b"], labels: ['" a"', '"a"', "b"] },
      { values: [" a", "a", '"a"'], labels: ['" a"', '"a"', '"\\"a\\""'] },
    ])(
      `preserves ${type} enum values with distinct readable labels: $values`,
      ({ values, labels }) => {
        const form = parseElicitationForm(
          {
            type: "object",
            properties: {
              answer:
                type === "array"
                  ? { type, items: { type: "string", enum: values } }
                  : { type, enum: values },
            },
            required: ["answer"],
          },
          "Choose",
        );
        assert(form !== undefined);
        const question = form.questions[0];
        assert(question !== undefined);
        assert.deepStrictEqual(
          question.options.map((option) => option.label),
          labels,
        );
        assert.deepStrictEqual(
          question.options.map((option) => option.value),
          values,
        );
        assert.strictEqual(question.allowCustomAnswer, false);
        assert.strictEqual(question.multiSelect, type === "array" ? true : undefined);
        for (const value of values) {
          const answer = type === "array" ? [value] : value;
          assert.deepStrictEqual(form.content({ answer }), { answer });
        }
      },
    );
  }
});
