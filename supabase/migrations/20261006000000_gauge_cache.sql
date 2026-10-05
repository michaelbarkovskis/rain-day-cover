-- Environment Agency rain gauge history, cached so quotes don't refetch years of 15-minute readings.
create table gauge_days (
  gauge_ref text not null,
  date date not null,
  tenths smallint[] not null,  -- 24 values: index h = rain (tenths of mm) in the local hour ending at h:00
  readings smallint not null,  -- valid 15-minute readings that day (96 on a normal day)
  primary key (gauge_ref, date)
);

-- Which gauge-years have been fetched, so a year with no data isn't refetched on every quote.
create table gauge_years (
  gauge_ref text not null,
  year int not null,
  fetched_at timestamptz not null default now(),
  primary key (gauge_ref, year)
);

alter table gauge_days enable row level security;   -- service role only
alter table gauge_years enable row level security;
