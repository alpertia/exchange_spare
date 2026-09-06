-- 2026-09-04 — Fix missing foreign keys causing PGRST200 errors on admin pages
-- Root cause: these FKs were either never created or dropped silently during
-- a past schema change (e.g. products table recreation). No prior migration
-- history exists for this project, so exact origin is unknown.

alter table conversations
  add constraint conversations_product_id_fkey
  foreign key (product_id) references products(id) on delete set null;

alter table messages
  add constraint messages_sender_company_id_fkey
  foreign key (sender_company_id) references companies(id) on delete set null;

alter table deposit_applications
  add constraint deposit_applications_company_id_fkey
  foreign key (company_id) references companies(id) on delete set null;
