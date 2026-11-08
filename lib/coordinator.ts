// Shared by the coordinator API routes and the coordinator dashboard.
export const UPDATE_TYPE = 'SITUATION_UPDATE';
export const READY_TYPE = 'COORDINATOR_READY';
export const MAX_UPDATES_PER_NEED = 50; // keeps the public timeline bounded

// "Ready for dispatch" only makes sense once products are approved and priced (target > 0), the
// need is not still awaiting review or a failed payment, and nothing has been bought or delivered.
export const READY_STATUSES = ['OPEN', 'PARTIALLY_FUNDED', 'FUNDED'];

export type CoordinatorNeed = {
  id: string;
  title: string;
  location: string;
  status: string;
  urgency: string;
  families: number;
  raised: number;
  target: number;
  createdAt: string;
  lastEventAt: string | null;
  lastUpdate: { message: string; createdAt: string } | null;
  readyMarked: boolean;
  canMarkReady: boolean;
  nextTask: { type: string; title: string; startDate: string; resource: string | null } | null;
};

export type ActivityRow = {
  id: string;
  needId: string;
  needTitle: string;
  type: string;
  actor: string;
  message: string;
  isSimulated: boolean;
  createdAt: string;
};

export type CoordinatorData = {
  coordinator: { name: string; region: string };
  stats: { needs: number; raised: number; families: number };
  needs: CoordinatorNeed[];
  activity: ActivityRow[];
};
