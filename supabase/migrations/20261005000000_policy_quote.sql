-- What the roofer wrote, and the quote shown to them (numbers, AI explanation, assumptions).
alter table policies
  add column description text,
  add column quote_json jsonb;
