// BookNest Ops — Full Tag Taxonomy & Subject-to-Tag Mapping Engine
// Maps Open Library subjects → BookNest tags → bin category

// ─── TAXONOMY ────────────────────────────────────────────────────────────────

export type BinCategory = "ADVENTURE" | "HUMOR" | "LIFE" | "LEARN" | "IDENTITY" | "NATURE" | "SEASONAL" | "CLASSICS";

export interface TagCategory {
  id: BinCategory;
  label: string;
  emoji: string;
  color: { bg: string; text: string; border: string };
  tags: string[];
}

export const TAG_TAXONOMY: TagCategory[] = [
  {
    id: "ADVENTURE",
    label: "Brave & Bold",
    emoji: "🌟",
    color: { bg: "oklch(0.95 0.06 220)", text: "oklch(0.30 0.14 220)", border: "oklch(0.80 0.10 220)" },
    tags: [
      "Exploration", "Quest", "Survival", "Journey", "Treasure", "Pirates", "Space",
      "Time Travel", "Fantasy", "Magic", "Dragons", "Mythology", "Superheroes",
      "Secret Worlds", "Detective", "Mystery", "Spy", "Wilderness", "Ocean Voyage",
      "Historical Adventure", "Action", "Treasure Hunt", "Lost & Found",
      "Brave Hero", "Epic Battle", "Portal Fantasy", "Expedition", "Legends",
      // Expanded
      "Monsters", "Villains", "Heist", "Undercover", "Chase", "Escape",
      "Hidden Map", "Forbidden Place", "Enchanted Forest", "Underground World",
      "Skyship", "Haunted", "Cursed Object", "Secret Society", "Double Agent",
      "Rescue Mission", "Time Loop", "Shadow World", "Labyrinth", "Mythical Beasts",
      "Sword & Sorcery", "Underdog Hero",
      "Castles & Kingdoms", "Fairies", "Magical Creatures", "Running & Racing", "Wizards & Witches",
    ],
  },
  {
    id: "HUMOR",
    label: "Giggle Worthy",
    emoji: "😂",
    color: { bg: "oklch(0.96 0.06 75)", text: "oklch(0.45 0.14 75)", border: "oklch(0.84 0.10 75)" },
    tags: [
      "Silly", "Funny", "Giggle-Worthy", "Slapstick", "Animal Antics", "Mischief Makers",
      "School Shenanigans", "Goofy Characters", "Wordplay", "Puns", "Bathroom Humor",
      "Pranks", "Awkward Moments", "Graphic Novel", "Comic Style", "Lighthearted",
      "Unexpected Twist", "Ridiculous Situations", "Talking Animals", "Over-the-Top",
      "Sarcasm", "Sibling Chaos", "Silly Mystery", "Exaggeration", "Quirky",
      "Wild Imagination", "Friendship Fails",
      // Expanded
      "Embarrassing Moments", "Epic Fails", "Misunderstandings", "Unreliable Narrator",
      "Chaotic Family", "Bumbling Adults", "Class Clown", "Gross-Out", "Absurdist",
      "Running Gags", "Exaggerated Hero", "Mistaken Identity", "Too-Smart Pet",
      "Wacky Invention", "Fast-Paced Comedy", "Reluctant Rule-Breaker",
      "Underdog Comedy", "Disaster Magnet", "Pie-in-Face Energy", "Snarky Sidekick",
      "Deadpan Humor", "Plot Twist Comedy", "Fourth Wall Break",
    ],
  },
  {
    id: "LIFE",
    label: "Heart & Home",
    emoji: "🌿",
    color: { bg: "oklch(0.95 0.05 155)", text: "oklch(0.30 0.12 155)", border: "oklch(0.80 0.08 155)" },
    tags: [
      "Family", "Siblings", "Friendship", "Kindness", "Responsibility", "Growing Up",
      "School Life", "Community", "Teamwork", "Courage", "Empathy", "Bedtime",
      "New Experiences", "Moving", "New Baby", "Loss & Grief", "Adoption", "Divorce",
      "Celebrations", "Traditions", "Self-Discovery", "Manners", "Problem Solving",
      "Feelings", "Mental Health", "Social Skills", "Patience", "Honesty",
      // Expanded
      "Starting Over", "Making Friends", "Standing Up for Yourself", "Overcoming Fear",
      "Disappointment", "Jealousy", "Forgiveness", "Change & Transition",
      "Saying Goodbye", "Big Feelings", "Worry & Anxiety", "Being Different",
      "Finding Your Place", "Following Dreams", "Doing Hard Things", "Home & Belonging",
      "Trust", "Persistence", "Failure & Trying Again", "Belonging", "Loneliness",
      "Navigating Conflict", "Sharing", "First Day",
      "Community Helpers", "Everyday Life", "Getting Dressed", "Imagination & Pretend Play", "Mealtime",
    ],
  },
  {
    id: "LEARN",
    label: "Curious Minds",
    emoji: "🧠",
    color: { bg: "oklch(0.95 0.05 270)", text: "oklch(0.30 0.14 270)", border: "oklch(0.80 0.10 270)" },
    tags: [
      "Alphabet", "Numbers", "Counting", "Shapes", "Colors", "Sight Words", "Early Reader",
      "STEM", "Science", "Space Facts", "Dinosaurs", "Animals", "Ocean Life", "History",
      "Geography", "Biographies", "Inventors", "Coding", "Engineering", "Math",
      "Experiments", "Weather", "Human Body", "Nature Facts", "Nonfiction",
      "Vocabulary Builder", "Phonics", "Cultural Learning",
      // Expanded
      "Physics", "Chemistry", "Biology", "Geology", "Archaeology", "Robotics",
      "Electricity", "Machines", "Famous Scientists", "Famous Artists",
      "World Cultures", "Ancient Civilizations", "Maps & Cartography", "Astronomy",
      "Food Science", "Architecture", "Art History", "Music Theory",
      "Economics for Kids", "Government & Civics", "Logic & Puzzles", "Human Rights",
      "Medical Science", "Environmental Science",
      "Crafts & Making", "Dancing", "Drawing & Painting", "Music & Instruments", "Technology",
    ],
  },
  {
    id: "IDENTITY",
    label: "All About Me",
    emoji: "🌈",
    color: { bg: "oklch(0.95 0.06 330)", text: "oklch(0.35 0.14 330)", border: "oklch(0.82 0.10 330)" },
    tags: [
      "Diversity", "Cultural Stories", "Black Joy", "Latinx Stories", "Asian Stories",
      "Indigenous Stories", "Disability Representation", "Neurodiversity", "LGBTQ+",
      "Strong Girls", "Boy Empowerment", "Body Positivity", "Confidence", "Self-Acceptance",
      "Family Heritage", "Immigration", "Language & Bilingual", "Faith-Based", "Traditions",
      "Leadership", "First Generation", "Gender Expression", "Overcoming Obstacles",
      "Role Models", "Empowerment", "Representation Matters", "Social Justice",
      // Expanded
      "Mixed Heritage", "Refugee Stories", "Deaf & Hard of Hearing", "Blind & Low Vision",
      "Chronic Illness", "Single-Parent Family", "Grandparent-Led Family", "Found Family",
      "Nontraditional Family", "Trans Stories", "Biracial Identity", "Religious Diversity",
      "Muslim Stories", "Jewish Stories", "Hindu Stories", "Sikh Stories",
      "Adopted Identity", "Military Family", "Rural Identity", "Urban Identity",
      "Intergenerational", "Reclaiming Culture", "Pride & Joy",
    ],
  },
  {
    id: "NATURE",
    label: "Wild Things",
    emoji: "🌳",
    color: { bg: "oklch(0.95 0.06 140)", text: "oklch(0.28 0.12 140)", border: "oklch(0.80 0.08 140)" },
    tags: [
      "Animals", "Farm", "Zoo", "Pets", "Wildlife", "Forest", "Ocean", "Bugs & Insects",
      "Dinosaurs", "Gardening", "Camping", "Hiking", "National Parks", "Conservation",
      "Environment", "Earth Day", "Weather", "Seasons", "Water Cycle", "Life Cycles",
      "Ecosystems", "Birds", "Arctic", "Jungle", "Desert", "Volcanoes", "Rocks & Minerals",
      // Expanded
      "Reptiles", "Amphibians", "Marine Mammals", "Tide Pools", "Rainforest",
      "Grasslands", "Wetlands", "Mountains", "Rivers & Lakes", "Caves",
      "Fungi & Mushrooms", "Trees & Plants", "Pollinators", "Butterflies",
      "Migration", "Fossils", "Endangered Species", "Rewilding", "Composting",
      "Beekeeping", "Stargazing", "Tides & Moon", "Seasonal Animals", "Nocturnal Animals",
      "Bears", "Cats", "Dogs", "Woodland Animals",
    ],
  },
  {
    id: "SEASONAL",
    label: "Celebrate!",
    emoji: "🍁",
    color: { bg: "oklch(0.96 0.05 45)", text: "oklch(0.40 0.14 45)", border: "oklch(0.84 0.10 45)" },
    tags: [
      "Spring", "Summer", "Fall", "Winter", "Back to School", "Halloween", "Thanksgiving",
      "Christmas", "Hanukkah", "Easter", "Valentine's Day", "St. Patrick's Day",
      "Fourth of July", "New Year", "Lunar New Year", "Ramadan", "Diwali", "Birthdays",
      "Snow Day", "Beach Day", "Harvest", "Graduation", "Mother's Day", "Father's Day",
      "Earth Day", "First Day of School",
      // Expanded
      "Kwanzaa", "Eid", "Passover", "Cinco de Mayo", "Mardi Gras", "Groundhog Day",
      "Presidents Day", "MLK Day", "Labor Day", "Veterans Day", "Pi Day",
      "International Womens Day", "World Book Day", "Friendship Day", "Tooth Fairy Day",
      "100th Day of School", "End of Year", "Summer Reading", "Winter Break",
      "Spring Break", "Last Day of School", "Cozy Season", "Spooky Season",
      "Harvest Festival",
    ],
  },
  {
    id: "CLASSICS",
    label: "Old Favorites",
    emoji: "📚",
    color: { bg: "oklch(0.95 0.04 60)", text: "oklch(0.38 0.10 60)", border: "oklch(0.82 0.08 60)" },
    tags: [
      "Fairy Tale", "Folktale", "Fable", "Mythology", "Brothers Grimm",
      "Hans Christian Andersen", "Aesop", "Nursery Rhymes", "Golden Age", "Vintage",
      "Award Winner", "Caldecott", "Newbery", "Timeless", "Literary Classic",
      "Traditional Story", "Moral Lesson", "Epic Tale", "Historical Fiction",
      "Adapted Classic", "Illustrated Classic", "Poetry", "Chapter Classic",
      "Public Domain", "Character Driven", "Animal Classic", "Fantasy Classic",
      // Expanded
      "Bedtime Classic", "Picture Book Classic", "Early Reader Classic", "Series Classic",
      "Cultural Folktale", "Trickster Tale", "Creation Story", "Hero's Journey",
      "Coming-of-Age Classic", "School Staple", "Read-Aloud Favorite", "Beloved Character",
      "Classic Humor", "Classic Mystery", "Classic Adventure", "Classic Nature",
      "Classic Family Story", "Classic Friendship", "Classic Bravery", "Classic Underdog",
      "Classic Animal", "Retold Classic", "Classic Series Starter",
    ],
  },
];

