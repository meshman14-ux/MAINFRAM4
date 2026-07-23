# MAINFRAME — per-tab guide

Sign in and your role decides what you see: operators get the full system,
crew land on Staff Hub, clients land on My Events.

## Overview (`#/overview`)
The whole business on one board — totals across every operator (events,
live now, upcoming, units, staff, low stock, blocked crew) and one widget
per operator with alert chips and per-event **Open →** buttons.

## Console (`#/console`)
The per-operator workbench. The event timeline strip at the top shows the
season chronologically — hover a bar for details, click it to open that
event's dashboard. Tabs:
- **Events** — create/edit events, schedule builder, .ics export.
- **Units** — one neon widget per unit (Bar cyan, Coffee yellow, Food green,
  Cocktail pink). **Add details** opens structured notes (staffing,
  equipment, hygiene, operational) plus the unit's checklist — seed a
  starter checklist per unit type with one click.
- **Staff** — the roster with staff numbers; sort by Staff #, Name or
  Skill; RTW and compliance chips inline.
- **Stock** — per-unit stock lines with par levels.
- **Staffing** — per-event allocation with scored candidate suggestions.

## Event Dashboard (`#/event/<id>`)
Everything about one event: dates/location/crew call, money rolled up,
units on site with checklist progress, crew with confirmation status,
tasks, movements and the day-by-day schedule. Every timeline bar, register
row and overview button lands here.

## Events (`#/events`) & Calendar
The register: each event is a card with a pulsing ● LIVE pill (or T-minus /
DONE), a staffing bar, unit dots coloured by type, and quick actions (Open
data pack · Callout crew · Edit). Past events collapse into a slim archive.
The Calendar's month grid opens a **day itinerary** when you click a day —
crew calls, journey departures, schedule phases and staffing across every
event that day, in time order. Crew automatically see their personal
version (their shifts and journeys only).

## Readiness (`#/readiness`)
Each event gets a weighted prep panel — Crew and Compliance weigh most —
with six expandable sections showing the exact outstanding items and a
"Fix in…" deep-link. **Hard gate:** an event can never show READY while a
required compliance item (unit or personal) is missing.

## Stock (`#/stock`)
The consolidated reorder list (below-par lines grouped per unit, CSV
export) plus the **shopping list builder**: pick a unit, add items by hand
or pull suggested stock for that unit type, tick items off as bought, then
**Move ticked → stock** to turn them into real stock lines.

## Compliance (`#/compliance`)
Two levels. **Unit (operational):** each unit's Safety + Documentation
checks with hover descriptions and how-to-comply notes; required items
glow red while open. **Crew (personal):** RAG cards per person — expand to
the exact items and clear a missing/expiring certificate by attaching its
renewal date inline. Both levels, plus document expiries, roll up into the
**Information Hub** header.

## Finance (`#/finance`)
Real P&L: invoices with line items (draft → sent → paid, overdue flagged
automatically), expenses by category, payroll from approved timesheets,
and net on a paid basis. Crew-cost planning table per event. CSV export
covers all three.

## Logistics (`#/logistics`)
Movements per event (unit + driver + departure, advance status with one
click), driver pool with tow/clash flags, the **fleet register**, a
**journey ETA calculator** (+20% when towing) and **Print tab pack** — a
clean printable journey sheet per event.

## Timesheets (`#/timesheets`)
Clock in/out or enter hours, then walk each sheet through draft →
submitted → approved → paid. Approved/paid hours feed Finance payroll.

## Pipeline, Accounts, Diagnostic, Proposal, Impl. Plan
The client-acquisition flow: prospects move lead → contacted → diagnostic
→ proposal → won; the diagnostic generates the proposal and the
implementation plan; accounts hold the client record.

## Staff Hub (`#/staff`) — crew
Your shifts (confirm/withdraw), your compliance and certificates, the
availability calendar — tap a day to mark yourself unavailable — and **My
timesheets**: on an event day, clock in when you start, clock out when you
finish, then submit the sheet. Your operator approves it (the database
blocks self-approval), and approved hours flow into payroll.

## Callouts & Open Jobs
Callouts request staff **per unit, by skill, with counts** (defaulting
from staffing gaps — adjust the numbers inline). Each request shows a live
fill bar and an auto-shortlist of the best suitable crew. Crew accept from
their Staff Hub; you approve each acceptance on the Callouts page — never
first-come-first-served.
