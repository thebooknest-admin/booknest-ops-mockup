# BookNest Ops Dashboard — TODO

## Backend / Data Layer
- [x] Set up Supabase credentials as environment variables
- [x] Write supabase.ts helper with all query functions
- [x] Write tRPC routers for all endpoints (dashboard, members, inventory, shipments, labels, receive, donations, signups)
- [x] Create donations table in Supabase
- [x] Create event_signups table in Supabase

## Frontend — Wire to Real Data
- [ ] Dashboard page — use trpc.dashboard.stats
- [ ] Members page — use trpc.members.list
- [ ] Inventory page — use trpc.inventory.bookTitles + summary
- [ ] Picking page — use trpc.shipments.list (status=picking/pending)
- [ ] Shipping page — use trpc.shipments.list (status=shipping/packed)
- [ ] Ship Bundle page — use trpc.shipments.byId
- [ ] Labels page — use trpc.labels.pending
- [ ] Receive Books page — use trpc.receive.addBook mutation
- [ ] Donation Intake page — use trpc.donations.add mutation
- [ ] Donation Log page — use trpc.donations.list
- [ ] Sign-Up form — use trpc.signups.add mutation
- [ ] Sign-Up control — use trpc.signups.list

## Design / Polish
- [x] Warm linen premium design system
- [x] Persistent sidebar navigation
- [x] Smart tag matching engine
- [x] Age group inference engine
- [x] ISBN lookup (Open Library API)
- [x] Subscription tiers (Little Nest / Cozy Nest / Story Nest)
- [x] Event sign-up overlay from sidebar

## Security
- [x] Add PIN gate lock screen to protect the ops dashboard
- [x] Add Monthly/Annually toggle to sign-up form subscription section

## Welcome Form (New Member Onboarding)
- [x] Build public WelcomePage at /welcome (no sidebar, no PIN gate)
- [x] Add tRPC procedures: welcome.submit (save profile) and welcome.getByEmail (lookup member)
- [x] Connect WelcomePage to Supabase — update members table with profile data + mark welcome_form_completed
- [x] Add "Send Welcome Link" button to Members page expanded row
- [x] Update Members page to show welcome form status badge

## Bug Fixes
- [x] Fix Inventory Snapshot page stuck on "Loading inventory..." — books never appear (URL overflow: 463 UUIDs exceeded Node HTTP header limit; fixed with batched fetching in groups of 50)

## Inventory & Labels Improvements
- [x] Remove "Needs Restocking" section from Inventory Snapshot page
- [x] Add SKU column to inventory table and allow searching by SKU
- [x] Add inline edit capability for inventory (title, author, age group, bin, etc.)
- [x] Diagnose and fix the label queue not working (was using hardcoded mock data; rewired to live labels.pending tRPC query)

## Inventory Table & SKU Fixes
- [x] Fix duplicate age group filter buttons on Inventory Snapshot page
- [x] Add SKU column to Inventory Snapshot table (currently missing from display)
- [x] Fix Receive Books SKU assignment: use last number in that age category (not total count)
- [x] Wire Receive Books Confirm button to real tRPC receive.addBook mutation (was UI mockup only — books were never saved)

## Receive Books → Label Queue Integration
- [x] After confirming receipt, show a "Go to Label Queue" shortcut with pending label count
- [x] Show a running pending-label count badge in the Receive Books header during a session

## Full Supabase Wiring (All Remaining Pages)
- [x] Wire Picking page — already reading from Supabase (no writes needed on Picking list itself)
- [x] Wire Shipping/ShipBundle page — Mark as Packed and Mark as Shipped both write to Supabase shipments table
- [x] Wire Donation Intake — already fully wired to trpc.donations.add.useMutation
- [x] Wire Process Returns — lookupBySku and processReturn procedures added; page rewritten to use live data
- [x] Wire Event Sign-Up form — already wired to trpc.signups.add.useMutation
- [x] Wire Event Sign-Up control page — shows live submissions, expand details, Convert to Member button

## Sidebar Enhancements
- [x] Add pending label count badge to Labels nav item in sidebar (amber pill, auto-refreshes every 60s, group badge shows on Orders when collapsed)

## Returns Audit Trail
- [x] Wire processReturn to also write a record to the returns table (audit trail)
- [x] Add a return history log to the Process Returns page showing recent returns

## Batch Picking Rebuild (Pharmacy-Style)
- [x] Audit Supabase: shipments, members, book_copies, shipment_books, member interests/exclusions
- [x] Build backend: smart book suggestion engine (age group + interests + exclusions + not-sent-before)
- [x] Build backend: batch picking procedures (generate daily order list, confirm picks, create shipment_books)
- [x] Rebuild Picking page: daily batch view showing all pending orders with per-member book suggestions
- [x] Add "Confirm All Picks" flow: lock in book assignments across all orders at once
- [x] Wire Ship Bundle page to the confirmed picks (bundle → print label → mark shipped)

## Pick List Enhancements
- [x] Add book cover thumbnails to the bin-sorted pick list for visual verification

## Printable Pick List
- [x] Add "Print Pick List" button to Picking page with print-optimised layout (covers, SKUs, member names)

## Intake Pipeline (Receive → QC → Stock)
- [x] Update Receive Books to set initial copy status to pending_qc (instead of in_house)
- [x] Add backend procedures: qc.queue (list pending_qc), qc.pass (→ pending_stock), qc.fail (→ donated_lfl)
- [x] Add backend procedures: stock.queue (list pending_stock), stock.confirmPlaced (→ in_house), stock.confirmAll
- [x] Build QC Queue page: list pending copies, condition rating, cleaning note, Pass/Fail actions
- [x] Build Stock Queue page: list pending_stock copies with bin, batch confirm placed
- [x] Add QC Queue and Stock Queue to sidebar under Inventory with count badges
- [x] Update sidebar badge counts for QC and Stock queues (auto-refresh every 60s)
- [x] Add Go to QC Queue shortcut card in Receive Books post-session area

## QC Simplification
- [x] Remove condition rating from QC Queue — replace with simple Accept / Reject buttons

## Inventory Detail Drawer
- [x] Add tRPC procedures: inventory.getBookDetail (title + all copies), inventory.updateBookTitle, inventory.updateCopy, inventory.setCopyStatus
- [x] Build BookDetailDrawer slide-over: edit title/author/age group/ISBN/cover URL, list all copies with status + bin + SKU
- [x] Per-copy actions in drawer: change status (in_house, pending_qc, pending_stock, donated_lfl, etc.), edit bin/SKU
- [x] Wire drawer to Inventory Snapshot — clicking any row opens the drawer

## Send to QC Quick Action
- [x] Add one-click "Send to QC" button per copy row in BookDetailDrawer (sets status to pending_qc instantly, no edit form needed)

## Status Constraint Fix
- [x] Discover allowed status values from Supabase book_copies_status_check constraint
- [x] Align all status values in the app to only use allowed values (migration run in Supabase)

## Label Queue & Label Design
- [x] Add ISBN to label queue list display
- [x] Redesign printed label: title, ISBN, SKU, bin_code, QR code (value = SKU)
