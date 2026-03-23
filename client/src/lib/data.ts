// BookNest Ops — Mock Data Store
// Design: Warm Linen Artisan Light

export type BookStatus = "In House" | "Picking" | "Picked" | "Packed" | "Shipped" | "Damaged" | "Retired";
export type AgeGroup = "Hatchlings (0-2)" | "Fledglings (3-5)" | "Soarers (6-8)" | "Sky Readers (9-12)";
export type MemberStatus = "active" | "waitlist";
export type MemberTier = "Little Nest" | "Cozy Nest" | "Story Nest" | "Sky Nest" | null;
export type OrderStatus = "Picking" | "Picked" | "Packed" | "Shipped" | "Overdue";
export type DonationCondition = "New / Like New" | "Good" | "Acceptable" | "Poor";
export type DonationStatus = "In Inventory" | "Rejected" | "Donated Out" | "Pending";

export interface Book {
  id: string;
  sku: string;
  isbn: string;
  title: string;
  author: string;
  ageGroup: AgeGroup;
  bin: string;
  status: BookStatus;
  receivedDate: string;
  coverUrl?: string;
  tags?: string[];
}

export interface Member {
  id: string;
  name: string;
  email: string;
  status: MemberStatus;
  tier: MemberTier;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  ageGroup?: AgeGroup;
  joinedDate: string;
  flags?: string[];
}

export interface Order {
  id: string;
  orderNumber: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  tier: MemberTier;
  booksTotal: number;
  booksPicked: number;
  status: OrderStatus;
  orderDate: string;
  shipByDate: string;
  address?: string;
  estimatedWeight?: string;
}

export interface Donation {
  id: string;
  date: string;
  title: string;
  author: string;
  isbn?: string;
  condition: DonationCondition;
  donor?: string;
  skuAssigned?: string;
  status: DonationStatus;
  ageGroup?: AgeGroup;
  notes?: string;
}

export interface BinData {
  bin: string;
  ageGroup: AgeGroup;
  topic: string;
  count: number;
}

// ─── INVENTORY ───────────────────────────────────────────────
export const books: Book[] = [
  { id: "1", sku: "BN-FLED-0597", isbn: "9781949474497", title: "Fiona Flamingo", author: "Rachael Urrutia Chu", ageGroup: "Fledglings (3-5)", bin: "FLED-IDENTITY-01", status: "In House", receivedDate: "3/16/2026" },
  { id: "2", sku: "BN-FLED-0596", isbn: "0222015020", title: "Sushila's Band", author: "Stephanie Lang", ageGroup: "Fledglings (3-5)", bin: "FLED-LIFE-01", status: "In House", receivedDate: "3/16/2026" },
  { id: "3", sku: "BN-FLED-0595", isbn: "1435113322", title: "Mr. Daydream", author: "Roger Hargreaves", ageGroup: "Fledglings (3-5)", bin: "FLED-HUMOR-01", status: "In House", receivedDate: "3/16/2026" },
  { id: "4", sku: "BN-SOAR-0705", isbn: "9781368028165", title: "Olaf and the Three Polar Bears", author: "Calliope Glass", ageGroup: "Soarers (6-8)", bin: "SOAR-ADVENTURE-01", status: "In House", receivedDate: "3/13/2026" },
  { id: "5", sku: "BN-FLED-0587", isbn: "9781945200267", title: "Daydream with Max and Molly", author: "Todd Courtney", ageGroup: "Fledglings (3-5)", bin: "FLED-IDENTITY-01", status: "Damaged", receivedDate: "3/16/2026" },
  { id: "6", sku: "BN-FLED-0586", isbn: "9781524738754", title: "Baking Day at Grandma's", author: "Anika Denise", ageGroup: "Fledglings (3-5)", bin: "FLED-LIFE-01", status: "Damaged", receivedDate: "3/16/2026" },
  { id: "7", sku: "BN-SOAR-0702", isbn: "9781338323320", title: "Bo's Magical New Friend", author: "Rebecca Elliott", ageGroup: "Soarers (6-8)", bin: "SOAR-ADVENTURE-01", status: "Picking", receivedDate: "3/13/2026" },
  { id: "8", sku: "BN-SOAR-0701", isbn: "0439338034", title: "Orphan Puppy", author: "Jenny Dale", ageGroup: "Soarers (6-8)", bin: "SOAR-NATURE-01", status: "Picking", receivedDate: "3/13/2026" },
  { id: "9", sku: "BN-FLED-0580", isbn: "9781338265064", title: "Not Quite Narwhal", author: "Jessie Sima", ageGroup: "Fledglings (3-5)", bin: "FLED-IDENTITY-01", status: "In House", receivedDate: "3/13/2026" },
  { id: "10", sku: "BN-FLED-0579", isbn: "9781338826449", title: "The Grinny Granny Donkey", author: "Craig Smith", ageGroup: "Fledglings (3-5)", bin: "FLED-HUMOR-01", status: "In House", receivedDate: "3/13/2026" },
  { id: "11", sku: "BN-SKY-0210", isbn: "9780439023481", title: "The Hunger Games", author: "Suzanne Collins", ageGroup: "Sky Readers (9-12)", bin: "SKY-ADVENTURE-01", status: "In House", receivedDate: "3/10/2026" },
  { id: "12", sku: "BN-HATC-0150", isbn: "9780062409850", title: "Goodnight Moon", author: "Margaret Wise Brown", ageGroup: "Hatchlings (0-2)", bin: "HATC-LIFE-01", status: "In House", receivedDate: "3/8/2026" },
  { id: "13", sku: "BN-HATC-0151", isbn: "9780399226908", title: "The Very Hungry Caterpillar", author: "Eric Carle", ageGroup: "Hatchlings (0-2)", bin: "HATC-NATURE-01", status: "In House", receivedDate: "3/8/2026" },
  { id: "14", sku: "BN-SOAR-0698", isbn: "9780545480253", title: "Diary of a Wimpy Kid", author: "Jeff Kinney", ageGroup: "Soarers (6-8)", bin: "SOAR-HUMOR-01", status: "Picked", receivedDate: "3/5/2026" },
  { id: "15", sku: "BN-SKY-0209", isbn: "9780439708180", title: "Harry Potter and the Sorcerer's Stone", author: "J.K. Rowling", ageGroup: "Sky Readers (9-12)", bin: "SKY-CLASSICS-01", status: "Packed", receivedDate: "3/1/2026" },
];

