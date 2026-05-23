-- Allow terminal/removed copies to leave the label queue without pretending a label was printed.
alter table public.book_copies
  drop constraint if exists book_copies_label_status_chk;

alter table public.book_copies
  add constraint book_copies_label_status_chk
  check (label_status in ('pending', 'printed', 'not_required'));

update public.book_copies
set
  label_status = 'not_required',
  updated_at = now()
where
  label_status = 'pending'
  and status in ('donated_lfl', 'lost', 'withdrawn', 'damaged', 'retired');
