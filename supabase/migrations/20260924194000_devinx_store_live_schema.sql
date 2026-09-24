-- DevinX Loja live-schema mirror.
-- Generated from the working Vetorize store schema before cutover.
-- Legacy owner/user UUIDs intentionally do not reference DevinX auth.users;
-- identity linking is handled by devinx_store_identity_map.

create table if not exists public."partner_order_files" (
  "id" uuid default gen_random_uuid() not null,
  "order_id" uuid not null,
  "store_id" uuid not null,
  "storage_path" text not null,
  "original_name" text default ''::text not null,
  "content_type" text default 'image/webp'::text not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "partner_order_files_pkey" PRIMARY KEY (id),
  constraint "partner_order_files_storage_path_key" UNIQUE (storage_path)
);
alter table public."partner_order_files" enable row level security;
revoke all on table public."partner_order_files" from anon, authenticated;
grant all on table public."partner_order_files" to service_role;

create table if not exists public."partner_orders" (
  "id" uuid default gen_random_uuid() not null,
  "store_id" uuid not null,
  "customer_name" text default ''::text not null,
  "customer_contact" text default ''::text not null,
  "product_name" text default ''::text not null,
  "amount_cents" integer default 0 not null,
  "status" text default 'new'::text not null,
  "notes" text default ''::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "product_id" uuid,
  "personalization" jsonb default '{}'::jsonb not null,
  constraint "partner_orders_amount_cents_check" CHECK (amount_cents >= 0),
  constraint "partner_orders_pkey" PRIMARY KEY (id),
  constraint "partner_orders_status_check" CHECK (status = ANY (ARRAY['new'::text, 'production'::text, 'ready'::text, 'delivered'::text, 'canceled'::text]))
);
alter table public."partner_orders" enable row level security;
revoke all on table public."partner_orders" from anon, authenticated;
grant all on table public."partner_orders" to service_role;

create table if not exists public."partner_products" (
  "id" uuid default gen_random_uuid() not null,
  "store_id" uuid not null,
  "name" text not null,
  "description" text default ''::text not null,
  "price_cents" integer default 0 not null,
  "lead_time" text default ''::text not null,
  "active" boolean default false not null,
  "featured" boolean default false not null,
  "personalization" jsonb default '[]'::jsonb not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "cost_cents" integer default 0 not null,
  "stock_quantity" integer default 0 not null,
  "color_variants" jsonb default '[]'::jsonb not null,
  "shipping_weight_kg" numeric(8,3),
  "shipping_length_cm" numeric(8,2),
  "shipping_width_cm" numeric(8,2),
  "shipping_height_cm" numeric(8,2),
  "shipping_production_days" integer,
  "shipping_free" boolean default false not null,
  "storefront_visible" boolean default true not null,
  constraint "partner_products_color_variants_array_chk" CHECK (jsonb_typeof(color_variants) = 'array'::text),
  constraint "partner_products_cost_cents_check" CHECK (cost_cents >= 0),
  constraint "partner_products_name_check" CHECK (char_length(name) >= 1 AND char_length(name) <= 120),
  constraint "partner_products_pkey" PRIMARY KEY (id),
  constraint "partner_products_price_cents_check" CHECK (price_cents >= 0),
  constraint "partner_products_shipping_package_check" CHECK ((shipping_weight_kg IS NULL OR shipping_weight_kg > 0::numeric) AND (shipping_length_cm IS NULL OR shipping_length_cm > 0::numeric) AND (shipping_width_cm IS NULL OR shipping_width_cm > 0::numeric) AND (shipping_height_cm IS NULL OR shipping_height_cm > 0::numeric) AND (shipping_production_days IS NULL OR shipping_production_days >= 0 AND shipping_production_days <= 90)),
  constraint "partner_products_stock_quantity_check" CHECK (stock_quantity >= 0)
);
alter table public."partner_products" enable row level security;
revoke all on table public."partner_products" from anon, authenticated;
grant all on table public."partner_products" to service_role;

