import { z } from 'zod';

export const DeviceSchema = z.object({
  deviceSN: z.string(),
  moduleSN: z.string().optional(),
  deviceType: z.string().optional(),
  status: z.number().optional(),
  hasBattery: z.boolean().optional(),
  hasPV: z.boolean().optional(),
});

export const DeviceListResultSchema = z.object({
  data: z.array(DeviceSchema),
  total: z.number().optional(),
});

export const RealDataVariableSchema = z.object({
  unit: z.string().optional(),
  variable: z.string(),
  value: z.union([z.number(), z.string(), z.null()]).optional(),
});

export const RealDataItemSchema = z.object({
  time: z.string().optional(),
  deviceSN: z.string().optional(),
  datas: z.array(RealDataVariableSchema),
});

export const RealDataResultSchema = z.array(RealDataItemSchema);

export function foxResponse<T extends z.ZodTypeAny>(resultSchema: T): z.ZodObject<{
  errno: z.ZodNumber;
  msg: z.ZodOptional<z.ZodString>;
  result: z.ZodOptional<T>;
}> {
  return z.object({
    errno: z.number(),
    msg: z.string().optional(),
    result: resultSchema.optional(),
  });
}
