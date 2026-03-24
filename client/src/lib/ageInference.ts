// BookNest Ops — Age Group Inference Engine
// Analyzes Open Library subjects, page count, publisher, and title keywords
// to recommend one of the four BookNest nest tiers with a confidence score and reasoning.

export type AgeGroupKey = "hatchlings" | "fledglings" | "soarers" | "skyreaders";

export interface AgeGroupInfo {
  key: AgeGroupKey;
  label: string;
  range: string;
  emoji: string;
  displayLabel: string; // matches the AGE_GROUPS array in ReceivePage
}

export const AGE_GROUP_INFO: AgeGroupInfo[] = [
  { key: "hatchlings",  label: "Hatchlings",  range: "0–2",  emoji: "🐣", displayLabel: "Hatchlings (0-2)"  },
  { key: "fledglings",  label: "Fledglings",  range: "3–5",  emoji: "🐦", displayLabel: "Fledglings (3-5)"  },
  { key: "soarers",     label: "Soarers",     range: "6–8",  emoji: "🦅", displayLabel: "Soarers (6-8)"     },
  { key: "skyreaders",  label: "Sky Readers", range: "9–12", emoji: "🌟", displayLabel: "Sky Readers (9-12)" },
];

export interface AgeInferenceResult {
  recommended: AgeGroupKey;
  confidence: "high" | "medium" | "low";
  confidencePct: number; // 0-100
  reasons: string[];      // human-readable bullet points explaining the recommendation
  scores: Record<AgeGroupKey, number>;
}

// ─── Signal maps ─────────────────────────────────────────────────────────────

// Subject keyword → age group scores (additive)
const SUBJECT_SIGNALS: Array<{ pattern: RegExp; scores: Partial<Record<AgeGroupKey, number>> }> = [
  // Strong board-book / baby signals
  { pattern: /board book|baby|toddler|infant|nursery rhyme|peek.?a.?boo|bath time|bedtime story/i,
    scores: { hatchlings: 10 } },
  { pattern: /picture book|counting|alphabet|abc|shapes|colors|colours/i,
    scores: { hatchlings: 6, fledglings: 4 } },

  // Early reader / picture book signals
  { pattern: /early reader|beginning reader|easy reader|emergent reader|kindergarten|preschool|pre.?school/i,
    scores: { fledglings: 10 } },
  { pattern: /fairy tale|folk tale|folktale|fable|nursery|rhyme|poetry for children/i,
    scores: { fledglings: 6, hatchlings: 3 } },
  { pattern: /friendship|sharing|feelings|emotions|kindness|manners|school|first day/i,
    scores: { fledglings: 5, soarers: 2 } },

  // Middle-grade signals
  { pattern: /middle grade|middle.?grade|chapter book|juvenile fiction|children.s fiction/i,
    scores: { soarers: 8, fledglings: 2 } },
  { pattern: /adventure|quest|mystery|detective|magic|fantasy|dragon|wizard/i,
    scores: { soarers: 5, skyreaders: 3 } },
  { pattern: /school story|friendship story|growing up|coming.of.age/i,
    scores: { soarers: 6, skyreaders: 3 } },

  // Young adult / upper MG signals
  { pattern: /young adult|ya fiction|teen fiction|dystopian|dystopia/i,
    scores: { skyreaders: 10 } },
  { pattern: /romance|war|death|grief|mental health|identity|lgbtq|sexuality/i,
    scores: { skyreaders: 8, soarers: 2 } },
  { pattern: /science fiction|sci.?fi|apocalyptic|post.?apocalyptic/i,
    scores: { skyreaders: 6, soarers: 4 } },
  { pattern: /novel|fiction|short stories|anthology/i,
    scores: { skyreaders: 3, soarers: 3 } },

  // Nonfiction / educational signals
  { pattern: /nonfiction|non.?fiction|biography|history|science|nature|animals|geography/i,
    scores: { soarers: 4, skyreaders: 3, fledglings: 2 } },
  { pattern: /stem|coding|engineering|math|mathematics/i,
    scores: { soarers: 5, skyreaders: 4 } },

  // Classic / award signals
  { pattern: /newbery|caldecott|award.?winner|classic|timeless/i,
    scores: { soarers: 4, skyreaders: 3, fledglings: 2 } },

  // Graphic novel
  { pattern: /graphic novel|comic|manga/i,
    scores: { soarers: 6, skyreaders: 4 } },
];

