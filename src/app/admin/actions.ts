"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import type { FormState } from "@/components/owner/field";
import { getDb } from "@/db";
import {
  addHours,
  createProduct,
  createService,
  HoursOverlapError,
  removeHours,
  updateHours,
  updateProduct,
  updateService,
  updateSettings,
} from "@/domain/admin";
import { DomainError } from "@/domain/errors";
import { requireUser } from "@/lib/auth";
import { fieldErrors, text } from "@/lib/form-data";
import { logError, logInfo } from "@/lib/log";
import { SOMETHING_WRONG } from "@/lib/owner-action";
import {
  fieldNames,
  HOURS_FIELDS,
  PRODUCT_FIELDS,
  SERVICE_FIELDS,
  SETTINGS_FIELDS,
  type FieldSpec,
} from "./fields";

type State = FormState<string>;

/**
 * Reads the form's fields, saves them, and redirects to `done` on success. Validation
 * errors (from the domain's Zod schemas) are shown next to each field.
 */
async function save(
  context: string,
  fields: readonly FieldSpec[],
  formData: FormData,
  write: (values: Record<string, string>) => Promise<unknown>,
  done: string,
): Promise<State> {
  await requireUser();
  const values = Object.fromEntries(fieldNames(fields).map((name) => [name, text(formData, name)]));
  try {
    await write(values);
  } catch (error) {
    if (error instanceof ZodError) return { values, errors: fieldErrors<string>(error) };
    if (error instanceof HoursOverlapError || error instanceof DomainError) {
      return { values, errors: {}, message: error.message };
    }
    logError(context, error);
    return { values, errors: {}, message: SOMETHING_WRONG };
  }
  logInfo(context);
  redirect(done);
}

export async function saveServiceAction(
  id: string | null,
  _prev: State,
  formData: FormData,
): Promise<State> {
  return save(
    "admin.service_saved",
    SERVICE_FIELDS,
    formData,
    (values) => (id ? updateService(getDb(), id, values) : createService(getDb(), values)),
    "/admin/services?saved=1",
  );
}

export async function saveProductAction(
  id: string | null,
  _prev: State,
  formData: FormData,
): Promise<State> {
  return save(
    "admin.product_saved",
    PRODUCT_FIELDS,
    formData,
    (values) => (id ? updateProduct(getDb(), id, values) : createProduct(getDb(), values)),
    "/admin/products?saved=1",
  );
}

export async function saveHoursAction(
  id: string | null,
  _prev: State,
  formData: FormData,
): Promise<State> {
  return save(
    "admin.hours_saved",
    HOURS_FIELDS,
    formData,
    (values) => (id ? updateHours(getDb(), id, values) : addHours(getDb(), values)),
    "/admin/hours?saved=1",
  );
}

export async function removeHoursAction(id: string): Promise<void> {
  await requireUser();
  await removeHours(getDb(), id);
  logInfo("admin.hours_removed");
  refresh();
}

export async function saveSettingsAction(_prev: State, formData: FormData): Promise<State> {
  return save(
    "admin.settings_saved",
    SETTINGS_FIELDS,
    formData,
    (values) => updateSettings(getDb(), values),
    "/admin/settings?saved=1",
  );
}