create table if not exists public."partner_stock_receipts" (
  "id" uuid default gen_random_uuid() not null,
  "store_id" uuid not null,
  "product_id" uuid,
  "product_name" text not null,
  "request_id" uuid not null,
  "kind" text not null,
  "quantity" integer not null,
  "unit_cost_cents" integer not null,
  "color_name" text default ''::text not null,
  "stock_before" integer not null,
  "stock_after" integer not null,
  "cost_before_cents" integer not null,
  "cost_after_cents" integer not null,
  "note" text default ''::text not null,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "partner_stock_receipts_kind_check" CHECK (kind = ANY (ARRAY['restock'::text, 'sale_reversal'::text])),
  constraint "partner_stock_receipts_pkey" PRIMARY KEY (id),
  constraint "partner_stock_receipts_quantity_check" CHECK (quantity > 0),
  constraint "partner_stock_receipts_store_id_request_id_key" UNIQUE (store_id, request_id),
  constraint "partner_stock_receipts_unit_cost_cents_check" CHECK (unit_cost_cents >= 0)
);
alter table public."partner_stock_receipts" enable row level security;
revoke all on table public."partner_stock_receipts" from anon, authenticated;
grant all on table public."partner_stock_receipts" to service_role;

create table if not exists public."partner_store_access_grants" (
  "id" uuid default gen_random_uuid() not null,
  "store_id" uuid not null,
  "owner_id" uuid not null,
  "user_id" uuid not null,
  "user_email" text not null,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "display_name" text default ''::text not null,
  "commission_mode" text default 'profit_percent'::text not null,
  "commission_percent" numeric(5,2) default 0 not null,
  "commission_fixed_cents" integer default 0 not null,
  "can_view_cost" boolean default false not null,
  "can_record_sales" boolean default true not null,
  "can_edit_sale_price" boolean default true not null,
  "max_discount_percent" numeric(6,2) default 100 not null,
  "can_view_stock" boolean default true not null,
  "can_create_products" boolean default true not null,
  "can_edit_products" boolean default true not null,
  "can_delete_products" boolean default false not null,
  "can_manage_photos" boolean default true not null,
  "can_edit_product_price" boolean default true not null,
  "can_view_own_sales" boolean default true not null,
  "can_manage_shipping" boolean default false not null,
  "can_edit_stock" boolean default false not null,
  constraint "partner_store_access_grants_commission_fixed_check" CHECK (commission_fixed_cents >= 0),
  constraint "partner_store_access_grants_commission_mode_check" CHECK (commission_mode = ANY (ARRAY['profit_percent'::text, 'revenue_percent'::text, 'fixed'::text])),
  constraint "partner_store_access_grants_commission_percent_check" CHECK (commission_percent >= 0::numeric AND commission_percent <= 100::numeric),
  constraint "partner_store_access_grants_discount_check" CHECK (max_discount_percent >= 0::numeric AND max_discount_percent <= 100::numeric),
  constraint "partner_store_access_grants_not_owner" CHECK (owner_id <> user_id),
  constraint "partner_store_access_grants_pkey" PRIMARY KEY (id),
  constraint "partner_store_access_grants_store_user_unique" UNIQUE (store_id, user_id)
);
alter table public."partner_store_access_grants" enable row level security;
revoke all on table public."partner_store_access_grants" from anon, authenticated;
grant all on table public."partner_store_access_grants" to service_role;

create table if not exists public."partner_store_checkout_intents" (
  "id" uuid default gen_random_uuid() not null,
  "token_hash" text not null,
  "user_id" uuid not null,
  "plan" text not null,
  "region" text default 'br'::text not null,
  "expires_at" timestamp with time zone default (now() + '00:30:00'::interval) not null,
  "used_at" timestamp with time zone,
  "order_id" text,
  "subscription_id" text,
  "created_at" timestamp with time zone default now() not null,
  constraint "partner_store_checkout_intents_pkey" PRIMARY KEY (id),
  constraint "partner_store_checkout_intents_plan_check" CHECK (plan = ANY (ARRAY['essencial'::text, 'pro'::text, 'full'::text])),
  constraint "partner_store_checkout_intents_region_check" CHECK (region = ANY (ARRAY['br'::text, 'intl'::text])),
  constraint "partner_store_checkout_intents_token_hash_key" UNIQUE (token_hash)
);
alter table public."partner_store_checkout_intents" enable row level security;
revoke all on table public."partner_store_checkout_intents" from anon, authenticated;
grant all on table public."partner_store_checkout_intents" to service_role;