// ─── BIN INVENTORY ───────────────────────────────────────────
export const bins: BinData[] = [
  { bin: "HATC-LIFE-01", ageGroup: "Hatchlings (0-2)", topic: "Life", count: 12 },
  { bin: "HATC-NATURE-01", ageGroup: "Hatchlings (0-2)", topic: "Nature", count: 8 },
  { bin: "HATC-HUMOR-01", ageGroup: "Hatchlings (0-2)", topic: "Humor", count: 3 },
  { bin: "HATC-LEARN-01", ageGroup: "Hatchlings (0-2)", topic: "Learn", count: 7 },
  { bin: "HATC-ADVENTURE-01", ageGroup: "Hatchlings (0-2)", topic: "Adventure", count: 10 },
  { bin: "FLED-ADVENTURE-01", ageGroup: "Fledglings (3-5)", topic: "Adventure", count: 13 },
  { bin: "FLED-CLASSICS-01", ageGroup: "Fledglings (3-5)", topic: "Classics", count: 4 },
  { bin: "FLED-HUMOR-01", ageGroup: "Fledglings (3-5)", topic: "Humor", count: 19 },
  { bin: "FLED-IDENTITY-01", ageGroup: "Fledglings (3-5)", topic: "Identity", count: 8 },
  { bin: "FLED-LEARN-01", ageGroup: "Fledglings (3-5)", topic: "Learn", count: 13 },
  { bin: "FLED-LIFE-01", ageGroup: "Fledglings (3-5)", topic: "Life", count: 31 },
  { bin: "FLED-NATURE-01", ageGroup: "Fledglings (3-5)", topic: "Nature", count: 22 },
  { bin: "FLED-SEASONAL-01", ageGroup: "Fledglings (3-5)", topic: "Seasonal", count: 6 },
  { bin: "SOAR-ADVENTURE-01", ageGroup: "Soarers (6-8)", topic: "Adventure", count: 82 },
  { bin: "SOAR-CLASSICS-01", ageGroup: "Soarers (6-8)", topic: "Classics", count: 4 },
  { bin: "SOAR-HUMOR-01", ageGroup: "Soarers (6-8)", topic: "Humor", count: 48 },
  { bin: "SOAR-IDENTITY-01", ageGroup: "Soarers (6-8)", topic: "Identity", count: 2 },
  { bin: "SOAR-LEARN-01", ageGroup: "Soarers (6-8)", topic: "Learn", count: 10 },
  { bin: "SOAR-LIFE-01", ageGroup: "Soarers (6-8)", topic: "Life", count: 38 },
  { bin: "SOAR-NATURE-01", ageGroup: "Soarers (6-8)", topic: "Nature", count: 17 },
  { bin: "SOAR-SEASONAL-01", ageGroup: "Soarers (6-8)", topic: "Seasonal", count: 7 },
  { bin: "SKY-ADVENTURE-01", ageGroup: "Sky Readers (9-12)", topic: "Adventure", count: 36 },
  { bin: "SKY-CLASSICS-01", ageGroup: "Sky Readers (9-12)", topic: "Classics", count: 6 },
  { bin: "SKY-HUMOR-01", ageGroup: "Sky Readers (9-12)", topic: "Humor", count: 9 },
  { bin: "SKY-IDENTITY-01", ageGroup: "Sky Readers (9-12)", topic: "Identity", count: 10 },
  { bin: "SKY-LEARN-01", ageGroup: "Sky Readers (9-12)", topic: "Learn", count: 3 },
  { bin: "SKY-LIFE-01", ageGroup: "Sky Readers (9-12)", topic: "Life", count: 35 },
  { bin: "SKY-NATURE-01", ageGroup: "Sky Readers (9-12)", topic: "Nature", count: 4 },
  { bin: "SKY-CLASSICS-02", ageGroup: "Sky Readers (9-12)", topic: "Classics", count: 0 },
];

