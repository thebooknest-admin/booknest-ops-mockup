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
