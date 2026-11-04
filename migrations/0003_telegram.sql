-- Additive Telegram Mini App fields. Existing products and web orders stay as they are.

alter table orders add column if not exists source text not null default 'web';
alter table orders add column if not exists telegram_user_id bigint;
alter table orders add column if not exists telegram_chat_id bigint;

create index if not exists orders_source_idx on orders (source);

create table if not exists telegram_customers (
  user_id bigint primary key,
  chat_id bigint not null,
  first_name text,
  username text,
  last_order_at timestamptz not null default now()
);
