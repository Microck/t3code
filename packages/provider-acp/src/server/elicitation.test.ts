import { describe, expect, it } from "vite-plus/test";

import { parseElicitationForm } from "./elicitationForm.ts";

describe("ACP elicitation choices", () => {
  it("preserves titled single-select values and descriptions", () => {
    const form = parseElicitationForm(
      {
        type: "object",
        properties: {
          q0: {
            type: "string",
            title: "Choice display test",
            description: "Which choices can you see?",
            oneOf: [
              { const: "all", title: "All three choices", description: "All options are visible." },
              { const: "question", title: "Question only" },
              { const: "partial", title: "Partial or broken choices" },
            ],
          },
        },
        required: ["q0"],
      },
      "Answer the question",
    );
    expect(form?.questions[0]).toEqual({
      id: "q0",
      header: "Choice display test",
      question: "Which choices can you see?",
      allowCustomAnswer: false,
      options: [
        { label: "All three choices", value: "all", description: "All options are visible." },
        { label: "Question only", value: "question", description: "Question only" },
        {
          label: "Partial or broken choices",
          value: "partial",
          description: "Partial or broken choices",
        },
      ],
    });
    expect(form?.content({ q0: "all" })).toEqual({ q0: "all" });
  });

  it("supports titled and untitled multi-select enums", () => {
    const form = parseElicitationForm(
      {
        type: "object",
        properties: {
          titled: {
            type: "array",
            items: {
              anyOf: [
                { const: "a", title: "Alpha" },
                { const: "b", title: "Beta" },
              ],
            },
          },
          plain: { type: "array", items: { type: "string", enum: ["alpha", "beta"] } },
        },
        required: ["titled", "plain"],
      },
      "Choose features",
    );
    expect(form?.questions[0]).toMatchObject({ multiSelect: true, allowCustomAnswer: false });
    expect(form?.questions[0]?.options).toEqual([
      { label: "Alpha", value: "a", description: "Alpha" },
      { label: "Beta", value: "b", description: "Beta" },
    ]);
    expect(form?.questions[1]).toMatchObject({ multiSelect: true, allowCustomAnswer: false });
    expect(form?.questions[1]?.options).toEqual([
      { label: "alpha", value: "alpha", description: "alpha" },
      { label: "beta", value: "beta", description: "beta" },
    ]);
    expect(form?.content({ titled: ["b"], plain: ["alpha", "beta"] })).toEqual({
      titled: ["b"],
      plain: ["alpha", "beta"],
    });
  });

  it("keeps enum, boolean, and custom-text questions compatible", () => {
    const form = parseElicitationForm(
      {
        type: "object",
        properties: {
          color: { type: "string", enum: ["red", "blue"] },
          approved: { type: "boolean" },
          q0__other: { type: "string", title: "Other (type your own)" },
        },
        required: ["color", "approved", "q0__other"],
      },
      "Choose",
    );
    expect(form?.questions).toEqual([
      {
        id: "color",
        header: "Question 1",
        question: "Choose",
        allowCustomAnswer: false,
        options: [
          { label: "red", value: "red", description: "red" },
          { label: "blue", value: "blue", description: "blue" },
        ],
      },
      {
        id: "approved",
        header: "Question 2",
        question: "Choose",
        allowCustomAnswer: false,
        options: [
          { label: "true", value: "true", description: "Yes" },
          { label: "false", value: "false", description: "No" },
        ],
      },
      { id: "q0__other", header: "Other (type your own)", question: "Choose", options: [] },
    ]);
    expect(form?.content({ color: "red", approved: "false", q0__other: "custom" })).toEqual({
      color: "red",
      approved: false,
      q0__other: "custom",
    });
  });

  it("rejects malformed options and preserves exact valid values", () => {
    const form = parseElicitationForm(
      {
        type: "object",
        properties: {
          value: {
            type: "string",
            oneOf: [
              { const: "  exact  ", title: "Exact" },
              { const: "", title: "Empty value" },
            ],
          },
        },
        required: ["value"],
      },
      "Choose",
    );
    expect(form?.questions[0]?.options).toEqual([
      { label: "Exact", value: "  exact  ", description: "Exact" },
      { label: "Empty value", value: "", description: "Empty value" },
    ]);
    expect(form?.content({ value: "  exact  ", unexpected: "ignored" })).toEqual({
      value: "  exact  ",
    });
    for (const invalid of [null, { const: 42 }, { title: "Missing value" }]) {
      expect(
        parseElicitationForm(
          { type: "object", properties: { value: { type: "string", oneOf: [invalid] } } },
          "Choose",
        ),
      ).toBeUndefined();
    }
  });
});
