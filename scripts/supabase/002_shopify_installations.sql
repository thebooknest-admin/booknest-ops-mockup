-- Store offline Shopify Admin API tokens captured by the app install flow.
create table if not exists public.shopify_installations (
  shop_domain text primary key,
  access_token text not null,
  scope text,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