// Publisher name → strong age signal
const PUBLISHER_SIGNALS: Array<{ pattern: RegExp; scores: Partial<Record<AgeGroupKey, number>> }> = [
  { pattern: /board book|little simon|little golden|golden books|priddy|usborne/i,
    scores: { hatchlings: 8, fledglings: 3 } },
  { pattern: /scholastic|random house children|harper children|houghton mifflin|candlewick|roaring brook/i,
    scores: { fledglings: 4, soarers: 5 } },
  { pattern: /viking children|farrar straus|knopf books for young|greenwillow|hyperion books for children/i,
    scores: { soarers: 5, skyreaders: 4 } },
  { pattern: /razorbill|push|flux|margaret k. mcelderry|simon pulse|little brown ya/i,
    scores: { skyreaders: 8 } },
];

// Title keyword signals
const TITLE_SIGNALS: Array<{ pattern: RegExp; scores: Partial<Record<AgeGroupKey, number>> }> = [
  { pattern: /baby|toddler|little one|goodnight|peek/i,
    scores: { hatchlings: 8 } },
  { pattern: /my first|first words|abc|123|colors|shapes/i,
    scores: { hatchlings: 6, fledglings: 3 } },
  { pattern: /diary of|wimpy kid|big nate|dork diaries|captain underpants|dog man/i,
    scores: { soarers: 9 } },
  { pattern: /hunger games|harry potter|percy jackson|divergent|maze runner|shadow and bone/i,
    scores: { skyreaders: 9 } },
  { pattern: /magic tree house|geronimo stilton|boxcar children|hardy boys|nancy drew/i,
    scores: { soarers: 8 } },
  { pattern: /berenstain|clifford|curious george|pete the cat|elephant.piggie|fly guy/i,
    scores: { fledglings: 9 } },
  { pattern: /very hungry caterpillar|where the wild things|goodnight moon|giving tree/i,
    scores: { hatchlings: 7, fledglings: 5 } },
];

// Page count heuristics
function pageCountScores(pages: string): Partial<Record<AgeGroupKey, number>> {
  const n = parseInt(pages, 10);
  if (isNaN(n)) return {};
  if (n <= 32)  return { hatchlings: 7, fledglings: 4 };
  if (n <= 64)  return { fledglings: 7, hatchlings: 3, soarers: 2 };
  if (n <= 150) return { fledglings: 4, soarers: 6 };
  if (n <= 300) return { soarers: 7, skyreaders: 4 };
  return { skyreaders: 8, soarers: 3 };
}

// ─── Inference function ───────────────────────────────────────────────────────

