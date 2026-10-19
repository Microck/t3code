import { describe, expect, it } from "vite-plus/test";

import { acpElicitationQuestions } from "./adapter.ts";

describe("ACP elicitation choices", () => {
  it("preserves titled single-select values and descriptions", () => {
    const [question] = acpElicitationQuestions(
      {
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
      "Answer the question",
    );
    expect(question).toEqual({
      id: "q0",
      header: "Choice display test",
      question: "Which choices can you see?",
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
  });

  it("supports titled and untitled multi-select enums", () => {
    const questions = acpElicitationQuestions(
      {
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
      "Choose features",
    );
    expect(questions[0]).toMatchObject({
      multiSelect: true,
      options: [
        { label: "Alpha", value: "a", description: "Alpha" },
        { label: "Beta", value: "b", description: "Beta" },
      ],
    });
    expect(questions[1]).toMatchObject({
      multiSelect: true,
      options: [
        { label: "alpha", description: "alpha" },
        { label: "beta", description: "beta" },
      ],
    });
  });

  it("keeps enum, boolean, and custom-text questions compatible", () => {
    expect(
      acpElicitationQuestions(
        {
          color: { type: "string", enum: ["red", "blue"] },
          approved: { type: "boolean" },
          q0__other: { type: "string", title: "Other (type your own)" },
        },
        "Choose",
      ),
    ).toEqual([
      {
        id: "color",
        header: "Question 1",
        question: "Choose",
        options: [
          { label: "red", description: "red" },
          { label: "blue", description: "blue" },
        ],
      },
      {
        id: "approved",
        header: "Question 2",
        question: "Choose",
        options: [
          { label: "true", description: "Yes" },
          { label: "false", description: "No" },
        ],
      },
      { id: "q0__other", header: "Other (type your own)", question: "Choose", options: [] },
    ]);
  });

  it("ignores malformed options and preserves exact values", () => {
    const [question] = acpElicitationQuestions(
      {
        value: {
          type: "string",
          oneOf: [
            null,
            { const: 42 },
            { title: "Missing value" },
            { const: "  exact  ", title: "Exact" },
            { const: "", title: "Empty value" },
          ],
        },
      },
      "Choose",
    );
    expect(question?.options).toEqual([
      { label: "Exact", value: "  exact  ", description: "Exact" },
      { label: "Empty value", value: "", description: "Empty value" },
    ]);
  });
});
