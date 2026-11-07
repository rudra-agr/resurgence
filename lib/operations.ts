import { z } from 'zod';

// Shared by the operations API routes and the scheduler page. No server-only imports here.
export const TASK_TYPES = ['PURCHASE', 'DISPATCH', 'DELIVERY', 'VERIFICATION'] as const;
export const TASK_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'DONE'] as const;
export const RESOURCE_TYPES = ['VEHICLE', 'TEAM', 'WAREHOUSE'] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const TYPE_COLOR: Record<TaskType, string> = {
  PURCHASE: '#e8a020',
  DISPATCH: '#6e8fa3',
  DELIVERY: '#6fcf7a',
  VERIFICATION: '#d4845a',
};

export const TYPE_LABEL: Record<TaskType, string> = {
  PURCHASE: 'Purchase',
  DISPATCH: 'Dispatch',
  DELIVERY: 'Delivery',
  VERIFICATION: 'Verification',
};

// ISO date text in, Date out. Bounded so a typo cannot store the year 20260.
export const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s))
  .refine((d) => d.getFullYear() >= 2020 && d.getFullYear() <= 2100, 'Date is out of range.');

export type TaskRow = {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  startDate: string;
  endDate: string;
  notes: string | null;
  needId: string;
  resourceId: string | null;
  need: { title: string; location: string; status: string };
};

export type ResourceRow = {
  id: string;
  name: string;
  type: ResourceType;
  capacity: number;
  region: string | null;
  active: boolean;
};