// ─── SUBJECT → TAG KEYWORD MAP ───────────────────────────────────────────────
// Maps lowercased Open Library subject keywords → BookNest tag names

const SUBJECT_TO_TAG: Record<string, string[]> = {
  // ADVENTURE
  "adventure": ["Exploration", "Quest", "Journey"],
  "quest": ["Quest"],
  "survival": ["Survival"],
  "exploration": ["Exploration", "Expedition"],
  "treasure": ["Treasure", "Treasure Hunt"],
  "pirate": ["Pirates"],
  "space": ["Space"],
  "time travel": ["Time Travel"],
  "fantasy": ["Fantasy", "Portal Fantasy"],
  "magic": ["Magic"],
  "dragon": ["Dragons"],
  "mythology": ["Mythology"],
  "superhero": ["Superheroes"],
  "detective": ["Detective"],
  "mystery": ["Mystery", "Detective"],
  "spy": ["Spy"],
  "wilderness": ["Wilderness"],
  "ocean voyage": ["Ocean Voyage"],
  "historical": ["Historical Adventure"],
  "action": ["Action"],
  "hero": ["Brave Hero"],
  "battle": ["Epic Battle"],
  "legend": ["Legends"],
  "expedition": ["Expedition"],
  "dystopian": ["Survival", "Epic Battle"],
  "war": ["Epic Battle", "Historical Adventure"],
  "science fiction": ["Space", "Time Travel"],
  "horror": ["Haunted", "Brave Hero"],
  "thriller": ["Mystery", "Spy"],
  "apocalyptic": ["Survival", "Epic Battle"],
  "monster": ["Monsters"],
  "villain": ["Villains"],
  "heist": ["Heist"],
  "undercover": ["Undercover"],
  "chase": ["Chase"],
  "escape": ["Escape"],
  "haunted": ["Haunted"],
  "ghost": ["Haunted", "Shadow World"],
  "labyrinth": ["Labyrinth"],
  "maze": ["Labyrinth"],
  "rescue": ["Rescue Mission"],
  "secret society": ["Secret Society"],
  "enchanted": ["Enchanted Forest", "Magic"],
  "underground": ["Underground World"],
  "mythical": ["Mythical Beasts", "Mythology"],
  "sword": ["Sword & Sorcery"],
  "underdog": ["Underdog Hero"],

  // HUMOR
  "humor": ["Funny", "Silly"],
  "humorous": ["Funny", "Silly"],
  "funny": ["Funny", "Giggle-Worthy"],
  "comedy": ["Funny", "Lighthearted"],
  "silly": ["Silly"],
  "comic": ["Comic Style", "Graphic Novel"],
  "graphic novel": ["Graphic Novel", "Comic Style"],
  "wordplay": ["Wordplay", "Puns"],
  "pun": ["Puns", "Wordplay"],
  "slapstick": ["Slapstick"],
  "mischief": ["Mischief Makers", "Pranks"],
  "school": ["School Shenanigans", "School Life"],
  "pranks": ["Pranks"],
  "talking animals": ["Talking Animals", "Animal Antics"],
  "quirky": ["Quirky", "Goofy Characters"],
  "lighthearted": ["Lighthearted"],
  "embarrass": ["Embarrassing Moments"],
  "fails": ["Epic Fails"],
  "misunderstanding": ["Misunderstandings"],
  "chaotic": ["Chaotic Family"],
  "bumbling": ["Bumbling Adults"],
  "gross": ["Gross-Out", "Bathroom Humor"],
  "absurd": ["Absurdist"],
  "exaggerat": ["Exaggeration", "Exaggerated Hero"],
  "mistaken identity": ["Mistaken Identity"],
  "wacky": ["Wacky Invention", "Ridiculous Situations"],
  "fast-paced": ["Fast-Paced Comedy"],
  "snarky": ["Snarky Sidekick", "Sarcasm"],
  "deadpan": ["Deadpan Humor"],
  "fourth wall": ["Fourth Wall Break"],

  // LIFE
  "family": ["Family"],
  "sibling": ["Siblings", "Sibling Chaos"],
  "friendship": ["Friendship"],
  "kindness": ["Kindness", "Empathy"],
  "growing up": ["Growing Up", "Self-Discovery"],
  "community": ["Community"],
  "teamwork": ["Teamwork"],
  "courage": ["Courage", "Brave Hero"],
  "empathy": ["Empathy"],
  "bedtime": ["Bedtime"],
  "new experiences": ["New Experiences"],
  "moving": ["Moving"],
  "grief": ["Loss & Grief"],
  "loss": ["Loss & Grief"],
  "adoption": ["Adoption"],
  "divorce": ["Divorce"],
  "celebration": ["Celebrations"],
  "tradition": ["Traditions"],
  "self-discovery": ["Self-Discovery"],
  "manners": ["Manners"],
  "problem solving": ["Problem Solving"],
  "feelings": ["Feelings", "Big Feelings"],
  "mental health": ["Mental Health"],
  "social skills": ["Social Skills"],
  "patience": ["Patience"],
  "honesty": ["Honesty"],
  "responsibility": ["Responsibility"],
  "coming of age": ["Growing Up", "Self-Discovery"],
  "personal development": ["Growing Up", "Self-Discovery"],
  "anxiety": ["Worry & Anxiety"],
  "worry": ["Worry & Anxiety"],
  "fear": ["Overcoming Fear"],
  "jealous": ["Jealousy"],
  "forgiveness": ["Forgiveness"],
  "lonely": ["Loneliness"],
  "belonging": ["Belonging", "Home & Belonging"],
  "persist": ["Persistence"],
  "first day": ["First Day"],
  "making friends": ["Making Friends"],
  "standing up": ["Standing Up for Yourself"],
  "trust": ["Trust"],
  "sharing": ["Sharing"],
  "disappointment": ["Disappointment"],
  "saying goodbye": ["Saying Goodbye"],
  "change": ["Change & Transition"],

  // LEARN
  "alphabet": ["Alphabet", "Phonics"],
  "numbers": ["Numbers", "Counting"],
  "counting": ["Counting"],
  "shapes": ["Shapes"],
  "colors": ["Colors"],
  "stem": ["STEM", "Science"],
  "science": ["Science"],
  "space facts": ["Space Facts"],
  "dinosaur": ["Dinosaurs"],
  "ocean": ["Ocean Life"],
  "history": ["History"],
  "geography": ["Geography"],
  "biography": ["Biographies"],
  "biographies": ["Biographies"],
  "inventor": ["Inventors"],
  "coding": ["Coding"],
  "engineering": ["Engineering"],
  "math": ["Math"],
  "experiment": ["Experiments"],
  "weather": ["Weather"],
  "human body": ["Human Body"],
  "nonfiction": ["Nonfiction"],
  "vocabulary": ["Vocabulary Builder"],
  "phonics": ["Phonics"],
  "educational": ["Nonfiction"],
  "cultural": ["Cultural Learning", "World Cultures"],
  "astronomy": ["Astronomy", "Space Facts"],
  "physics": ["Physics", "STEM"],
  "chemistry": ["Chemistry", "Experiments"],
  "biology": ["Biology"],
  "ecology": ["Environmental Science", "Conservation"],
  "geology": ["Geology"],
  "archaeology": ["Archaeology"],
  "robot": ["Robotics"],
  "electricity": ["Electricity"],
  "machine": ["Machines"],
  "scientist": ["Famous Scientists"],
  "artist": ["Famous Artists", "Art History"],
  "ancient": ["Ancient Civilizations"],
  "civilization": ["Ancient Civilizations"],
  "map": ["Maps & Cartography"],
  "food science": ["Food Science"],
  "architecture": ["Architecture"],
  "music": ["Music Theory"],
  "economics": ["Economics for Kids"],
  "government": ["Government & Civics"],
  "civics": ["Government & Civics"],
  "logic": ["Logic & Puzzles"],
  "puzzle": ["Logic & Puzzles"],
  "human rights": ["Human Rights"],
  "medical": ["Medical Science"],

  // IDENTITY
  "diversity": ["Diversity", "Representation Matters"],
  "culture": ["Cultural Stories"],
  "african american": ["Black Joy"],
  "black": ["Black Joy"],
  "latinx": ["Latinx Stories"],
  "hispanic": ["Latinx Stories"],
  "asian": ["Asian Stories"],
  "indigenous": ["Indigenous Stories"],
  "native american": ["Indigenous Stories"],
  "disability": ["Disability Representation"],
  "autism": ["Neurodiversity"],
  "neurodiversity": ["Neurodiversity"],
  "lgbtq": ["LGBTQ+"],
  "gender": ["Gender Expression"],
  "girl power": ["Strong Girls"],
  "empowerment": ["Empowerment"],
  "body positivity": ["Body Positivity"],
  "confidence": ["Confidence"],
  "self-acceptance": ["Self-Acceptance"],
  "immigration": ["Immigration", "First Generation"],
  "bilingual": ["Language & Bilingual"],
  "faith": ["Faith-Based"],
  "leadership": ["Leadership"],
  "role model": ["Role Models"],
  "social justice": ["Social Justice"],
  "overcoming": ["Overcoming Obstacles"],
  "heritage": ["Family Heritage"],
  "representation": ["Representation Matters"],
  "refugee": ["Refugee Stories"],
  "mixed": ["Mixed Heritage", "Biracial Identity"],
  "deaf": ["Deaf & Hard of Hearing"],
  "blind": ["Blind & Low Vision"],
  "chronic illness": ["Chronic Illness"],
  "single parent": ["Single-Parent Family"],
  "grandparent": ["Grandparent-Led Family"],
  "found family": ["Found Family"],
  "transgender": ["Trans Stories"],
  "trans": ["Trans Stories"],
  "muslim": ["Muslim Stories"],
  "jewish": ["Jewish Stories"],
  "hindu": ["Hindu Stories"],
  "sikh": ["Sikh Stories"],
  "military family": ["Military Family"],
  "intergenerational": ["Intergenerational"],
  "pride": ["Pride & Joy"],

  // NATURE
  "animal": ["Animals", "Wildlife"],
  "animals": ["Animals", "Wildlife"],
  "farm": ["Farm"],
  "zoo": ["Zoo"],
  "pet": ["Pets"],
  "wildlife": ["Wildlife"],
  "forest": ["Forest"],
  "bug": ["Bugs & Insects"],
  "insect": ["Bugs & Insects"],
  "garden": ["Gardening"],
  "camping": ["Camping"],
  "hiking": ["Hiking"],
  "national park": ["National Parks"],
  "conservation": ["Conservation", "Environment"],
  "environment": ["Environment", "Environmental Science"],
  "earth day": ["Earth Day"],
  "season": ["Seasons"],
  "water cycle": ["Water Cycle"],
  "life cycle": ["Life Cycles"],
  "ecosystem": ["Ecosystems"],
  "bird": ["Birds"],
  "arctic": ["Arctic"],
  "jungle": ["Jungle"],
  "desert": ["Desert"],
  "volcano": ["Volcanoes"],
  "rock": ["Rocks & Minerals"],
  "mineral": ["Rocks & Minerals"],
  "plant": ["Trees & Plants", "Gardening"],
  "tree": ["Trees & Plants", "Forest"],
  "fish": ["Ocean", "Ocean Life"],
  "marine": ["Ocean Life", "Marine Mammals"],
  "cat": ["Pets", "Animals"],
  "dog": ["Pets", "Animals"],
  "horse": ["Animals", "Wildlife"],
  "bear": ["Wildlife", "Forest"],
  "wolf": ["Wildlife", "Forest"],
  "whale": ["Marine Mammals", "Ocean Life"],
  "reptile": ["Reptiles"],
  "snake": ["Reptiles"],
  "lizard": ["Reptiles"],
  "frog": ["Amphibians"],
  "amphibian": ["Amphibians"],
  "tide pool": ["Tide Pools"],
  "rainforest": ["Rainforest"],
  "grassland": ["Grasslands"],
  "wetland": ["Wetlands"],
  "mountain": ["Mountains"],
  "river": ["Rivers & Lakes"],
  "lake": ["Rivers & Lakes"],
  "cave": ["Caves"],
  "mushroom": ["Fungi & Mushrooms"],
  "fungi": ["Fungi & Mushrooms"],
  "butterfly": ["Butterflies", "Pollinators"],
  "pollinator": ["Pollinators"],
  "bee": ["Beekeeping", "Pollinators"],
  "migration": ["Migration"],
  "fossil": ["Fossils"],
  "endangered": ["Endangered Species"],
  "extinct": ["Endangered Species"],
  "rewild": ["Rewilding"],
  "compost": ["Composting"],
  "stargazing": ["Stargazing"],
  "moon": ["Tides & Moon"],
  "nocturnal": ["Nocturnal Animals"],

  // SEASONAL
  "spring": ["Spring"],
  "summer": ["Summer", "Beach Day"],
  "fall": ["Fall", "Harvest"],
  "autumn": ["Fall", "Harvest"],
  "winter": ["Winter", "Snow Day"],
  "halloween": ["Halloween", "Spooky Season"],
  "thanksgiving": ["Thanksgiving"],
  "christmas": ["Christmas"],
  "hanukkah": ["Hanukkah"],
  "easter": ["Easter"],
  "valentine": ["Valentine's Day"],
  "st. patrick": ["St. Patrick's Day"],
  "fourth of july": ["Fourth of July"],
  "new year": ["New Year"],
  "lunar new year": ["Lunar New Year"],
  "ramadan": ["Ramadan"],
  "diwali": ["Diwali"],
  "birthday": ["Birthdays"],
  "beach": ["Beach Day"],
  "harvest": ["Harvest", "Harvest Festival"],
  "graduation": ["Graduation"],
  "mother's day": ["Mother's Day"],
  "father's day": ["Father's Day"],
  "back to school": ["Back to School", "First Day of School"],
  "holiday": ["Celebrations"],
  "kwanzaa": ["Kwanzaa"],
  "eid": ["Eid"],
  "passover": ["Passover"],
  "cinco de mayo": ["Cinco de Mayo"],
  "mardi gras": ["Mardi Gras"],
  "groundhog": ["Groundhog Day"],
  "presidents day": ["Presidents Day"],
  "martin luther king": ["MLK Day"],
  "veterans day": ["Veterans Day"],
  "pi day": ["Pi Day"],
  "100th day": ["100th Day of School"],
  "last day of school": ["Last Day of School"],
  "summer reading": ["Summer Reading"],
  "cozy": ["Cozy Season"],
  "spooky": ["Spooky Season"],

  // CLASSICS
  "fairy tale": ["Fairy Tale"],
  "folktale": ["Folktale"],
  "fable": ["Fable"],
  "brothers grimm": ["Brothers Grimm", "Fairy Tale"],
  "hans christian andersen": ["Hans Christian Andersen", "Fairy Tale"],
  "aesop": ["Aesop", "Fable"],
  "nursery rhyme": ["Nursery Rhymes"],
  "vintage": ["Vintage", "Golden Age"],
  "award": ["Award Winner"],
  "caldecott": ["Caldecott", "Award Winner"],
  "newbery": ["Newbery", "Award Winner"],
  "classic": ["Literary Classic", "Timeless"],
  "traditional": ["Traditional Story"],
  "moral": ["Moral Lesson"],
  "epic": ["Epic Tale"],
  "historical fiction": ["Historical Fiction"],
  "adapted": ["Adapted Classic"],
  "illustrated": ["Illustrated Classic"],
  "poetry": ["Poetry"],
  "public domain": ["Public Domain"],
  "character": ["Character Driven"],
  "trickster": ["Trickster Tale"],
  "creation story": ["Creation Story"],
  "hero's journey": ["Hero's Journey"],
  "coming of age classic": ["Coming-of-Age Classic"],
  "read aloud": ["Read-Aloud Favorite"],
  "beloved": ["Beloved Character"],
  "retold": ["Retold Classic"],
  "picture book": ["Picture Book Classic"],
  "bedtime classic": ["Bedtime Classic"],
  "early reader": ["Early Reader Classic"],
  "series": ["Series Classic", "Classic Series Starter"],
};

