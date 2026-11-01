-- Catalog, orders, and shop settings for mr. Puff.
-- Seed runs once. Later edits in the admin are not overwritten on deploy.

create table if not exists products (
  id serial primary key,
  brand text not null,
  model text not null,
  flavor text not null,
  flavor_types text not null,
  price integer not null check (price >= 0),
  image_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists products_identity_idx on products (brand, model, flavor);
create index if not exists products_active_sort_idx on products (active, sort_order);

create table if not exists orders (
  id serial primary key,
  customer_name text not null,
  phone text not null,
  comment text not null default '',
  total integer not null check (total >= 0),
  items jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists shop_settings (
  key text primary key,
  value text not null
);

insert into shop_settings (key, value)
values ('whatsapp_phone', '')
on conflict (key) do nothing;

insert into products (brand, model, flavor, flavor_types, price, image_url, active, sort_order)
values
  ('PLONQ', 'MAX S 8000', 'Киви Лайм', 'fruit', 11000, '/catalog/plonq-max-s.jpg', true, 1),
  ('PLONQ', 'MAX S 8000', 'Сладкая Мята', 'mint,sweet', 11000, '/catalog/plonq-max-s.jpg', true, 2),
  ('PLONQ', 'MAX S 8000', 'Ежевика Мята', 'berries,mint', 11000, '/catalog/plonq-max-s.jpg', true, 3),
  ('PLONQ', 'MAX S 8000', 'Ананас Лимон', 'fruit', 11000, '/catalog/plonq-max-s.jpg', true, 4),
  ('PLONQ', 'MAX S 8000', 'Черника Лимон', 'berries,fruit', 11000, '/catalog/plonq-max-s.jpg', true, 5),
  ('PLONQ', 'MAX S 8000', 'Зелёное Яблоко', 'fruit', 11000, '/catalog/plonq-max-s.jpg', true, 6),
  ('PLONQ', 'MAX S 8000', 'Жасмин Малина', 'berries,other', 11000, '/catalog/plonq-max-s.jpg', true, 7),
  ('PLONQ', 'MAX S 8000', 'Лимонный Пирог', 'fruit,sweet', 11000, '/catalog/plonq-max-s.jpg', true, 8),
  ('PLONQ', 'MAX S 8000', 'Клюквенный Морс', 'berries', 11000, '/catalog/plonq-max-s.jpg', true, 9),
  ('FASTA', '40.000', 'Арбуз', 'fruit', 12500, '/catalog/fasta-40.jpg', true, 10),
  ('FASTA', '40.000', 'Fcuking Fab', 'sweet,other', 12500, '/catalog/fasta-40.jpg', true, 11),
  ('FASTA', '40.000', 'Белый Виноград', 'fruit', 12500, '/catalog/fasta-40.jpg', true, 12),
  ('FASTA', '40.000', 'Клубничный Шот', 'sweet', 12500, '/catalog/fasta-40.jpg', true, 13),
  ('FASTA', '40.000', 'Прохладная Мята', 'mint', 12500, '/catalog/fasta-40.jpg', true, 14),
  ('FASTA', '40.000', 'Идеальный Персик', 'fruit', 12500, '/catalog/fasta-40.jpg', true, 15),
  ('ELF BAR', 'GH 23.000 Holiday', 'Ананас', 'fruit', 13000, '/catalog/elf-gh-23.jpg', true, 16),
  ('ELF BAR', 'GH 23.000 Holiday', 'Вишнёвый Сок', 'berries', 13000, '/catalog/elf-gh-23.jpg', true, 17),
  ('ELF BAR', 'GH 23.000 Holiday', 'Сочное Помело', 'fruit', 13000, '/catalog/elf-gh-23.jpg', true, 18),
  ('ELF BAR', 'GH 23.000 Holiday', 'Яблоко Аксу лёд', 'fruit', 13000, '/catalog/elf-gh-23.jpg', true, 19),
  ('ELF BAR', 'GH 23.000 Holiday', 'Свежий Лимонад', 'fruit,soda', 13000, '/catalog/elf-gh-23.jpg', true, 20),
  ('ELF BAR', 'GH 23.000 Holiday', 'Арбузная Газировка', 'fruit,soda', 13000, '/catalog/elf-gh-23.jpg', true, 21),
  ('ELF BAR', 'GH 23.000 Holiday', 'Апельсиновая Газировка', 'fruit,soda', 13000, '/catalog/elf-gh-23.jpg', true, 22),
  ('ELF BAR', 'GH 23.000 Holiday', 'Кислая Грушевая Газировка', 'fruit,soda', 13000, '/catalog/elf-gh-23.jpg', true, 23),
  ('ELF BAR', 'GH 23.000 Holiday', 'Чёрный Виноград Газировка', 'fruit,soda', 13000, '/catalog/elf-gh-23.jpg', true, 24),
  ('ELF BAR', 'GH 23.000 Holiday', 'Кислая Персиковая Газировка', 'fruit,soda', 13000, '/catalog/elf-gh-23.jpg', true, 25),
  ('ELF BAR', 'GH 33.000 PRO', 'Лимон Лайм', 'fruit', 13500, '/catalog/elf-gh-33.jpg', true, 26),
  ('ELF BAR', 'GH 33.000 PRO', 'Персиковый сок', 'fruit', 13500, '/catalog/elf-gh-33.jpg', true, 27),
  ('ELF BAR', 'GH 33.000 PRO', 'Яблоко Киви лёд', 'fruit', 13500, '/catalog/elf-gh-33.jpg', true, 28),
  ('ELF BAR', 'GH 33.000 PRO', 'Кислая Клубника Питайя', 'berries,fruit', 13500, '/catalog/elf-gh-33.jpg', true, 29),
  ('ELF BAR', 'GH 33.000 PRO', 'Малина Грейпфрут Лимон', 'berries,fruit', 13500, '/catalog/elf-gh-33.jpg', true, 30),
  ('ELF BAR', 'GH 33.000 PRO', 'Грейпфрут Маракуйя Гуава', 'fruit', 13500, '/catalog/elf-gh-33.jpg', true, 31),
  ('ELF BAR', 'MoonNight 40.000', 'Гранат', 'fruit', 14000, '/catalog/elf-moon.jpg', true, 32),
  ('WAKA', 'LIGHT 8000', 'Микс Ягод', 'berries', 10500, '/catalog/waka-light.jpg', true, 33),
  ('WAKA', 'LIGHT 8000', 'Манго лёд', 'fruit', 10500, '/catalog/waka-light.jpg', true, 34),
  ('WAKA', 'LIGHT 8000', 'Лимон Лайм', 'fruit', 10500, '/catalog/waka-light.jpg', true, 35),
  ('WAKA', 'LIGHT 8000', 'Виноград лёд', 'fruit', 10500, '/catalog/waka-light.jpg', true, 36),
  ('WAKA', 'LIGHT 8000', 'Ананас Лимон', 'fruit', 10500, '/catalog/waka-light.jpg', true, 37),
  ('WAKA', 'LIGHT 8000', 'Клубника Арбуз', 'berries,fruit', 10500, '/catalog/waka-light.jpg', true, 38),
  ('WAKA', 'LIGHT 8000', 'Прохладная Мята', 'mint', 10500, '/catalog/waka-light.jpg', true, 39),
  ('WAKA', 'LIGHT 8000', 'Черника Малина Лимон', 'berries,fruit', 10500, '/catalog/waka-light.jpg', true, 40),
  ('WAKA', 'LIGHT 8000', 'Морс Чёрная Смородина Ягоды', 'berries', 10500, '/catalog/waka-light.jpg', true, 41),
  ('WAKA', 'PA 10.000 PRO', 'Вишня', 'berries', 12500, '/catalog/waka-pa.jpg', true, 42),
  ('WAKA', 'PA 10.000 PRO', 'Манго лёд', 'fruit', 12500, '/catalog/waka-pa.jpg', true, 43),
  ('WAKA', 'PA 10.000 PRO', 'Свежая Мята', 'mint', 12500, '/catalog/waka-pa.jpg', true, 44),
  ('WAKA', 'PA 10.000 PRO', 'Черника Мята', 'berries,mint', 12500, '/catalog/waka-pa.jpg', true, 45),
  ('WAKA', 'PA 10.000 PRO', 'Тройная Ягода', 'berries', 12500, '/catalog/waka-pa.jpg', true, 46),
  ('WAKA', 'PA 10.000 PRO', 'Кислое Яблоко', 'fruit', 12500, '/catalog/waka-pa.jpg', true, 47),
  ('WAKA', 'PA 10.000 PRO', 'Клубника Киви', 'berries,fruit', 12500, '/catalog/waka-pa.jpg', true, 48),
  ('WAKA', 'PA 10.000 PRO', 'Клубника Арбуз', 'berries,fruit', 12500, '/catalog/waka-pa.jpg', true, 49),
  ('WAKA', 'PA 10.000 PRO', 'Киви Маракуйя Гуава', 'fruit', 12500, '/catalog/waka-pa.jpg', true, 50),
  ('WAKA', 'PA 10.000 PRO', 'Черника Малина Лимон', 'berries,fruit', 12500, '/catalog/waka-pa.jpg', true, 51),
  ('WAKA', 'PA 10.000 PRO', 'Клубника Малина Вишня', 'berries', 12500, '/catalog/waka-pa.jpg', true, 52),
  ('WAKA', 'SoPro 20.000', 'Мята', 'mint', 14000, '/catalog/waka-sopro.jpg', true, 53),
  ('WAKA', 'SoPro 20.000', 'Арбуз', 'fruit', 14000, '/catalog/waka-sopro.jpg', true, 54),
  ('WAKA', 'SoPro 20.000', 'Вишня', 'berries', 14000, '/catalog/waka-sopro.jpg', true, 55),
  ('WAKA', 'SoPro 20.000', 'Арбуз Мята', 'mint,fruit', 14000, '/catalog/waka-sopro.jpg', true, 56),
  ('WAKA', 'SoPro 20.000', 'Арбуз Вишня', 'berries,fruit', 14000, '/catalog/waka-sopro.jpg', true, 57),
  ('WAKA', 'SoPro 20.000', 'Манго Ягоды', 'berries,fruit', 14000, '/catalog/waka-sopro.jpg', true, 58),
  ('WAKA', 'SoPro 20.000', 'Ледяной Лайм', 'fruit', 14000, '/catalog/waka-sopro.jpg', true, 59),
  ('WAKA', 'SoPro 20.000', 'Тройная Ягода', 'berries', 14000, '/catalog/waka-sopro.jpg', true, 60),
  ('WAKA', 'SoPro 20.000', 'Персик Малина', 'berries,fruit', 14000, '/catalog/waka-sopro.jpg', true, 61),
  ('WAKA', 'SoPro 20.000', 'Ледяной Ментол', 'mint', 14000, '/catalog/waka-sopro.jpg', true, 62),
  ('WAKA', 'SoPro 20.000', 'Малиновая Кола', 'berries,soda', 14000, '/catalog/waka-sopro.jpg', true, 63),
  ('WAKA', 'SoPro 20.000', 'Сакура Виноград', 'fruit,other', 14000, '/catalog/waka-sopro.jpg', true, 64),
  ('WAKA', 'SoPro 20.000', 'Клубника Малина', 'berries', 14000, '/catalog/waka-sopro.jpg', true, 65),
  ('WAKA', 'SoPro 20.000', 'Смузи Персик Лимон', 'fruit,sweet', 14000, '/catalog/waka-sopro.jpg', true, 66),
  ('WAKA', 'SoPro 20.000', 'Киви Маракуйя Гуава', 'fruit', 14000, '/catalog/waka-sopro.jpg', true, 67),
  ('WAKA', 'SoPro 20.000', 'Черника Вишня Клюква', 'berries', 14000, '/catalog/waka-sopro.jpg', true, 68),
  ('WAKA', 'SoPro 20.000', 'Черника Малина Ментол', 'berries,mint', 14000, '/catalog/waka-sopro.jpg', true, 69),
  ('WAKA', 'SoPro 20.000', 'Энергетик Чёрная Смородина', 'berries,other', 14000, '/catalog/waka-sopro.jpg', true, 70);
