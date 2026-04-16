export type TripPayload = {
  title: string;
  schedule: string;
  yamapUrl: string;
  members: string[];
  transport: string;
  timeline: string;
  packing: string;
  onsen: string;
  expenses: string;
  notes: string;
};

export function defaultTripPayload(): TripPayload {
  return {
    title: "",
    schedule: "",
    yamapUrl: "",
    members: [],
    transport: "",
    timeline: "",
    packing: "",
    onsen: "",
    expenses: "",
    notes: "",
  };
}

export function normalizePayload(raw: unknown): TripPayload {
  const d = defaultTripPayload();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const membersRaw = o.members;
  const members =
    Array.isArray(membersRaw) && membersRaw.every((x) => typeof x === "string")
      ? (membersRaw as string[])
      : d.members;
  return {
    title: typeof o.title === "string" ? o.title : d.title,
    schedule: typeof o.schedule === "string" ? o.schedule : d.schedule,
    yamapUrl: typeof o.yamapUrl === "string" ? o.yamapUrl : d.yamapUrl,
    members,
    transport: typeof o.transport === "string" ? o.transport : d.transport,
    timeline: typeof o.timeline === "string" ? o.timeline : d.timeline,
    packing: typeof o.packing === "string" ? o.packing : d.packing,
    onsen: typeof o.onsen === "string" ? o.onsen : d.onsen,
    expenses: typeof o.expenses === "string" ? o.expenses : d.expenses,
    notes: typeof o.notes === "string" ? o.notes : d.notes,
  };
}
