import type { QrEvent, QrEventAssignment, QrEventConfig } from "./qrEventsApi";

export const MAX_EVENT_CODES = 500;
export const EVENT_CODE_PATTERN =
  /^GT-[0-9A-HJKMNPQRSTVWXYZ]{4}-[0-9A-HJKMNPQRSTVWXYZ]{4}$/;
// eslint-disable-next-line no-control-regex -- Reject control characters in public URLs and labels.
const controls = /[\u0000-\u001f\u007f]/;

export type EventField = "name" | "publicAppUrl" | "publicApiUrl";
export type EventErrors = Partial<Record<EventField | "assignments", string>>;
export type EventTable = { id: string; label: string; isActive: boolean };
export type AssignmentStatus =
  | "ready"
  | "unassigned"
  | "inactive-table"
  | "disabled";

export function normalizeEventUrl(value: string, originOnly: boolean): string {
  const input = value.trim();
  if (!input)
    throw new Error("Enter a local address, including http:// or https://.");
  if (
    !/^https?:\/\//i.test(input) ||
    controls.test(input) ||
    input.includes("\\")
  ) {
    throw new Error(
      "Use a complete HTTP or HTTPS address without backslashes or control characters.",
    );
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(
      "Enter a valid address, for example http://noor-node.local:8080.",
    );
  }
  if (
    !url.hostname ||
    url.username ||
    url.password ||
    input.includes("?") ||
    input.includes("#") ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(input)
  ) {
    throw new Error(
      "Remove credentials, query parameters, fragments and unsafe escapes from this address.",
    );
  }
  if (originOnly && url.pathname !== "/")
    throw new Error(
      "Use the app address without a path; the Core API path goes in the next field.",
    );
  const result = originOnly
    ? url.origin
    : `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  if (result.length > 2000)
    throw new Error(
      "This address is too long. Use a shorter local hostname and path.",
    );
  return result;
}

export function suggestedEventApiUrl(appUrl: string): string {
  try {
    return `${normalizeEventUrl(appUrl, true)}/api`;
  } catch {
    return "";
  }
}

export function validateEventDraft(config: QrEventConfig): EventErrors {
  const errors: EventErrors = {};
  if (!config.name.trim()) errors.name = "Give this event a name.";
  else if (config.name.trim().length > 120 || controls.test(config.name))
    errors.name = "Use up to 120 characters without line breaks.";
  for (const field of ["publicAppUrl", "publicApiUrl"] as const) {
    try {
      normalizeEventUrl(config[field], field === "publicAppUrl");
    } catch (error) {
      errors[field] = (error as Error).message;
    }
  }
  if (config.assignments.length > MAX_EVENT_CODES)
    errors.assignments = `Keep this event within ${MAX_EVENT_CODES} QR codes.`;
  else if (
    new Set(config.assignments.map((row) => row.publicCode)).size !==
    config.assignments.length
  )
    errors.assignments = "Each QR code must appear only once in an event.";
  else if (
    config.assignments.some((row) => !EVENT_CODE_PATTERN.test(row.publicCode))
  )
    errors.assignments = "QR codes must use the GT-XXXX-XXXX format.";
  else if (
    config.assignments.some(
      (row) =>
        (row.label?.trim().length ?? 0) > 100 || controls.test(row.label ?? ""),
    )
  )
    errors.assignments =
      "Printed labels can have up to 100 characters without line breaks.";
  return errors;
}

export function normalizedEventDraft(config: QrEventConfig): QrEventConfig {
  return {
    ...config,
    name: config.name.trim(),
    publicAppUrl: normalizeEventUrl(config.publicAppUrl, true),
    publicApiUrl: normalizeEventUrl(config.publicApiUrl, false),
    assignments: config.assignments.map((row) => ({
      ...row,
      label: row.label?.trim() || null,
    })),
  };
}

export function assignmentStatus(
  assignment: QrEventAssignment,
  tables: ReadonlyMap<string, EventTable>,
): AssignmentStatus {
  if (!assignment.isActive) return "disabled";
  if (!assignment.tableId) return "unassigned";
  const table = tables.get(assignment.tableId);
  return table?.isActive ? "ready" : "inactive-table";
}

export function eventAssignmentCounts(
  assignments: QrEventAssignment[],
  tables: ReadonlyMap<string, EventTable>,
) {
  const counts = { ready: 0, unassigned: 0, "inactive-table": 0, disabled: 0 };
  for (const assignment of assignments)
    counts[assignmentStatus(assignment, tables)] += 1;
  return counts;
}

export function eventDeploymentStatus(event: QrEvent, localOnly: boolean) {
  if (localOnly)
    return {
      label: event.isActive ? "Saved on this Pi" : "Disabled on this Pi",
      applied: true,
      detail: event.isActive
        ? "Saved changes are available locally. Test a scan on the event Wi-Fi before printing."
        : "This event's QR codes are disabled on this Pi.",
    };
  if (event.lastAppliedRevision === event.revision)
    return {
      label: "Applied on Pi",
      applied: true,
      detail: `The Pi acknowledged revision ${event.revision}${event.lastAppliedAt ? ` on ${new Date(event.lastAppliedAt).toLocaleString()}` : ""}. Test a scan on the event Wi-Fi.`,
    };
  if (event.lastAppliedRevision > 0)
    return {
      label: "Update pending on Pi",
      applied: false,
      detail: `The Pi last acknowledged revision ${event.lastAppliedRevision}. ${event.paired ? "Its next sync will apply the saved changes." : "Pair the Pi or import the latest event bundle."}`,
    };
  return {
    label: event.paired ? "Waiting for first Pi sync" : "Ready to transfer",
    applied: false,
    detail: event.paired
      ? "A pairing token has been issued; the Pi has not acknowledged this event yet."
      : "Export this event to the Pi, or create a pairing file for automatic updates. File imports are not acknowledged here.",
  };
}
