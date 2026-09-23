CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lines jsonb NOT NULL DEFAULT '[]'
);
