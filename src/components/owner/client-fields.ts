import { text } from "@/lib/form-data";

/**
 * The fields of the owner's client and animal forms (see client-forms.tsx), and how
 * server actions read them. Shared by the Clients tab and booking from the calendar.
 */

export type ClientField = "name" | "phone" | "email";
export type PetField = "name" | "species" | "breed";

export function clientFormValues(formData: FormData): Record<ClientField, string> {
  return {
    name: text(formData, "name"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
  };
}

export function petFormValues(formData: FormData): Record<PetField, string> {
  return {
    name: text(formData, "name"),
    species: text(formData, "species"),
    breed: text(formData, "breed"),
  };
}