// ─── MEMBERS ─────────────────────────────────────────────────
export const members: Member[] = [
  { id: "m1", name: "Harry Potter", email: "harry.potter@test.booknest.com", status: "active", tier: "Cozy Nest", address: "4 Privet Drive", city: "Little Whinging", state: "Surrey", zip: "99001", ageGroup: "Soarers (6-8)", joinedDate: "1/15/2026" },
  { id: "m2", name: "Matilda Wormwood", email: "matilda.wormwood@test.booknest.com", status: "active", tier: "Story Nest", address: "10 Elm Guest House Rd", city: "Crunchem Hall", state: "OH", zip: "44101", ageGroup: "Sky Readers (9-12)", joinedDate: "1/20/2026" },
  { id: "m3", name: "Junie B. Jones", email: "junie.b@test.booknest.com", status: "active", tier: "Cozy Nest", address: "9 Classroom Blvd", city: "Wushka", state: "FL", zip: "32001", ageGroup: "Fledglings (3-5)", joinedDate: "2/1/2026" },
  { id: "m4", name: "Eliza Thornberry", email: "eliza.thornberry@test.booknest.com", status: "active", tier: "Story Nest", address: "1 Jungle Rd", city: "Thornberry", state: "AZ", zip: "85001", ageGroup: "Fledglings (3-5)", joinedDate: "2/10/2026" },
  { id: "m5", name: "Biscuit the Dog", email: "biscuit@test.booknest.com", status: "active", tier: "Little Nest", address: "22 Biscuit Lane", city: "Puppytown", state: "KY", zip: "40201", ageGroup: "Hatchlings (0-2)", joinedDate: "2/15/2026" },
  { id: "m6", name: "Test Shipping Member", email: "test.shipping@booknest.com", status: "active", tier: null, address: "", city: "", state: "", zip: "", joinedDate: "1/1/2026" },
  { id: "m7", name: "Lucky Rock Finder", email: "alexi.lee98@gmail.com", status: "waitlist", tier: null, joinedDate: "3/1/2026" },
  { id: "m8", name: "Thomas Neville", email: "tom.neville.a@gmail.com", status: "waitlist", tier: null, ageGroup: "Fledglings (3-5)", joinedDate: "3/2/2026" },
  { id: "m9", name: "Amber Holmes", email: "brown.amber254@gmail.com", status: "waitlist", tier: null, ageGroup: "Hatchlings (0-2)", joinedDate: "3/3/2026" },
  { id: "m10", name: "Christena Chenoweth", email: "tenabeana.cp@gmail.com", status: "waitlist", tier: null, ageGroup: "Fledglings (3-5)", joinedDate: "3/4/2026" },
  { id: "m11", name: "Chloe Barkey", email: "b.chloerain@gmail.com", status: "waitlist", tier: null, ageGroup: "Hatchlings (0-2)", joinedDate: "3/5/2026" },
  { id: "m12", name: "Jazmin Bittinger", email: "jazmin.zapataa@gmail.com", status: "waitlist", tier: null, ageGroup: "Hatchlings (0-2)", joinedDate: "3/6/2026" },
  { id: "m13", name: "Ariel Malasky", email: "arielmalasky@gmail.com", status: "waitlist", tier: null, ageGroup: "Fledglings (3-5)", joinedDate: "3/7/2026" },
  { id: "m14", name: "Evelyn White", email: "missevviemarie@gmail.com", status: "waitlist", tier: null, ageGroup: "Hatchlings (0-2)", joinedDate: "3/8/2026" },
  { id: "m15", name: "Molly Kellam", email: "mrk100100@gmail.com", status: "waitlist", tier: null, ageGroup: "Hatchlings (0-2)", joinedDate: "3/9/2026" },
  { id: "m16", name: "Jennifer Luketic", email: "luketicllc@gmail.com", status: "waitlist", tier: null, ageGroup: "Soarers (6-8)", joinedDate: "3/10/2026" },
  { id: "m17", name: "Katelyn OToole", email: "bkate4404@gmail.com", status: "waitlist", tier: null, ageGroup: "Fledglings (3-5)", joinedDate: "3/11/2026" },
  { id: "m18", name: "Laura Fagan", email: "laurabfagan@gmail.com", status: "waitlist", tier: null, ageGroup: "Hatchlings (0-2)", joinedDate: "3/12/2026" },
  { id: "m19", name: "Kathryn Williams", email: "kathrynew123@gmail.com", status: "waitlist", tier: null, ageGroup: "Fledglings (3-5)", joinedDate: "3/13/2026" },
  { id: "m20", name: "Kristen Michael", email: "km939801@gmail.com", status: "waitlist", tier: null, ageGroup: "Soarers (6-8)", joinedDate: "3/14/2026" },
];

