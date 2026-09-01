-- The library's status column, narrowed to the three values the product can write.
--
-- `LibraryStatus` in `core/src/domain/types.ts` carried four from `0001_init.sql` until the
-- ruling in that file, and nothing on either platform ever wrote `paused`: not a screen, not a control,
-- not either TV Time importer, which map archived to `dropped` and up-to-date to
-- `completed` and have no source field that could mean *on hold*. The decision about what a
-- pause means to somebody was taken and the answer was no; that type's note has the whole
-- argument and the one thing that would reopen it.
--
-- Narrowed here as well as there because a check constraint is the contract every client of
-- this database shares. Leaving it at four while the type says three would make the type a
-- claim about a range the server still accepts — which is the direction of every silent
-- defect: the code believing something the data does not have to honour.
--
-- The update is belt and braces. No row can hold 'paused', because no writer ever existed to
-- put one there; the line is here so that if one somehow does, this migration corrects it
-- rather than failing to apply. `dropped` rather than `watching` because that is the mapping
-- that changes nothing a person would see: both were excluded from Up Next and the calendar
-- and both were skipped by `syncSeriesStatus`, so only `shelfOf`'s answer moves. Mapping to
-- `watching` would push such a show back into Up Next, which is a behaviour change.
--
-- The constraint is named rather than left to Postgres, so the drop below is the one 0001
-- created — Postgres names an inline table constraint `library_status_check`, which is what
-- this re-adds under the same name.

update library set status = 'dropped' where status = 'paused';

alter table library drop constraint if exists library_status_check;

alter table library
  add constraint library_status_check check (status in ('watching', 'completed', 'dropped'));
