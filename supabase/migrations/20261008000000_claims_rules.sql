-- Claims record every rained-off (or judged) day, paid or not, so excess and cap can be counted per month.
alter table claims
  add column qualifying boolean not null default false, -- the day counts as rained off (by code or the AI judge)
  add column reason text,                               -- paid | excess | cap | waiting_period | not_active | not_rained_off | review
  add column decided_by text not null default 'code' check (decided_by in ('code', 'ai'));

alter table claims drop constraint claims_status_check;
alter table claims add constraint claims_status_check check (status in ('pending', 'sent', 'paid', 'failed', 'declined'));