create table if not exists public."partner_store_losses" (
  "id" uuid default gen_random_uuid() not null,
  "store_id" uuid not null,
  "amount_cents" integer not null,
  "note" text default ''::text not null,
  "created_at" timestamp with time zone default now() not null,
  "commission_sale_id" uuid,
  "payable_id" uuid,
  constraint "partner_store_losses_amount_cents_check" CHECK (amount_cents > 0),
  constraint "partner_store_losses_pkey" PRIMARY KEY (id)
);
alter table public."partner_store_losses" enable row level security;
revoke all on table public."partner_store_losses" from anon, authenticated;
grant all on table public."partner_store_losses" to service_role;

create table if not exists public."partner_store_media" (
  "id" uuid default gen_random_uuid() not null,
  "store_id" uuid not null,
  "product_id" uuid,
  "media_type" text not null,
  "storage_path" text,
  "external_url" text,
  "alt_text" text default ''::text not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "thumbnail_path" text,
  constraint "partner_store_media_media_type_check" CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text])),
  constraint "partner_store_media_pkey" PRIMARY KEY (id),
  constraint "partner_store_media_source_check" CHECK (media_type = 'image'::text AND storage_path IS NOT NULL AND external_url IS NULL OR media_type = 'video'::text AND external_url IS NOT NULL AND storage_path IS NULL)
);
alter table public."partner_store_media" enable row level security;
revoke all on table public."partner_store_media" from anon, authenticated;
grant all on table public."partner_store_media" to service_role;

create table if not exists public."partner_store_payables" (
  "id" uuid default gen_random_uuid() not null,
  "store_id" uuid not null,
  "grant_id" uuid,
  "user_id" uuid,
  "user_email" text default ''::text not null,
  "user_name" text default ''::text not null,
  "kind" text default 'commission'::text not null,
  "amount_cents" integer default 0 not null,
  "note" text default ''::text not null,
  "status" text default 'pending'::text not null,
  "paid_at" timestamp with time zone,
  "paid_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "sale_id" uuid,
  "source" text default 'manual'::text not null,
  "commission_mode" text,
  "commission_percent" numeric,
  "commission_fixed_cents" integer,
  "commission_basis_cents" integer,
  constraint "partner_store_payables_amount_check" CHECK (amount_cents > 0),
  constraint "partner_store_payables_commission_basis_check" CHECK (commission_basis_cents IS NULL OR commission_basis_cents >= 0),
  constraint "partner_store_payables_commission_fixed_check" CHECK (commission_fixed_cents IS NULL OR commission_fixed_cents >= 0),
  constraint "partner_store_payables_commission_mode_check" CHECK (commission_mode IS NULL OR (commission_mode = ANY (ARRAY['profit_percent'::text, 'revenue_percent'::text, 'fixed'::text]))),
  constraint "partner_store_payables_commission_percent_check" CHECK (commission_percent IS NULL OR commission_percent >= 0::numeric AND commission_percent <= 100::numeric),
  constraint "partner_store_payables_kind_check" CHECK (kind = ANY (ARRAY['commission'::text, 'bonus'::text, 'other'::text])),
  constraint "partner_store_payables_pkey" PRIMARY KEY (id),
  constraint "partner_store_payables_source_check" CHECK (source = ANY (ARRAY['manual'::text, 'automatic'::text])),
  constraint "partner_store_payables_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text]))
);
alter table public."partner_store_payables" enable row level security;
revoke all on table public."partner_store_payables" from anon, authenticated;
grant all on table public."partner_store_payables" to service_role;

