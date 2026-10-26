import { z } from "zod";

export const inputName = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_]{0,39}$/)
  .refine((name) => name !== "constructor" && name !== "prototype");
export const inputValueSchema = z.union([
  z.number().int().min(-999).max(999),
  z.boolean(),
  z.string().max(200),
]);
export type InputValue = z.infer<typeof inputValueSchema>;
export const inputType = (value: InputValue) =>
  typeof value === "number" ? "integer" : typeof value;
export const nodeInputsSchema = z
  .object({
    version: z.literal(1),
    fields: z
      .array(
        z
          .object({
            name: inputName,
            type: z.enum(["integer", "boolean", "string"]),
            required: z.boolean(),
            default: inputValueSchema.optional(),
          })
          .strict()
          .refine(
            (field) =>
              field.default === undefined ||
              inputType(field.default) === field.type,
            "Input default must match its declared type.",
          ),
      )
      .max(16)
      .refine(
        (fields) => new Set(fields.map((f) => f.name)).size === fields.length,
        "Duplicate input name.",
      ),
  })
  .strict();
export const inputBindingsSchema = z
  .object({
    version: z.literal(1),
    bindings: z
      .array(
        z
          .object({
            input: inputName,
            source: z.discriminatedUnion("kind", [
              z
                .object({
                  kind: z.literal("constant"),
                  value: inputValueSchema,
                })
                .strict(),
              z
                .object({
                  kind: z.literal("dice"),
                  field: z.enum(["value", "sides", "target", "passed"]),
                })
                .strict(),
            ]),
          })
          .strict(),
      )
      .max(16)
      .refine(
        (bindings) =>
          new Set(bindings.map((b) => b.input)).size === bindings.length,
        "Duplicate input binding.",
      ),
  })
  .strict();
export type NodeInputs = z.infer<typeof nodeInputsSchema>;
export type InputBindings = z.infer<typeof inputBindingsSchema>;
export const nodeInputSnapshotSchema = z
  .object({
    version: z.literal(1),
    storyNodeId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    revision: z.number().int().nonnegative(),
    values: z
      .record(inputName, inputValueSchema)
      .refine((values) => Object.keys(values).length <= 16),
  })
  .strict();
export type NodeInputSnapshot = z.infer<typeof nodeInputSnapshotSchema>;
