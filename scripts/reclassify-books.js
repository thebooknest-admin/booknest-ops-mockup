import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function loadAllowedTags() {
  const { data, error } = await supabase
    .from("book_sorting_tags")
    .select("bin_theme, tag")
    .order("bin_theme")
    .order("tag");

  if (error) {
    throw error;
  }

  return data;
}

async function getTagIds(tagNames) {
  const { data, error } = await supabase
    .from("book_sorting_tags")
    .select("id, tag")
    .in("tag", tagNames);

  if (error) {
    throw error;
  }

  return data.map((t) => t.id);
}

async function run() {
    const allowedTags = await loadAllowedTags();
  const { data: books, error } = await supabase
    .from("book_titles")
    .select(`
      id,
      title,
      author,
      description,
      subjects,
      page_count
    `)
    .eq("needs_reclassification", true)
    .limit(500);

  if (error) {
    console.error(error);
    return;
  }

  if (!books.length) {
    console.log("No books found.");
    return;
  }

 for (const book of books) {

console.log(`\nClassifying: ${book.title}`);

  const prompt = `
Classify this children's book.

Return ONLY valid JSON.

AVAILABLE THEMES:
- Adventure
- Laughs & Chaos
- Heart & Home
- Wonder & Imagination
- Wild & Wonderful
- Discovery Den
- Legends & Long Ago
- Seasons & Celebrations

AVAILABLE AGE TIERS:
- Hatchlings
- Fledglings
- Soarers
- Sky Readers
- 13+

BOOK:
Title: ${book.title}
Author: ${book.author}

Description:
${book.description || "None"}

Subjects:
${JSON.stringify(book.subjects || [])}

Page Count:
${book.page_count || "Unknown"}

ALLOWED TAGS:
${allowedTags
  .map((t) => `${t.bin_theme}: ${t.tag}`)
  .join("\n")}

IMPORTANT RULES:
- Only use tags from the ALLOWED TAGS list
- Do not invent tags
- Choose 3-5 tags maximum
- Tags should strongly match the book
- Theme must match the chosen tags
- Return ONLY the tag names, not "Theme: Tag" format.

Return format:
{
  "age_tier": "",
  "theme": "",
  "tags": []
}
`;

  const response = await openai.chat.completions.create({
  model: "gpt-4.1-mini",
  messages: [
    {
      role: "system",
      content:
        "You are a children's book classifier. Return only valid JSON. Do not use markdown.",
    },
    {
      role: "user",
      content: prompt,
    },
  ],
  response_format: { type: "json_object" },
  temperature: 0.2,
});

const classification = JSON.parse(response.choices[0].message.content);

console.log("\nCLASSIFICATION:\n");
console.log(classification);

const tagIds = await getTagIds(classification.tags);

console.log("\nTAG IDS:\n");
console.log(tagIds);

const { error: updateError } = await supabase
  .from("book_titles")
  .update({
  suggested_age_tier: classification.age_tier || null,
  bin_theme: classification.theme || "Adventure",
  tag_ids: tagIds || [],
  classification_version: "v2_taxonomy_2026_05",
  needs_reclassification: false,
})
  .eq("id", book.id);

if (updateError) {
  console.error("Failed to update book:", updateError);
  return;
}

console.log("\nBook updated successfully.");
}
await new Promise((resolve) => setTimeout(resolve, 1000));
}
run();