create table if not exists public."partner_store_sale_approvals" (
  "id" uuid default gen_random_uuid() not null,
  "store_id" uuid not null,
  "grant_id" uuid not null,
  "user_id" uuid not null,
  "product_id" uuid not null,
  "product_name" text not null,
  "color_name" text,
  "quantity" integer not null,
  "published_unit_price_cents" integer not null,
  "requested_unit_price_cents" integer not null,
  "status" text default 'pending'::text not null,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "sale_id" uuid,
  "review_note" text,
  constraint "partner_store_sale_approvals_pkey" PRIMARY KEY (id),
  constraint "partner_store_sale_approvals_published_unit_price_cents_check" CHECK (published_unit_price_cents >= 0),
  constraint "partner_store_sale_approvals_quantity_check" CHECK (quantity > 0),
  constraint "partner_store_sale_approvals_requested_unit_price_cents_check" CHECK (requested_unit_price_cents >= 0),
  constraint "partner_store_sale_approvals_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]))
);
alter table public."partner_store_sale_approvals" enable row level security;
revoke all on table public."partner_store_sale_approvals" from anon, authenticated;
grant all on table public."partner_store_sale_approvals" to service_role;

create table if not exists public."partner_store_sale_requests" (
  "id" uuid default gen_random_uuid() not null,
  "store_id" uuid not null,
  "grant_id" uuid not null,
  "affiliate_user_id" uuid not null,
  "affiliate_name" text default ''::text not null,
  "product_id" uuid not null,
  "product_name" text default ''::text not null,
  "color_name" text default ''::text not null,
  "quantity" integer not null,
  "published_price_cents" integer not null,
  "requested_price_cents" integer not null,
  "status" text default 'pending'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid,
  "sale_id" uuid,
  constraint "partner_store_sale_requests_pkey" PRIMARY KEY (id),
  constraint "partner_store_sale_requests_published_price_cents_check" CHECK (published_price_cents >= 0),
  constraint "partner_store_sale_requests_quantity_check" CHECK (quantity > 0),
  constraint "partner_store_sale_requests_requested_price_cents_check" CHECK (requested_price_cents >= 0),
  constraint "partner_store_sale_requests_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'approved'::text, 'rejected'::text]))
);
alter table public."partner_store_sale_requests" enable row level security;
revoke all on table public."partner_store_sale_requests" from anon, authenticated;
grant all on table public."partner_store_sale_requests" to service_role;

create table if not exists public."partner_store_sales" (
  "id" uuid default gen_random_uuid() not null,
  "store_id" uuid not null,
  "product_id" uuid,
  "product_name" text default ''::text not null,
  "quantity" integer default 1 not null,
  "unit_price_cents" integer default 0 not null,
  "unit_cost_cents" integer default 0 not null,
  "revenue_cents" integer generated always as ((quantity * unit_price_cents)) stored,
  "cost_cents" integer generated always as ((quantity * unit_cost_cents)) stored,
  "profit_cents" integer generated always as ((quantity * (unit_price_cents - unit_cost_cents))) stored,
  "created_at" timestamp with time zone default now() not null,
  "seller_grant_id" uuid,
  "seller_user_id" uuid,
  "seller_name" text default ''::text not null,
  "seller_email" text default ''::text not null,
  "commission_mode" text,
  "commission_percent" numeric(5,2),
  "commission_fixed_cents" integer default 0 not null,
  "commission_cents" integer default 0 not null,
  "commission_paid_at" timestamp with time zone,
  "commission_paid_by" uuid,
  "voided_at" timestamp with time zone,
  "voided_by" uuid,
  "color_name" text default ''::text not null,
  constraint "partner_store_sales_commission_cents_check" CHECK (commission_cents >= 0),
  constraint "partner_store_sales_commission_mode_check" CHECK (commission_mode IS NULL OR (commission_mode = ANY (ARRAY['profit_percent'::text, 'revenue_percent'::text, 'fixed'::text]))),
  constraint "partner_store_sales_pkey" PRIMARY KEY (id),
  constraint "partner_store_sales_quantity_check" CHECK (quantity > 0),
  constraint "partner_store_sales_unit_cost_cents_check" CHECK (unit_cost_cents >= 0),
  constraint "partner_store_sales_unit_price_cents_check" CHECK (unit_price_cents >= 0)
);
alter table public."partner_store_sales" enable row level security;
revoke all on table public."partner_store_sales" from anon, authenticated;
grant all on table public."partner_store_sales" to service_role;