// ─── ORDERS ──────────────────────────────────────────────────
export const orders: Order[] = [
  {
    id: "o1",
    orderNumber: "ORD-TEST-001",
    memberId: "m1",
    memberName: "Harry Potter",
    memberEmail: "harry.potter@test.booknest.com",
    tier: "Cozy Nest",
    booksTotal: 6,
    booksPicked: 6,
    status: "Overdue",
    orderDate: "2/10/2026",
    shipByDate: "2/24/2026",
    address: "4 Privet Drive, Little Whinging, Surrey 99001",
    estimatedWeight: "3.0 lbs",
  },
  {
    id: "o2",
    orderNumber: "ORD-TEST-002",
    memberId: "m6",
    memberName: "Test Shipping Member",
    memberEmail: "test.shipping@booknest.com",
    tier: null,
    booksTotal: 6,
    booksPicked: 1,
    status: "Overdue",
    orderDate: "2/10/2026",
    shipByDate: "2/24/2026",
    address: "",
    estimatedWeight: "0.5 lbs",
  },
  {
    id: "o3",
    orderNumber: "ORD-2026-0045",
    memberId: "m2",
    memberName: "Matilda Wormwood",
    memberEmail: "matilda.wormwood@test.booknest.com",
    tier: "Story Nest",
    booksTotal: 8,
    booksPicked: 0,
    status: "Picking",
    orderDate: "3/20/2026",
    shipByDate: "3/28/2026",
    address: "10 Elm Guest House Rd, Crunchem Hall, OH 44101",
    estimatedWeight: "4.0 lbs",
  },
  {
    id: "o4",
    orderNumber: "ORD-2026-0046",
    memberId: "m3",
    memberName: "Junie B. Jones",
    memberEmail: "junie.b@test.booknest.com",
    tier: "Cozy Nest",
    booksTotal: 6,
    booksPicked: 3,
    status: "Picking",
    orderDate: "3/21/2026",
    shipByDate: "3/29/2026",
    address: "9 Classroom Blvd, Wushka, FL 32001",
    estimatedWeight: "3.0 lbs",
  },
];

