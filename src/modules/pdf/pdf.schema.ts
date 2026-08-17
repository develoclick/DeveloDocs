import { z } from "zod";

const companySchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
});

const customerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

const invoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
});

const invoiceDataSchema = z.object({
  invoiceNumber: z.string().min(1),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  currency: z.string().length(3).default("USD"),
  company: companySchema,
  customer: customerSchema,
  items: z.array(invoiceItemSchema).min(1),
  subtotal: z.number().nonnegative(),
  tax: z.number().nonnegative().default(0),
  total: z.number().nonnegative(),
});

export const generateDocumentSchema = z.object({
  templateName: z.string().min(1),
  data: invoiceDataSchema,
});

export type InvoiceData = z.infer<typeof invoiceDataSchema>;
export type GenerateDocumentInput = z.infer<typeof generateDocumentSchema>;