create table if not exists public."partner_store_shipping_integrations" (
  "store_id" uuid not null,
  "owner_id" uuid not null,
  "provider" text default 'melhor_envio'::text not null,
  "access_token" text,
  "refresh_token" text,
  "token_expires_at" timestamp with time zone,
  "refresh_expires_at" timestamp with time zone,
  "oauth_state" text,
  "oauth_state_expires_at" timestamp with time zone,
  "connected_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "partner_store_shipping_integrations_pkey" PRIMARY KEY (store_id),
  constraint "partner_store_shipping_integrations_provider_check" CHECK (provider = 'melhor_envio'::text)
);
alter table public."partner_store_shipping_integrations" enable row level security;
revoke all on table public."partner_store_shipping_integrations" from anon, authenticated;
grant all on table public."partner_store_shipping_integrations" to service_role;

create table if not exists public."partner_store_slug_aliases" (
  "slug" text not null,
  "store_id" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "partner_store_slug_aliases_pkey" PRIMARY KEY (slug)
);
alter table public."partner_store_slug_aliases" enable row level security;
revoke all on table public."partner_store_slug_aliases" from anon, authenticated;
grant all on table public."partner_store_slug_aliases" to service_role;

create table if not exists public."partner_store_subscriptions" (
  "id" uuid default gen_random_uuid() not null,
  "owner_id" uuid not null,
  "store_id" uuid,
  "provider" text default 'kiwify'::text not null,
  "product_id" text,
  "plan" text not null,
  "provider_status" text default 'pending'::text not null,
  "subscription_id" text,
  "last_order_id" text,
  "next_payment" timestamp with time zone,
  "access_until" timestamp with time zone,
  "started_at" timestamp with time zone,
  "canceled_at" timestamp with time zone,
  "last_event_type" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "retention_expires_at" timestamp with time zone,
  "access_revoked_at" timestamp with time zone,
  "cleanup_completed_at" timestamp with time zone,
  "master_override" boolean default false not null,
  constraint "partner_store_subscriptions_owner_id_key" UNIQUE (owner_id),
  constraint "partner_store_subscriptions_pkey" PRIMARY KEY (id),
  constraint "partner_store_subscriptions_plan_check" CHECK (plan = ANY (ARRAY['essencial'::text, 'pro'::text, 'full'::text])),
  constraint "partner_store_subscriptions_provider_check" CHECK (provider = 'kiwify'::text),
  constraint "partner_store_subscriptions_provider_status_check" CHECK (provider_status = ANY (ARRAY['pending'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'refunded'::text, 'chargedback'::text, 'suspended'::text])),
  constraint "partner_store_subscriptions_store_id_key" UNIQUE (store_id),
  constraint "partner_store_subscriptions_subscription_id_key" UNIQUE (subscription_id)
);
alter table public."partner_store_subscriptions" enable row level security;
revoke all on table public."partner_store_subscriptions" from anon, authenticated;
grant all on table public."partner_store_subscriptions" to service_role;

create table if not exists public."partner_store_whatsapp_contacts" (
  "id" uuid default gen_random_uuid() not null,
  "store_id" uuid not null,
  "slot" integer not null,
  "name" text default ''::text not null,
  "phone" text default ''::text not null,
  "active" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "partner_store_whatsapp_contacts_pkey" PRIMARY KEY (id),
  constraint "partner_store_whatsapp_contacts_slot_check" CHECK (slot >= 1 AND slot <= 50),
  constraint "partner_store_whatsapp_contacts_store_id_slot_key" UNIQUE (store_id, slot)
);
alter table public."partner_store_whatsapp_contacts" enable row level security;
revoke all on table public."partner_store_whatsapp_contacts" from anon, authenticated;
grant all on table public."partner_store_whatsapp_contacts" to service_role;

