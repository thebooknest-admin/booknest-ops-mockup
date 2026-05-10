import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchGoogleBooks(isbn) {
  const cleanIsbn = isbn.replace(/[^0-9X]/gi, "");

  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`
  );

  const data = await res.json();

  if (!data.items || data.items.length === 0) {
    return null;
  }

  return data.items[0].volumeInfo;
}

async function fetchOpenLibrary(isbn) {
  try {
    const cleanIsbn = isbn.replace(/[^0-9X]/gi, "");

    const res = await fetch(
      `https://openlibrary.org/isbn/${cleanIsbn}.json`
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();

    return {
      title: data.title,
      authors: undefined,
      description:
        typeof data.description === "string"
          ? data.description
          : data.description?.value,
      categories: data.subjects,
      pageCount: data.number_of_pages,
      publisher: data.publishers?.[0],
      publishedDate: data.publish_date,
    };
  } catch (error) {
    console.warn(`Open Library failed for ISBN ${isbn}: ${error.message}`);
    return null;
  }
}

async function run() {
  const { data: books, error } = await supabase
    .from("book_titles")
    .select("id, isbn, title")
    .eq("needs_reclassification", true)
.not("isbn", "is", null)
.is("metadata_fetched_at", null)
.limit(100);

  if (error) {
    console.error(error);
    return;
  }

  for (const book of books) {
  console.log(`\nFetching metadata for: ${book.title} (${book.isbn})`);

 const metadata =
  (await fetchGoogleBooks(book.isbn)) ||
  (await fetchOpenLibrary(book.isbn));

  if (!metadata) {
  const { error: updateError } = await supabase
    .from("book_titles")
    .update({
      metadata_source: "not_found",
      metadata_fetched_at: new Date().toISOString(),
    })
    .eq("id", book.id);

  if (updateError) {
    console.error("Failed to mark not_found:", updateError);
    continue;
  }

  console.log("No metadata found. Marked as not_found.");
  continue;
}

  const updatePayload = {
  description: metadata.description || null,
  subjects: metadata.categories || [],
  page_count: metadata.pageCount || null,
  publisher: metadata.publisher || null,
  published_date: metadata.publishedDate || null,
  metadata_source: "google_books_openlibrary",
  metadata_fetched_at: new Date().toISOString(),
};

const { error: updateError } = await supabase
  .from("book_titles")
  .update(updatePayload)
  .eq("id", book.id);

if (updateError) {
  console.error("Update failed:", updateError);
  continue;
}

console.log("Metadata updated successfully.");
}
}

run();