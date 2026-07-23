# MAINFRAM4 — Enhancement Backlog

Ideas that would genuinely move the needle for a multi-operator festival-ops
business. Each has the problem it solves, rough effort (S ≤ half-day ·
M ≈ 1–3 days · L ≈ a week+), and expected payoff. Ranked by payoff-to-effort.
No code changes here — this is the "what next" menu.

## Now (high payoff, low-moderate effort)

1. **Store-hardening test-pack — S/M · high**
   The most stateful code (realtime patch, echo suppression, cold-mirror
   upsert) still has thin coverage even after this pass added rollback tests.
   Lock it down before building more on top. *Solves:* silent regressions in
   the layer everything depends on.

2. **Proactive reminders — M · high**
   Certs/docs expiring, callouts open, shifts unconfirmed at T-7 are all
   computed but purely pull-based today. A daily digest (email) + in-app
   "attention" surface would catch the things that currently depend on someone
   opening the right page. *Solves:* missed expiries and unconfirmed crew going
   unnoticed until it's late.

3. **Data export (CSV/JSON) — S · high**
   Events, crew, finance and timesheets can't leave the system. Operators need
   this for payroll, the accountant, and their own backup peace of mind.
   *Solves:* lock-in anxiety + manual re-keying into other tools.

4. **Timesheet approver queue — S · medium**
   "N to approve" is a count, not a workflow. A single approve screen (per
   approver, oldest first, bulk-approve) turns payroll from a hunt into a pass.
   *Solves:* approval friction; pairs with reminders.

5. **Operator scorecard — M · high**
   No comparative view across operators. A per-vendor season card (fill rate,
   margin, compliance %, on-time departures) makes the multi-operator angle
   actually pay off — spot the vendor trending badly before it costs a booking.
   *Solves:* no way to compare/triage operators at a glance.

## Next (worth doing, moderate effort)

6. **Invoice PDF + VAT + deposits — M · high**
   Finance is display-only. Real festivals take a deposit + balance, and UK
   catering above the threshold needs VAT lines. Generate a sendable PDF and
   model deposit/balance and a VAT rate per operator. *Solves:* the whole
   "actually get paid" half of finance that's currently missing.

7. **Link Event Docs → real events → readiness gate — M · high**
   (Audit M13.) Today Event Docs checklists are free-text and never feed the
   readiness hard gate, so ticking compliance there does nothing to "ready" an
   event. Attaching a checklist to a real event id closes the loop and makes
   the compliance story single-truth. *Solves:* a genuine correctness gap where
   operators will assume ticked = ready.

8. **Audit trail — M · medium**
   No history of who confirmed/cancelled a shift or changed a rate. For a
   multi-operator business this is dispute insurance. An `updated_by` +
   append-only change log on the high-stakes tables (assignments, timesheets,
   invoices). *Solves:* "who cancelled Dave's shift?" with no answer.

9. **Crew shortfall prediction — M · medium**
   Staffing is reactive. Flag events trending under-crewed vs their T-minus
   (fill rate this far out has historically ended short) so callouts open
   earlier. *Solves:* last-minute scrambles that a week's warning would prevent.

10. **Realtime connection status — S · medium**
    (Audit M3.) A quiet "reconnecting / offline" banner when the websocket
    drops, so users know when they're looking at stale data. *Solves:* silent
    staleness on flaky festival wifi.

## Later (bigger bets)

11. **Crew mobile check-in — L · high**
    A phone-first flow for crew to accept callouts, clock in/out on site, and
    see their itinerary — the field half of the system. The data model already
    supports most of it (timesheets, callouts, personal itinerary); this is the
    focused mobile UI the audit flagged is missing (M18). *Solves:* the on-site
    experience, which is currently desktop-shaped.

12. **Weather-aware readiness & stock — M/L · medium**
    Outdoor ops with no environmental signal. Pull a forecast per event
    location/date; nudge readiness (wind/heat risk) and stock (hot weather →
    more cold drinks). *Solves:* the biggest uncontrolled variable in festival
    trading being entirely absent from the system.

13. **kv → real tables migration — L · medium**
    Move accounts/diagnostics/pins/eventDocs out of the kv blob store into
    FK-scoped tables. Permanently ends the leak/race/rename-orphan class
    (this pass patched the security and the diagnostic-rename vector; this is
    the structural finish). *Solves:* recurring kv fragility at the root.

14. **Multi-currency — M · low/medium**
    Hard-coded £/en-GB blocks any non-UK operator. A currency field per
    operator + a formatter. *Solves:* geographic expansion.

15. **Fine-grained store subscriptions — L · medium**
    One global version counter re-runs every page's memos on any write. Per-
    table versions (or a selector store) would cut render fan-out as data and
    realtime traffic grow. *Solves:* the perf ceiling (audit M15) before it
    bites at scale.