create table if not exists public."partner_stores" (
  "id" uuid default gen_random_uuid() not null,
  "owner_id" uuid not null,
  "slug" text not null,
  "name" text default 'Minha Loja'::text not null,
  "tagline" text default ''::text not null,
  "whatsapp" text default ''::text not null,
  "city" text default ''::text not null,
  "logo_path" text,
  "cover_path" text,
  "status" text default 'draft'::text not null,
  "plan" text default 'essencial'::text not null,
  "subscription_status" text default 'trial'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "status_before_subscription_hold" text,
  "whatsapp_name" text default 'Atendimento'::text not null,
  "whatsapp_active" boolean default true not null,
  "whatsapp_secondary" text default ''::text not null,
  "whatsapp_secondary_name" text default ''::text not null,
  "whatsapp_secondary_active" boolean default false not null,
  "whatsapp_primary" text default ''::text not null,
  "whatsapp_tertiary" text default ''::text not null,
  "whatsapp_tertiary_name" text default ''::text not null,
  "whatsapp_tertiary_active" boolean default false not null,
  "whatsapp_fourth" text default ''::text not null,
  "whatsapp_fourth_name" text default ''::text not null,
  "whatsapp_fourth_active" boolean default false not null,
  "whatsapp_fifth" text default ''::text not null,
  "whatsapp_fifth_name" text default ''::text not null,
  "whatsapp_fifth_active" boolean default false not null,
  "shipping_origin_cep" text,
  "shipping_default_weight_kg" numeric(8,3),
  "shipping_default_length_cm" numeric(8,2),
  "shipping_default_width_cm" numeric(8,2),
  "shipping_default_height_cm" numeric(8,2),
  "shipping_default_production_days" integer,
  "personalization_config" jsonb default '{}'::jsonb not null,
  constraint "partner_stores_owner_id_key" UNIQUE (owner_id),
  constraint "partner_stores_pkey" PRIMARY KEY (id),
  constraint "partner_stores_plan_check" CHECK (plan = ANY (ARRAY['essencial'::text, 'pro'::text, 'full'::text])),
  constraint "partner_stores_shipping_default_package_check" CHECK ((shipping_default_weight_kg IS NULL OR shipping_default_weight_kg > 0::numeric) AND (shipping_default_length_cm IS NULL OR shipping_default_length_cm > 0::numeric) AND (shipping_default_width_cm IS NULL OR shipping_default_width_cm > 0::numeric) AND (shipping_default_height_cm IS NULL OR shipping_default_height_cm > 0::numeric) AND (shipping_default_production_days IS NULL OR shipping_default_production_days >= 0 AND shipping_default_production_days <= 90)),
  constraint "partner_stores_shipping_origin_cep_check" CHECK (shipping_origin_cep IS NULL OR shipping_origin_cep ~ '^[0-9]{8}$'::text),
  constraint "partner_stores_slug_check" CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'::text),
  constraint "partner_stores_slug_key" UNIQUE (slug),
  constraint "partner_stores_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'paused'::text, 'suspended'::text])),
  constraint "partner_stores_subscription_status_check" CHECK (subscription_status = ANY (ARRAY['trial'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'suspended'::text]))
);
alter table public."partner_stores" enable row level security;
revoke all on table public."partner_stores" from anon, authenticated;
grant all on table public."partner_stores" to service_role;