// ─── SCORING ENGINE ───────────────────────────────────────────────────────────

export interface TagSuggestion {
  tag: string;
  category: BinCategory;
  score: number;
}

export interface AutoTagResult {
  suggestedTags: string[];           // top 3-4 tags
  suggestedCategory: BinCategory;    // primary bin category
  categoryScores: Record<BinCategory, number>;
  allMatches: TagSuggestion[];
}

/** Build a flat reverse map: tag name → category */
const TAG_TO_CATEGORY: Record<string, BinCategory> = {};
for (const cat of TAG_TAXONOMY) {
  for (const tag of cat.tags) {
    TAG_TO_CATEGORY[tag] = cat.id;
  }
}

/** Score Open Library subjects against the BookNest tag taxonomy */
export function autoAssignTags(subjects: string[], title = "", author = ""): AutoTagResult {
  const tagScores: Record<string, number> = {};
  const categoryScores: Record<BinCategory, number> = {
    ADVENTURE: 0, HUMOR: 0, LIFE: 0, LEARN: 0,
    IDENTITY: 0, NATURE: 0, SEASONAL: 0, CLASSICS: 0,
  };

  // Combine all text to search
  const allText = [...subjects, title, author]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s&'().]/g, " ");

  // Score each keyword match
  for (const [keyword, tags] of Object.entries(SUBJECT_TO_TAG)) {
    if (allText.includes(keyword.toLowerCase())) {
      for (const tag of tags) {
        tagScores[tag] = (tagScores[tag] || 0) + 1;
        const cat = TAG_TO_CATEGORY[tag];
        if (cat) categoryScores[cat] += 1;
      }
    }
  }

  // Sort tags by score descending
  const allMatches: TagSuggestion[] = Object.entries(tagScores)
    .map(([tag, score]) => ({ tag, category: TAG_TO_CATEGORY[tag], score }))
    .filter(m => m.category)
    .sort((a, b) => b.score - a.score);

  // Pick top 3-4 tags, ensuring at least 2 different categories if possible
  const selected: TagSuggestion[] = [];
  const usedCategories = new Set<BinCategory>();

  // First pass: pick highest-scoring tags, max 2 per category
  const catCount: Record<string, number> = {};
  for (const match of allMatches) {
    if (selected.length >= 4) break;
    const cc = catCount[match.category] || 0;
    if (cc < 2) {
      selected.push(match);
      catCount[match.category] = cc + 1;
      usedCategories.add(match.category);
    }
  }

  // If we have fewer than 3 tags, fill with next best regardless of category
  if (selected.length < 3) {
    for (const match of allMatches) {
      if (selected.length >= 3) break;
      if (!selected.find(s => s.tag === match.tag)) {
        selected.push(match);
      }
    }
  }

  // Determine primary bin category (highest score)
  const suggestedCategory = (Object.entries(categoryScores)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "LIFE") as BinCategory;

  return {
    suggestedTags: selected.map(s => s.tag),
    suggestedCategory,
    categoryScores,
    allMatches,
  };
}

/** Get the category object for a given category ID */
export function getCategoryById(id: BinCategory): TagCategory {
  return TAG_TAXONOMY.find(c => c.id === id) || TAG_TAXONOMY[2];
}

/** Get the category for a given tag name */
export function getCategoryForTag(tag: string): TagCategory | undefined {
  return TAG_TAXONOMY.find(c => c.tags.includes(tag));
}

/** Build bin name from age group + category */
export function buildBinName(ageGroup: string, category: BinCategory): string {
  const prefixMap: Record<string, string> = {
    "Hatchlings (0-2)": "HATC",
    "Fledglings (3-5)": "FLED",
    "Soarers (6-8)": "SOAR",
    "Sky Readers (9-12)": "SKY",
  };
  const prefix = prefixMap[ageGroup] || "FLED";
  const catName = category.replace("_", "");
  return `${prefix}-${catName}-01`;
}