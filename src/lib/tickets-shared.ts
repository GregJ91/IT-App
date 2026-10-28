// Labels and helpers shared by server and client code.

export const STATUSES = ["new", "progress", "waiting", "resolved", "closed"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  progress: "In progress",
  waiting: "Waiting on user",
  resolved: "Resolved",
  closed: "Closed",
};

export const OPEN_STATUSES: Status[] = ["new", "progress", "waiting"];

export const PRIORITY_HELP: Record<number, string> = {
  1: "Work has stopped",
  2: "Hard to work",
  3: "Annoying",
  4: "Whenever",
};

export const isStatus = (s: string): s is Status => (STATUSES as readonly string[]).includes(s);

export const ticketRef = (id: number) => `IT-${id}`;
