# Launch checklist — real users

`DEPLOY.md` gets MAINFRAME on the internet. This checklist gets it ready for
**people you don't sit next to**. Work top to bottom; everything here is a
one-time task except the last section.

## Before inviting anyone

- [ ] **Deploy** per `DEPLOY.md` (Supabase project + migrations + Vercel).
- [ ] **Verify RLS is live**: in the Supabase SQL editor run
      `select relname, relrowsecurity from pg_class where relname like 'mf_%' and relkind='r';`
      — every table must be `true`. If any table shows `false`, re-run `02_rls.sql`.
- [ ] **Disable open sign-ups**: Authentication → Providers → Email → turn OFF
      "Enable sign ups". MAINFRAME grants access; it doesn't self-serve it.
- [ ] **Set the Site URL** (Authentication → URL Configuration) to your Vercel
      domain — password-reset emails link back here. Test it: use "Forgot
      password?" on the login screen and confirm the email lands and the link
      opens the "Set a new password" screen.
- [ ] **Create the owner login** and its `mf_access` row (steps in
      `04_auth_setup.sql`). Sign in and confirm you land on Home.
- [ ] **First-run check**: with an empty database (no seed), Home should show
      the "Let's set up your first operator" card pointing at the wizard.
- [ ] **Custom domain** (optional but recommended): add it in Vercel, then add
      it to Supabase's Redirect URLs.

## Smoke test with three test logins

Create one login per role (owner already exists) and run this script:

- [ ] **Owner** — run the Onboarding wizard end to end: operator → 1 unit →
      1 crew member → review. Confirm default stock appeared for the unit.
- [ ] **Owner** — create an event, open its callout, assign the crew member in
      the Staffing tab.
- [ ] **Crew** (login with `role='crew'`, their `staff_id`) — sign in on a
      **phone**. They should land on Staff Hub, see the shift, and be able to
      Confirm it. Upload a cert with an expiry; toggle a day unavailable.
- [ ] **Owner** — confirm the crew's confirmation shows on Home, the cert shows
      in Compliance, and the availability blocks them in the Staffing picker
      for that date.
- [ ] **Client** (login with `role='client'`, their `client_id`) — sign in;
      they should land on My Events and see ONLY their events. Try visiting
      `#/console` directly — it should bounce them back to the portal.
- [ ] **Cross-tenant check** (the one that matters): while signed in as the
      client, open the browser dev tools → Network, and confirm the Supabase
      responses contain only that client's rows. RLS is doing this server-side;
      this is your visual confirmation.

## Realtime check (two devices)

- [ ] Open the Staffing tab as owner on a laptop and Staff Hub as crew on a
      phone. Crew taps Confirm — the owner's screen should update within a
      couple of seconds without a refresh.

## Operational hygiene

- [ ] **Backups**: Supabase → Database → Backups. Daily backups are on by
      default for paid plans; confirm what your plan includes and that you're
      comfortable with the recovery window.
- [ ] **Email deliverability**: Supabase's built-in email is fine for a pilot
      but rate-limited and lands in spam more often. Before scaling invites,
      wire a custom SMTP provider (Authentication → Email Templates → SMTP).
- [ ] **A second owner**: create one more owner login for a trusted person, so
      one lost mailbox never locks the business out.

## Inviting real users (repeatable)

For each person:

1. Authentication → Users → **Add user** (email + a temporary password), or
   send them a Supabase invite email.
2. Insert their `mf_access` row with the right role and scope
   (`04_auth_setup.sql` has copy-paste templates for owner / manager /
   crew / client).
3. Tell them to sign in and use **Forgot password?** to set their own password
   (this doubles as a check that reset emails reach them).

A signed-in user with no `mf_access` row sees "account pending" — safe by
default, and your cue that step 2 was missed.

## Known limitations at launch (deliberate)

- No in-app invite/role-management UI — provisioning is via the Supabase
  dashboard + SQL (fine for tens of users, revisit past that).
- `load()` fetches all rows without pagination — right-sized for a single
  operator's season, revisit before multi-operator scale.
- Manager and owner currently have identical permissions.