// ─── DONATIONS ───────────────────────────────────────────────
export const donations: Donation[] = [
  { id: "d1", date: "3/20/2026", title: "Charlotte's Web", author: "E.B. White", isbn: "9780061124952", condition: "Good", donor: "Sarah Johnson", skuAssigned: "BN-SOAR-0710", status: "In Inventory", ageGroup: "Soarers (6-8)" },
  { id: "d2", date: "3/20/2026", title: "Where the Wild Things Are", author: "Maurice Sendak", isbn: "9780064431781", condition: "Like New" as DonationCondition, donor: "Sarah Johnson", skuAssigned: "BN-FLED-0600", status: "In Inventory", ageGroup: "Fledglings (3-5)" },
  { id: "d3", date: "3/18/2026", title: "The Giving Tree", author: "Shel Silverstein", isbn: "9780060256654", condition: "Acceptable", donor: "Community Drive", skuAssigned: "BN-FLED-0599", status: "In Inventory", ageGroup: "Fledglings (3-5)" },
  { id: "d4", date: "3/18/2026", title: "Old torn book (no title visible)", author: "Unknown", condition: "Poor", donor: "Community Drive", status: "Rejected", notes: "Heavy water damage, pages torn" },
  { id: "d5", date: "3/15/2026", title: "Matilda", author: "Roald Dahl", isbn: "9780142410370", condition: "Good", donor: "Riverside Elementary", skuAssigned: "BN-SKY-0215", status: "In Inventory", ageGroup: "Sky Readers (9-12)" },
  { id: "d6", date: "3/15/2026", title: "James and the Giant Peach", author: "Roald Dahl", isbn: "9780142410363", condition: "Good", donor: "Riverside Elementary", skuAssigned: "BN-SKY-0216", status: "In Inventory", ageGroup: "Sky Readers (9-12)" },
  { id: "d7", date: "3/10/2026", title: "Pat the Bunny", author: "Dorothy Kunhardt", isbn: "9780307120007", condition: "New / Like New", donor: "Anonymous", skuAssigned: "BN-HATC-0155", status: "In Inventory", ageGroup: "Hatchlings (0-2)" },
  { id: "d8", date: "3/22/2026", title: "Wonder", author: "R.J. Palacio", isbn: "9780375869020", condition: "Good", donor: "Mrs. Thompson", status: "Pending", ageGroup: "Sky Readers (9-12)" },
  { id: "d9", date: "3/22/2026", title: "Diary of a Wimpy Kid", author: "Jeff Kinney", isbn: "9780810993136", condition: "Acceptable", donor: "Mrs. Thompson", status: "Pending", ageGroup: "Soarers (6-8)" },
  { id: "d10", date: "3/22/2026", title: "The BFG", author: "Roald Dahl", isbn: "9780142410381", condition: "New / Like New", donor: "Mrs. Thompson", status: "Pending", ageGroup: "Soarers (6-8)" },
];

// ─── NOTIFICATIONS ───────────────────────────────────────────
export interface Notification {
  id: string;
  type: "urgent" | "warning" | "info" | "success";
  title: string;
  message: string;
  time: string;
  read: boolean;
  link?: string;
}

export const notifications: Notification[] = [
  { id: "n1", type: "urgent", title: "2 Orders Overdue", message: "ORD-TEST-001 and ORD-TEST-002 were due Feb 24. Ship immediately.", time: "Now", read: false, link: "/shipping" },
  { id: "n2", type: "warning", title: "SKY-CLASSICS-02 is Empty", message: "This bin has 0 books. Receive inventory to restock.", time: "2h ago", read: false, link: "/inventory" },
  { id: "n3", type: "warning", title: "SOAR-IDENTITY-01 is Critical", message: "Only 2 books remaining in this bin.", time: "2h ago", read: false, link: "/inventory" },
  { id: "n4", type: "info", title: "3 Donations Pending", message: "Mrs. Thompson's donation batch needs to be processed.", time: "1h ago", read: false, link: "/donations/intake" },
  { id: "n5", type: "warning", title: "HATC-HUMOR-01 is Low", message: "Only 3 books remaining in Hatchlings Humor bin.", time: "3h ago", read: true, link: "/inventory" },
  { id: "n6", type: "success", title: "Label Batch Printed", message: "LBL-20260214 batch of 2 labels marked as printed.", time: "Yesterday", read: true },
];

// ─── LABEL BATCHES ───────────────────────────────────────────
export interface LabelBatch {
  id: string;
  batchId: string;
  createdDate: string;
  status: "Pending" | "Printed" | "Released";
  books: { title: string; isbn: string; sku: string; bin: string }[];
}

export const labelBatches: LabelBatch[] = [
  {
    id: "lb1",
    batchId: "LBL-20260214-222343-4c544d",
    createdDate: "2/14/2026",
    status: "Printed",
    books: [
      { title: "Dolphins", isbn: "0545462894", sku: "BN-SOAR-0002", bin: "SOAR-LEARN-01" },
      { title: "Manatees", isbn: "0545750105", sku: "BN-SOAR-0001", bin: "SOAR-LEARN-01" },
    ],
  },
];

// ─── STATS ───────────────────────────────────────────────────
export const dashboardStats = {
  pickingQueue: 2,
  shippingQueue: 2,
  overdueOrders: 2,
  completedToday: 0,
  totalInventory: 469,
  activeBins: 32,
  lowBins: 8,
  emptyBins: 1,
  activeMembers: 6,
  waitlistMembers: 35,
  donationsPending: 3,
  donationsThisMonth: 10,
  donationsInInventory: 7,
};
