-- ============================================================
--  MAINFRAME — Seed data
--  Exact translation of the seed() in opsdeck-data.js.
--  Run AFTER 01_schema.sql (RLS optional for seeding; if enabled,
--  run as the service role or temporarily disable RLS).
-- ============================================================

-- ---------- clients ----------
insert into mf_clients (id, name, contact, phone, email, status) values
  ('C001','JP Events','Jay Patel','447700900001','jay@jpevents.co.uk','Active'),
  ('C002','Coastal Kitchen','Sam Reid','447700900050','ops@coastalkitchen.co.uk','Active'),
  ('C003','CTF','Dawn Cole','447700900070','hello@ctf.uk','Lead')
on conflict (id) do nothing;

-- ---------- events ----------
insert into mf_events (id, client_id, name, loc, start, "end", call_time, notes, schedule) values
  ('E001','C001','Latitude','Henham Park, Suffolk','2026-07-23','2026-07-26','07:00',
   'Festival Republic. On-site crew camping.',
   '[
     {"id":"d1","date":"2026-07-22","phase":"Travel / Transit","note":"Depot 06:00, convoy to site"},
     {"id":"d2","date":"2026-07-22","phase":"Arrival & Pitch","note":"Gate C — traders entrance, show passes"},
     {"id":"d3","date":"2026-07-23","phase":"Build / Set-up","note":"Bars in, gas test + PAT, stock delivery 14:00"},
     {"id":"d4","date":"2026-07-24","phase":"Trading Day","open":"12:00","close":"23:00","note":"Gates 12:00"},
     {"id":"d5","date":"2026-07-25","phase":"Trading Day","open":"12:00","close":"23:00","note":""},
     {"id":"d6","date":"2026-07-26","phase":"Trading Day","open":"12:00","close":"00:00","note":"Last day — headline, expect late peak"},
     {"id":"d7","date":"2026-07-27","phase":"Breakdown / De-rig","note":"De-rig from 08:00, deep clean units"},
     {"id":"d8","date":"2026-07-27","phase":"Load-out","note":"Off site by 18:00"}
   ]'::jsonb),
  ('E002','C001','Cardiff Food Festival','Roald Dahl Plass, Cardiff','2026-08-15','2026-08-16','08:00','','[]'::jsonb),
  ('E003','C002','Beach Weddings — Aug','Ogmore-by-Sea','2026-08-08','2026-08-08','11:00','','[]'::jsonb)
on conflict (id) do nothing;

-- ---------- units ----------
insert into mf_units (id, client_id, type, code, name, crew) values
  ('U001','C001','Bar','BAR-01','Main Bar Trailer',3),
  ('U002','C001','Coffee','COF-01','Coffee Cart',2),
  ('U003','C001','Food','FOO-01','Burger Trailer',3),
  ('U010','C002','Catering','CAT-01','Field Kitchen',4)
on conflict (id) do nothing;

-- ---------- staff ----------
insert into mf_staff (id, client_id, name, role, phone, rate, rtw, can_tow) values
  ('S001','C001','Jordan Blake','Unit Manager','447700900101',18,'Verified',true),
  ('S002','C001','Priya Sharma','Unit Manager','447700900102',18,'Verified',true),
  ('S003','C001','Aaron Ng','Bartender','447700900105',12.5,'Verified',false),
  ('S004','C001','Emma Wright','Barista','447700900108',12,'Verified',false),
  ('S005','C001','Aisha Khan','Chef','447700900110',16,'Verified',false),
  ('S006','C001','Tom Fletcher','Barista','447700900109',12,'Pending',false),
  ('S020','C002','Grace Bell','Kitchen Assistant','447700900112',11.5,'Verified',false)
on conflict (id) do nothing;

-- ---------- assignments (deliberately leaves gaps) ----------
insert into mf_assignments (id, event_id, unit_id, staff_id, area) values
  ('A001','E001','U001','S001','Bar'),
  ('A002','E001','U001','S003','Bar'),
  ('A003','E001','U002','S004','Coffee'),
  ('A004','E001','U003','S005','Food')
on conflict (id) do nothing;

-- ---------- stock (some below par to show 'running out') ----------
insert into mf_stock (id, unit_id, item, qty, par, unit) values
  ('K001','U001','Lager kegs',4,6,'kegs'),
  ('K002','U001','Prosecco',24,12,'btls'),
  ('K003','U001','Serve cups',500,300,'cups'),
  ('K004','U002','Coffee beans',3,5,'kg'),
  ('K005','U002','Oat milk',8,6,'ltr'),
  ('K006','U002','Cups + lids',800,400,'ea'),
  ('K007','U003','Burger patties',40,60,'ea'),
  ('K008','U003','Brioche buns',50,60,'ea'),
  ('K009','U003','LPG 47kg',1,2,'cyl'),
  ('K010','U010','Napkins',2000,1500,'ea'),
  ('K011','U010','Chafing gel',6,8,'tins')
on conflict (id) do nothing;

-- ---------- certs (promoted from kv 'staffCerts') ----------
-- Jordan holds valid certs; Aaron's Personal Licence is expiring soon (demo).
insert into mf_certs (id, staff_id, type, expiry) values
  ('CERT-S001-0','S001','Personal Licence','2030-01-01'),
  ('CERT-S001-1','S001','Food Hygiene L2','2030-01-01'),
  ('CERT-S003-0','S003','Personal Licence','2026-08-15'),
  ('CERT-S003-1','S003','Food Hygiene L2','2030-01-01')
on conflict (id) do nothing;

-- ---------- availability (promoted from kv 'availability') ----------
-- Emma is unavailable on 24 Jul (demo of the availability block).
insert into mf_availability (staff_id, date, available) values
  ('S004','2026-07-24', false)
on conflict (staff_id, date) do nothing;
