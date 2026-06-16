-- Add optional shelving sections for Soarers and Sky Readers.
alter table public.book_copies
  add column if not exists section text;

alter table public.book_copies
  drop constraint if exists book_copies_section_chk;

alter table public.book_copies
  add constraint book_copies_section_chk
  check (section is null or section ~ '^[A-Z]{1,3}$');

create index if not exists book_copies_section_pick_idx
  on public.book_copies (age_group, bin_id, section)
  where status = 'in_house' and section is not null;
