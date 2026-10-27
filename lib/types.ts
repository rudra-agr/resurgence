// Shapes shared by the screens. They mirror what the API routes return.
export type Me = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'COORDINATOR';
  coordinatorId: string | null;
};

export type NeedRow = {
  id: string;
  title: string;
  location: string;
  families: number;
  urgency: string;
  status: string;
  coordinatorId: string | null;
  verified: boolean;
  authority: string;
  raised: number;
  target: number;
  items: { name: string; qty: number }[];
};

export type Donation = {
  id: string;
  needId: string;
  needTitle: string;
  amount: number;
  currency: string;
  payer: string;
  paypalOrderId: string;
  paypalCaptureId: string;
  createdAt: string;
};

export type LedgerData = {
  region: { name: string; country: string; currency: string } | null;
  needs: NeedRow[];
  donations: Donation[];
};

export type EventRow = {
  id: string;
  type: string;
  actor: string;
  message: string;
  isSimulated: boolean;
  createdAt: string;
};

export type Match = {
  id: string;
  source: string;
  productName: string;
  price: number;
  currency: string;
  url: string | null;
  retrievedAt: string;
  approved: boolean;
  manual: boolean;
};

export type ItemWithMatches = { id: string; name: string; quantity: number; matches: Match[] };

export type ProductsView = {
  items: ItemWithMatches[];
  total: number;
  approved: boolean;
  failed?: string[];
};