export function inferAgeGroup(params: {
  subjects: string[];
  title: string;
  author: string;
  publisher: string;
  pages: string;
}): AgeInferenceResult {
  const scores: Record<AgeGroupKey, number> = {
    hatchlings: 0, fledglings: 0, soarers: 0, skyreaders: 0,
  };
  const reasons: string[] = [];

  const allSubjectText = params.subjects.join(" ").toLowerCase();
  const titleText = params.title.toLowerCase();
  const publisherText = params.publisher.toLowerCase();

  // --- Subject signals ---
  for (const sig of SUBJECT_SIGNALS) {
    if (sig.pattern.test(allSubjectText)) {
      for (const [k, v] of Object.entries(sig.scores)) {
        scores[k as AgeGroupKey] += v as number;
      }
    }
  }

  // --- Publisher signals ---
  for (const sig of PUBLISHER_SIGNALS) {
    if (sig.pattern.test(publisherText)) {
      for (const [k, v] of Object.entries(sig.scores)) {
        scores[k as AgeGroupKey] += v as number;
      }
    }
  }

  // --- Title signals ---
  for (const sig of TITLE_SIGNALS) {
    if (sig.pattern.test(titleText)) {
      for (const [k, v] of Object.entries(sig.scores)) {
        scores[k as AgeGroupKey] += v as number;
      }
    }
  }

  // --- Page count ---
  const pgScores = pageCountScores(params.pages);
  for (const [k, v] of Object.entries(pgScores)) {
    scores[k as AgeGroupKey] += v as number;
  }

  // --- Determine winner ---
  const entries = Object.entries(scores) as [AgeGroupKey, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const [topKey, topScore] = entries[0];
  const [, secondScore] = entries[1] ?? [null, 0];
  const totalScore = entries.reduce((s, [, v]) => s + v, 0) || 1;

  // Confidence: gap between top and second, and total signal strength
  const gap = topScore - secondScore;
  const pct = Math.round((topScore / totalScore) * 100);
  let confidence: "high" | "medium" | "low";
  if (topScore >= 10 && gap >= 5) confidence = "high";
  else if (topScore >= 5 || gap >= 3) confidence = "medium";
  else confidence = "low";

  // --- Build human-readable reasons ---
  const info = AGE_GROUP_INFO.find(g => g.key === topKey)!;

  // Subject-based reasons
  const subjectMatches: string[] = [];
  const subjectReasonMap: Array<{ pattern: RegExp; label: string; keys: AgeGroupKey[] }> = [
    { pattern: /board book|baby|toddler/i, label: "board book / baby subjects", keys: ["hatchlings"] },
    { pattern: /picture book|alphabet|counting/i, label: "picture book subjects", keys: ["hatchlings", "fledglings"] },
    { pattern: /early reader|kindergarten|preschool/i, label: "early reader subjects", keys: ["fledglings"] },
    { pattern: /middle grade|chapter book|juvenile fiction/i, label: "middle-grade subjects", keys: ["soarers"] },
    { pattern: /young adult|ya fiction|dystopian/i, label: "young adult subjects", keys: ["skyreaders"] },
    { pattern: /coming.of.age|teen/i, label: "teen / coming-of-age subjects", keys: ["skyreaders"] },
    { pattern: /adventure|fantasy|mystery/i, label: "adventure / fantasy subjects", keys: ["soarers", "skyreaders"] },
    { pattern: /science fiction|dystopia/i, label: "science fiction subjects", keys: ["skyreaders", "soarers"] },
  ];
  for (const r of subjectReasonMap) {
    if (r.pattern.test(allSubjectText) && r.keys.includes(topKey)) {
      subjectMatches.push(r.label);
    }
  }
  if (subjectMatches.length > 0) {
    reasons.push(`Open Library subjects include ${subjectMatches.slice(0, 2).join(" and ")}`);
  }

  // Page count reason
  const pageN = parseInt(params.pages, 10);
  if (!isNaN(pageN)) {
    if (pageN <= 32 && topKey === "hatchlings") reasons.push(`${pageN} pages — typical for board/picture books`);
    else if (pageN <= 64 && topKey === "fledglings") reasons.push(`${pageN} pages — typical for early readers`);
    else if (pageN <= 150 && topKey === "soarers") reasons.push(`${pageN} pages — typical for chapter books`);
    else if (pageN > 150 && topKey === "skyreaders") reasons.push(`${pageN} pages — typical for middle-grade/YA novels`);
    else if (!isNaN(pageN)) reasons.push(`${pageN} pages noted`);
  }

  // Publisher reason
  const publisherReasonMap: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /scholastic/i, label: "Scholastic (strong children's publisher)" },
    { pattern: /razorbill|simon pulse/i, label: "YA-focused imprint" },
    { pattern: /little simon|golden books|priddy/i, label: "board book / early childhood publisher" },
    { pattern: /random house children|harper children/i, label: "major children's publisher" },
  ];
  for (const r of publisherReasonMap) {
    if (r.pattern.test(publisherText)) {
      reasons.push(`Publisher: ${r.label}`);
      break;
    }
  }

  // Title reason
  const titleReasonMap: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /diary of|wimpy kid|big nate|dork diaries/i, label: "Recognized middle-grade series title" },
    { pattern: /hunger games|percy jackson|harry potter|divergent/i, label: "Recognized upper MG / YA series title" },
    { pattern: /magic tree house|boxcar children|hardy boys|nancy drew/i, label: "Recognized chapter-book series title" },
    { pattern: /berenstain|clifford|curious george|pete the cat/i, label: "Recognized early reader series title" },
  ];
  for (const r of titleReasonMap) {
    if (r.pattern.test(titleText)) {
      reasons.push(r.label);
      break;
    }
  }

  // Fallback reason
  if (reasons.length === 0) {
    reasons.push(`Best match based on available metadata (${info.emoji} ${info.label}, ages ${info.range})`);
  }

  return {
    recommended: topKey,
    confidence,
    confidencePct: pct,
    reasons,
    scores,
  };
}