alter table public."partner_order_files" add constraint "partner_order_files_order_id_fkey" FOREIGN KEY (order_id) REFERENCES partner_orders(id) ON DELETE CASCADE;
alter table public."partner_order_files" add constraint "partner_order_files_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE CASCADE;
alter table public."partner_orders" add constraint "partner_orders_product_id_fkey" FOREIGN KEY (product_id) REFERENCES partner_products(id) ON DELETE SET NULL;
alter table public."partner_orders" add constraint "partner_orders_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE CASCADE;
alter table public."partner_products" add constraint "partner_products_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE CASCADE;
alter table public."partner_stock_receipts" add constraint "partner_stock_receipts_product_id_fkey" FOREIGN KEY (product_id) REFERENCES partner_products(id) ON DELETE SET NULL;
alter table public."partner_stock_receipts" add constraint "partner_stock_receipts_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE CASCADE;
alter table public."partner_store_access_grants" add constraint "partner_store_access_grants_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE CASCADE;
alter table public."partner_store_losses" add constraint "partner_store_losses_commission_sale_id_fkey" FOREIGN KEY (commission_sale_id) REFERENCES partner_store_sales(id) ON DELETE SET NULL;
alter table public."partner_store_losses" add constraint "partner_store_losses_payable_id_fkey" FOREIGN KEY (payable_id) REFERENCES partner_store_payables(id) ON DELETE CASCADE;
alter table public."partner_store_losses" add constraint "partner_store_losses_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE CASCADE;
alter table public."partner_store_media" add constraint "partner_store_media_product_id_fkey" FOREIGN KEY (product_id) REFERENCES partner_products(id) ON DELETE CASCADE;
alter table public."partner_store_media" add constraint "partner_store_media_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE CASCADE;
alter table public."partner_store_payables" add constraint "partner_store_payables_grant_id_fkey" FOREIGN KEY (grant_id) REFERENCES partner_store_access_grants(id) ON DELETE SET NULL;
alter table public."partner_store_payables" add constraint "partner_store_payables_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES partner_store_sales(id) ON DELETE SET NULL;
alter table public."partner_store_payables" add constraint "partner_store_payables_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE CASCADE;
alter table public."partner_store_sale_approvals" add constraint "partner_store_sale_approvals_grant_id_fkey" FOREIGN KEY (grant_id) REFERENCES partner_store_access_grants(id) ON DELETE CASCADE;
alter table public."partner_store_sale_approvals" add constraint "partner_store_sale_approvals_product_id_fkey" FOREIGN KEY (product_id) REFERENCES partner_products(id) ON DELETE CASCADE;
alter table public."partner_store_sale_approvals" add constraint "partner_store_sale_approvals_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES partner_store_sales(id) ON DELETE SET NULL;
alter table public."partner_store_sale_approvals" add constraint "partner_store_sale_approvals_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE CASCADE;
alter table public."partner_store_sale_requests" add constraint "partner_store_sale_requests_grant_id_fkey" FOREIGN KEY (grant_id) REFERENCES partner_store_access_grants(id) ON DELETE CASCADE;
alter table public."partner_store_sale_requests" add constraint "partner_store_sale_requests_product_id_fkey" FOREIGN KEY (product_id) REFERENCES partner_products(id) ON DELETE CASCADE;
alter table public."partner_store_sale_requests" add constraint "partner_store_sale_requests_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES partner_store_sales(id) ON DELETE SET NULL;
alter table public."partner_store_sale_requests" add constraint "partner_store_sale_requests_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE CASCADE;
alter table public."partner_store_sales" add constraint "partner_store_sales_product_id_fkey" FOREIGN KEY (product_id) REFERENCES partner_products(id) ON DELETE SET NULL;
alter table public."partner_store_sales" add constraint "partner_store_sales_seller_grant_id_fkey" FOREIGN KEY (seller_grant_id) REFERENCES partner_store_access_grants(id) ON DELETE SET NULL;
alter table public."partner_store_sales" add constraint "partner_store_sales_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE CASCADE;
alter table public."partner_store_shipping_integrations" add constraint "partner_store_shipping_integrations_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE CASCADE;
alter table public."partner_store_slug_aliases" add constraint "partner_store_slug_aliases_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE CASCADE;
alter table public."partner_store_subscriptions" add constraint "partner_store_subscriptions_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE SET NULL;
alter table public."partner_store_whatsapp_contacts" add constraint "partner_store_whatsapp_contacts_store_id_fkey" FOREIGN KEY (store_id) REFERENCES partner_stores(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS partner_order_files_order_idx ON public.partner_order_files USING btree (order_id);
CREATE INDEX IF NOT EXISTS partner_order_files_store_idx ON public.partner_order_files USING btree (store_id);
CREATE INDEX IF NOT EXISTS partner_orders_product_id_idx ON public.partner_orders USING btree (product_id);
CREATE INDEX IF NOT EXISTS partner_orders_store_created_idx ON public.partner_orders USING btree (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_orders_store_id_idx ON public.partner_orders USING btree (store_id);
CREATE INDEX IF NOT EXISTS partner_orders_store_status_idx ON public.partner_orders USING btree (store_id, status);
CREATE INDEX IF NOT EXISTS partner_products_store_active_idx ON public.partner_products USING btree (store_id, active);
CREATE INDEX IF NOT EXISTS partner_products_store_id_idx ON public.partner_products USING btree (store_id);
CREATE INDEX IF NOT EXISTS partner_stock_receipts_product_fk ON public.partner_stock_receipts USING btree (product_id);
CREATE INDEX IF NOT EXISTS partner_stock_receipts_product_history ON public.partner_stock_receipts USING btree (store_id, product_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS partner_store_access_grants_owner_idx ON public.partner_store_access_grants USING btree (owner_id, store_id);
CREATE UNIQUE INDEX partner_store_access_grants_single_store_per_user_idx ON public.partner_store_access_grants USING btree (user_id);
CREATE INDEX IF NOT EXISTS partner_store_access_grants_store_idx ON public.partner_store_access_grants USING btree (store_id, created_at);
CREATE INDEX IF NOT EXISTS partner_store_checkout_intents_user_idx ON public.partner_store_checkout_intents USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX partner_store_losses_commission_sale_uidx ON public.partner_store_losses USING btree (commission_sale_id) WHERE (commission_sale_id IS NOT NULL);
CREATE UNIQUE INDEX partner_store_losses_payable_uidx ON public.partner_store_losses USING btree (payable_id) WHERE (payable_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS partner_store_losses_store_created_idx ON public.partner_store_losses USING btree (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_store_media_product_id_idx ON public.partner_store_media USING btree (product_id);
CREATE INDEX IF NOT EXISTS partner_store_media_store_id_idx ON public.partner_store_media USING btree (store_id);
CREATE UNIQUE INDEX partner_store_payables_auto_sale_unique ON public.partner_store_payables USING btree (sale_id) WHERE ((source = 'automatic'::text) AND (sale_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS partner_store_payables_grant_id_idx ON public.partner_store_payables USING btree (grant_id);
CREATE INDEX IF NOT EXISTS partner_store_payables_grant_idx ON public.partner_store_payables USING btree (store_id, grant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_store_payables_store_status_idx ON public.partner_store_payables USING btree (store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_store_sale_approvals_grant_idx ON public.partner_store_sale_approvals USING btree (grant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_store_sale_approvals_product_id_idx ON public.partner_store_sale_approvals USING btree (product_id);
CREATE INDEX IF NOT EXISTS partner_store_sale_approvals_sale_id_idx ON public.partner_store_sale_approvals USING btree (sale_id);
CREATE INDEX IF NOT EXISTS partner_store_sale_approvals_store_status_created_idx ON public.partner_store_sale_approvals USING btree (store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_store_sale_requests_grant_idx ON public.partner_store_sale_requests USING btree (grant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_store_sale_requests_product_id_idx ON public.partner_store_sale_requests USING btree (product_id);
CREATE INDEX IF NOT EXISTS partner_store_sale_requests_sale_id_idx ON public.partner_store_sale_requests USING btree (sale_id);
CREATE INDEX IF NOT EXISTS partner_store_sale_requests_store_status_idx ON public.partner_store_sale_requests USING btree (store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_store_sales_active_month_idx ON public.partner_store_sales USING btree (store_id, created_at DESC) WHERE (voided_at IS NULL);
CREATE INDEX IF NOT EXISTS partner_store_sales_commission_pending_idx ON public.partner_store_sales USING btree (store_id, commission_paid_at, created_at DESC) WHERE (commission_cents > 0);
CREATE INDEX IF NOT EXISTS partner_store_sales_product_idx ON public.partner_store_sales USING btree (product_id) WHERE (product_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS partner_store_sales_seller_grant_id_idx ON public.partner_store_sales USING btree (seller_grant_id);
CREATE INDEX IF NOT EXISTS partner_store_sales_seller_grant_idx ON public.partner_store_sales USING btree (store_id, seller_grant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_store_sales_store_created_idx ON public.partner_store_sales USING btree (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_store_shipping_integrations_owner_idx ON public.partner_store_shipping_integrations USING btree (owner_id);
CREATE INDEX IF NOT EXISTS partner_store_slug_aliases_store_idx ON public.partner_store_slug_aliases USING btree (store_id);
CREATE INDEX IF NOT EXISTS partner_store_subscriptions_retention_idx ON public.partner_store_subscriptions USING btree (retention_expires_at) WHERE ((cleanup_completed_at IS NULL) AND (store_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS partner_store_subscriptions_status_idx ON public.partner_store_subscriptions USING btree (provider_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS partner_store_whatsapp_contacts_store_slot_idx ON public.partner_store_whatsapp_contacts USING btree (store_id, slot);

comment on table public.partner_stores is 'DevinX Loja stores migrated from the legacy Vetorize backend while preserving stable store IDs.';
