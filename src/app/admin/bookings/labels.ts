import type { AdminBookingRow } from "@/domain/admin-bookings";

export const STATUS_LABELS: Record<AdminBookingRow["status"], string> = {
  booked: "Booked",
  done: "Done",
  no_show: "Didn't come",
  cancelled: "Cancelled",
};

export const SOURCE_LABELS: Record<AdminBookingRow["source"], string> = {
  web: "Website",
  app: "Owner",
};
