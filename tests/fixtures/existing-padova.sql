-- Structural snapshot of US padova, 2026-10-28. NO source/business data.
-- Local isolated tests only; never apply this snapshot to Supabase.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE SCHEMA padova;
CREATE TABLE padova."asset_movements" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"asset_id" uuid NOT NULL,
"booking_id" uuid,
"receipt_id" uuid,
"kind" text NOT NULL,
"face_delta" numeric(18,2) NOT NULL,
"basis_delta" numeric(18,2) NOT NULL,
"proceeds" numeric(18,2),
"effective_date" date NOT NULL,
"reverses_id" uuid,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."asset_sales" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"movement_id" uuid NOT NULL,
"buyer_id" uuid NOT NULL,
"proceeds_due" numeric(18,2) NOT NULL,
"receipt_id" uuid,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."assets" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"kind" text NOT NULL,
"owner_id" uuid,
"holder_id" uuid,
"issuer_id" uuid,
"origin_booking_id" uuid,
"reference" text NOT NULL,
"restrictions" text,
"expires_on" date,
"original_face" numeric(18,2) NOT NULL,
"original_basis" numeric(18,2) NOT NULL,
"verification" text NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."attachments" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid,
"drive_file_id" text NOT NULL,
"title" text NOT NULL,
"sha256" text,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."audit_events" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"entity_table" text NOT NULL,
"entity_id" uuid,
"old_value" jsonb,
"new_value" jsonb,
"actor" uuid,
"reason" text,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."booking_expenses" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid NOT NULL,
"kind" text NOT NULL,
"amount" numeric(18,2) NOT NULL,
"effective_date" date NOT NULL,
"reason" text NOT NULL,
"reverses_id" uuid,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."booking_travelers" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid NOT NULL,
"traveler_id" uuid NOT NULL,
"status" text DEFAULT 'active'::text NOT NULL
);
CREATE TABLE padova."bookings" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"customer_id" uuid,
"supplier_id" uuid,
"source_party_id" uuid,
"kind" text NOT NULL,
"status" text DEFAULT 'Booked'::text NOT NULL,
"booked_date" date NOT NULL,
"travel_date" date,
"end_date" date,
"summary" text NOT NULL,
"notes" text,
"version" int4 DEFAULT 1 NOT NULL,
"verification" text DEFAULT 'unresolved'::text NOT NULL,
"financial_complete" bool DEFAULT false NOT NULL,
"archived_at" timestamptz,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."charges" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid NOT NULL,
"kind" text NOT NULL,
"amount" numeric(18,2) NOT NULL,
"currency" text DEFAULT 'USD'::text NOT NULL,
"effective_date" date NOT NULL,
"verification" text NOT NULL,
"source_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
"reverses_id" uuid,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."commission_allocations" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"commission_id" uuid NOT NULL,
"receipt_id" uuid NOT NULL,
"amount" numeric(18,2) NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."commissions" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid NOT NULL,
"intermediary_id" uuid NOT NULL,
"gross" numeric(18,2) NOT NULL,
"retention" numeric(18,2) NOT NULL,
"padova_expected" numeric(18,2) GENERATED ALWAYS AS ((gross - retention)) STORED,
"stay_end" date NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."confirmations" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid NOT NULL,
"kind" text NOT NULL,
"reference" text NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."corporate_rules" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"company_id" uuid NOT NULL,
"traveler_id" uuid,
"valid_from" date NOT NULL,
"valid_to" date,
"booking_rules" jsonb NOT NULL,
"service_rules" jsonb NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."customer_refund_payments" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"refund_id" uuid NOT NULL,
"amount" numeric(18,2) NOT NULL,
"paid_date" date NOT NULL,
"method" text NOT NULL,
"reference" text NOT NULL,
"override_reason" text,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."customer_refunds" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid NOT NULL,
"receipt_allocation_id" uuid,
"payee_id" uuid NOT NULL,
"due" numeric(18,2) NOT NULL,
"paid" numeric(18,2) NOT NULL,
"retained_fee" numeric(18,2) NOT NULL,
"paid_date" date,
"method" text,
"reference" text,
"override_reason" text,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."funding_components" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid NOT NULL,
"payment_id" uuid,
"asset_movement_id" uuid,
"kind" text NOT NULL,
"face_amount" numeric(18,2) NOT NULL,
"cost_basis" numeric(18,2) NOT NULL,
"account_holder_id" uuid,
"reference" text NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."funding_reversals" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"funding_id" uuid NOT NULL,
"movement_id" uuid NOT NULL,
"reason" text NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."itinerary_revisions" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid NOT NULL,
"itinerary" jsonb NOT NULL,
"actor" uuid NOT NULL,
"reason" text,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."notes" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid,
"party_id" uuid,
"body" text NOT NULL,
"actor" uuid NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."parties" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"display_name" text NOT NULL,
"kind" text NOT NULL,
"phone" text,
"email" text,
"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
"version" int4 DEFAULT 1 NOT NULL,
"archived_at" timestamptz,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."party_relationships" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"from_party" uuid NOT NULL,
"to_party" uuid NOT NULL,
"relationship" text NOT NULL,
"valid_from" date,
"valid_to" date,
"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL
);
CREATE TABLE padova."profit_movements" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid,
"asset_movement_id" uuid,
"kind" text NOT NULL,
"amount" numeric(18,2) NOT NULL,
"effective_date" date NOT NULL,
"verification" text NOT NULL,
"reverses_id" uuid,
"reason" text NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."receipt_allocations" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"receipt_id" uuid NOT NULL,
"booking_id" uuid NOT NULL,
"amount" numeric(18,2) NOT NULL,
"reverses_id" uuid,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."receipts" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"payer_id" uuid NOT NULL,
"kind" text NOT NULL,
"amount" numeric(18,2) NOT NULL,
"currency" text DEFAULT 'USD'::text NOT NULL,
"received_date" date NOT NULL,
"method" text NOT NULL,
"reference" text NOT NULL,
"verification" text NOT NULL,
"source_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."referral_payments" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"terms_id" uuid NOT NULL,
"amount" numeric(18,2) NOT NULL,
"paid_date" date NOT NULL,
"reference" text NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."referral_terms" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid NOT NULL,
"referrer_id" uuid NOT NULL,
"basis" text NOT NULL,
"percentage" numeric(8,5),
"fixed_amount" numeric(18,2),
"after_commission_receipt" bool DEFAULT false NOT NULL,
"agreed_date" date NOT NULL,
"source_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."requests" (
"key" uuid NOT NULL,
"actor" uuid NOT NULL,
"fingerprint" text NOT NULL,
"result" jsonb NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."review_cases" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid,
"category" text NOT NULL,
"title" text NOT NULL,
"evidence" jsonb NOT NULL,
"status" text DEFAULT 'open'::text NOT NULL,
"resolution" text,
"resolved_by" uuid,
"resolved_at" timestamptz,
"version" int4 DEFAULT 1 NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."settings" (
"id" bool DEFAULT true NOT NULL,
"business_timezone" text DEFAULT 'America/New_York'::text NOT NULL,
"operational_entry_enabled" bool DEFAULT false NOT NULL,
"backup_verified_at" timestamptz
);
CREATE TABLE padova."staff" (
"user_id" uuid NOT NULL,
"role" text NOT NULL,
"active" bool DEFAULT true NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."supplier_allocations" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"payment_id" uuid NOT NULL,
"booking_id" uuid NOT NULL,
"amount" numeric(18,2) NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."supplier_obligations" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid NOT NULL,
"supplier_id" uuid,
"amount" numeric(18,2) NOT NULL,
"effective_date" date NOT NULL,
"verification" text NOT NULL,
"source_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
"reverses_id" uuid,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."supplier_payments" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"payee_id" uuid NOT NULL,
"amount" numeric(18,2) NOT NULL,
"paid_date" date NOT NULL,
"method" text NOT NULL,
"reference" text NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."supplier_refund_receipts" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"refund_id" uuid NOT NULL,
"amount" numeric(18,2) NOT NULL,
"received_date" date NOT NULL,
"returned_kind" text NOT NULL,
"reference" text NOT NULL,
"requires_review" bool NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE padova."supplier_refunds" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"booking_id" uuid NOT NULL,
"funding_id" uuid NOT NULL,
"expected" numeric(18,2) NOT NULL,
"received" numeric(18,2) NOT NULL,
"returned_kind" text NOT NULL,
"received_date" date,
"reference" text,
"requires_review" bool NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE padova."asset_movements" ADD CONSTRAINT "asset_movements_kind_check" CHECK (kind = ANY (ARRAY['create'::text, 'use'::text, 'sale'::text, 'return'::text, 'expiry'::text, 'reverse'::text]));
ALTER TABLE padova."asset_movements" ADD CONSTRAINT "asset_movements_pkey" PRIMARY KEY (id);
ALTER TABLE padova."asset_movements" ADD CONSTRAINT "asset_movements_reverses_id_key" UNIQUE (reverses_id);
ALTER TABLE padova."asset_sales" ADD CONSTRAINT "asset_sales_movement_id_key" UNIQUE (movement_id);
ALTER TABLE padova."asset_sales" ADD CONSTRAINT "asset_sales_pkey" PRIMARY KEY (id);
ALTER TABLE padova."asset_sales" ADD CONSTRAINT "asset_sales_proceeds_due_check" CHECK (proceeds_due >= 0::numeric);
ALTER TABLE padova."asset_sales" ADD CONSTRAINT "asset_sales_receipt_id_key" UNIQUE (receipt_id);
ALTER TABLE padova."assets" ADD CONSTRAINT "assets_kind_check" CHECK (kind = ANY (ARRAY['capital_one_credit'::text, 'voucher'::text, 'customer_credit'::text, 'traveler_credit'::text, 'points'::text]));
ALTER TABLE padova."assets" ADD CONSTRAINT "assets_original_basis_check" CHECK (original_basis >= 0::numeric);
ALTER TABLE padova."assets" ADD CONSTRAINT "assets_original_face_check" CHECK (original_face > 0::numeric);
ALTER TABLE padova."assets" ADD CONSTRAINT "assets_pkey" PRIMARY KEY (id);
ALTER TABLE padova."attachments" ADD CONSTRAINT "attachments_pkey" PRIMARY KEY (id);
ALTER TABLE padova."audit_events" ADD CONSTRAINT "audit_events_pkey" PRIMARY KEY (id);
ALTER TABLE padova."booking_expenses" ADD CONSTRAINT "booking_expenses_kind_check" CHECK (kind = ANY (ARRAY['processing'::text, 'card'::text, 'other'::text]));
ALTER TABLE padova."booking_expenses" ADD CONSTRAINT "booking_expenses_pkey" PRIMARY KEY (id);
ALTER TABLE padova."booking_expenses" ADD CONSTRAINT "booking_expenses_reverses_id_key" UNIQUE (reverses_id);
ALTER TABLE padova."booking_travelers" ADD CONSTRAINT "booking_travelers_booking_id_traveler_id_key" UNIQUE (booking_id, traveler_id);
ALTER TABLE padova."booking_travelers" ADD CONSTRAINT "booking_travelers_pkey" PRIMARY KEY (id);
ALTER TABLE padova."bookings" ADD CONSTRAINT "bookings_kind_check" CHECK (kind = ANY (ARRAY['standard'::text, 'gds'::text, 'capital_one'::text, 'points'::text, 'seller_sourced'::text, 'commission'::text, 'hotel'::text, 'car'::text, 'other'::text]));
ALTER TABLE padova."bookings" ADD CONSTRAINT "bookings_pkey" PRIMARY KEY (id);
ALTER TABLE padova."bookings" ADD CONSTRAINT "bookings_status_check" CHECK (status = ANY (ARRAY['Booked'::text, 'Traveled'::text, 'Cancelled'::text, 'Refund Pending'::text]));
ALTER TABLE padova."bookings" ADD CONSTRAINT "bookings_verification_check" CHECK (verification = ANY (ARRAY['owner_confirmed'::text, 'source_supported'::text, 'reproducible_calculation'::text, 'prior_ai'::text, 'unresolved'::text]));
ALTER TABLE padova."charges" ADD CONSTRAINT "charges_currency_check" CHECK (currency = 'USD'::text);
ALTER TABLE padova."charges" ADD CONSTRAINT "charges_kind_check" CHECK (kind = ANY (ARRAY['fare'::text, 'booking_fee'::text, 'change_fee'::text, 'cancellation_fee'::text, 'service_fee'::text, 'adjustment'::text]));
ALTER TABLE padova."charges" ADD CONSTRAINT "charges_pkey" PRIMARY KEY (id);
ALTER TABLE padova."charges" ADD CONSTRAINT "charges_reverses_id_key" UNIQUE (reverses_id);
ALTER TABLE padova."commission_allocations" ADD CONSTRAINT "commission_allocations_amount_check" CHECK (amount > 0::numeric);
ALTER TABLE padova."commission_allocations" ADD CONSTRAINT "commission_allocations_pkey" PRIMARY KEY (id);
ALTER TABLE padova."commissions" ADD CONSTRAINT "commissions_check" CHECK (retention >= 0::numeric AND retention <= gross);
ALTER TABLE padova."commissions" ADD CONSTRAINT "commissions_gross_check" CHECK (gross >= 0::numeric);
ALTER TABLE padova."commissions" ADD CONSTRAINT "commissions_pkey" PRIMARY KEY (id);
ALTER TABLE padova."confirmations" ADD CONSTRAINT "confirmations_pkey" PRIMARY KEY (id);
ALTER TABLE padova."corporate_rules" ADD CONSTRAINT "corporate_rules_pkey" PRIMARY KEY (id);
ALTER TABLE padova."customer_refund_payments" ADD CONSTRAINT "customer_refund_payments_amount_check" CHECK (amount > 0::numeric);
ALTER TABLE padova."customer_refund_payments" ADD CONSTRAINT "customer_refund_payments_pkey" PRIMARY KEY (id);
ALTER TABLE padova."customer_refunds" ADD CONSTRAINT "customer_refunds_check" CHECK (paid >= 0::numeric AND paid <= due);
ALTER TABLE padova."customer_refunds" ADD CONSTRAINT "customer_refunds_check1" CHECK (paid = 0::numeric OR paid_date IS NOT NULL AND reference IS NOT NULL);
ALTER TABLE padova."customer_refunds" ADD CONSTRAINT "customer_refunds_due_check" CHECK (due >= 0::numeric);
ALTER TABLE padova."customer_refunds" ADD CONSTRAINT "customer_refunds_pkey" PRIMARY KEY (id);
ALTER TABLE padova."customer_refunds" ADD CONSTRAINT "customer_refunds_retained_fee_check" CHECK (retained_fee >= 0::numeric);
ALTER TABLE padova."funding_components" ADD CONSTRAINT "funding_components_asset_movement_id_key" UNIQUE (asset_movement_id);
ALTER TABLE padova."funding_components" ADD CONSTRAINT "funding_components_cost_basis_check" CHECK (cost_basis >= 0::numeric);
ALTER TABLE padova."funding_components" ADD CONSTRAINT "funding_components_face_amount_check" CHECK (face_amount >= 0::numeric);
ALTER TABLE padova."funding_components" ADD CONSTRAINT "funding_components_kind_check" CHECK (kind = ANY (ARRAY['cash'::text, 'card'::text, 'credit'::text, 'voucher'::text, 'points'::text]));
ALTER TABLE padova."funding_components" ADD CONSTRAINT "funding_components_pkey" PRIMARY KEY (id);
ALTER TABLE padova."funding_reversals" ADD CONSTRAINT "funding_reversals_funding_id_key" UNIQUE (funding_id);
ALTER TABLE padova."funding_reversals" ADD CONSTRAINT "funding_reversals_movement_id_key" UNIQUE (movement_id);
ALTER TABLE padova."funding_reversals" ADD CONSTRAINT "funding_reversals_pkey" PRIMARY KEY (id);
ALTER TABLE padova."itinerary_revisions" ADD CONSTRAINT "itinerary_revisions_pkey" PRIMARY KEY (id);
ALTER TABLE padova."notes" ADD CONSTRAINT "notes_pkey" PRIMARY KEY (id);
ALTER TABLE padova."parties" ADD CONSTRAINT "parties_display_name_check" CHECK (length(TRIM(BOTH FROM display_name)) > 0);
ALTER TABLE padova."parties" ADD CONSTRAINT "parties_kind_check" CHECK (kind = ANY (ARRAY['person'::text, 'company'::text, 'supplier'::text, 'intermediary'::text, 'referrer'::text, 'account_holder'::text]));
ALTER TABLE padova."parties" ADD CONSTRAINT "parties_pkey" PRIMARY KEY (id);
ALTER TABLE padova."party_relationships" ADD CONSTRAINT "party_relationships_check" CHECK (from_party <> to_party);
ALTER TABLE padova."party_relationships" ADD CONSTRAINT "party_relationships_pkey" PRIMARY KEY (id);
ALTER TABLE padova."profit_movements" ADD CONSTRAINT "profit_movements_asset_movement_id_key" UNIQUE (asset_movement_id);
ALTER TABLE padova."profit_movements" ADD CONSTRAINT "profit_movements_pkey" PRIMARY KEY (id);
ALTER TABLE padova."profit_movements" ADD CONSTRAINT "profit_movements_reverses_id_key" UNIQUE (reverses_id);
ALTER TABLE padova."receipt_allocations" ADD CONSTRAINT "receipt_allocations_amount_check" CHECK (amount <> 0::numeric);
ALTER TABLE padova."receipt_allocations" ADD CONSTRAINT "receipt_allocations_check" CHECK (amount > 0::numeric AND reverses_id IS NULL OR amount < 0::numeric AND reverses_id IS NOT NULL);
ALTER TABLE padova."receipt_allocations" ADD CONSTRAINT "receipt_allocations_pkey" PRIMARY KEY (id);
ALTER TABLE padova."receipt_allocations" ADD CONSTRAINT "receipt_allocations_reverses_id_key" UNIQUE (reverses_id);
ALTER TABLE padova."receipts" ADD CONSTRAINT "receipts_amount_check" CHECK (amount > 0::numeric);
ALTER TABLE padova."receipts" ADD CONSTRAINT "receipts_currency_check" CHECK (currency = 'USD'::text);
ALTER TABLE padova."receipts" ADD CONSTRAINT "receipts_kind_check" CHECK (kind = ANY (ARRAY['customer'::text, 'commission'::text, 'voucher_sale'::text]));
ALTER TABLE padova."receipts" ADD CONSTRAINT "receipts_pkey" PRIMARY KEY (id);
ALTER TABLE padova."receipts" ADD CONSTRAINT "receipts_reference_check" CHECK (length(TRIM(BOTH FROM reference)) > 0);
ALTER TABLE padova."referral_payments" ADD CONSTRAINT "referral_payments_amount_check" CHECK (amount > 0::numeric);
ALTER TABLE padova."referral_payments" ADD CONSTRAINT "referral_payments_pkey" PRIMARY KEY (id);
ALTER TABLE padova."referral_terms" ADD CONSTRAINT "referral_terms_basis_check" CHECK (basis = ANY (ARRAY['markup_profit'::text, 'net_commission'::text, 'fixed'::text]));
ALTER TABLE padova."referral_terms" ADD CONSTRAINT "referral_terms_booking_id_key" UNIQUE (booking_id);
ALTER TABLE padova."referral_terms" ADD CONSTRAINT "referral_terms_check" CHECK (basis = 'fixed'::text AND fixed_amount IS NOT NULL AND percentage IS NULL OR basis <> 'fixed'::text AND percentage IS NOT NULL AND fixed_amount IS NULL);
ALTER TABLE padova."referral_terms" ADD CONSTRAINT "referral_terms_fixed_amount_check" CHECK (fixed_amount >= 0::numeric);
ALTER TABLE padova."referral_terms" ADD CONSTRAINT "referral_terms_percentage_check" CHECK (percentage >= 0::numeric AND percentage <= 1::numeric);
ALTER TABLE padova."referral_terms" ADD CONSTRAINT "referral_terms_pkey" PRIMARY KEY (id);
ALTER TABLE padova."requests" ADD CONSTRAINT "requests_pkey" PRIMARY KEY (key);
ALTER TABLE padova."review_cases" ADD CONSTRAINT "review_cases_check" CHECK (status <> 'resolved'::text OR resolution IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL);
ALTER TABLE padova."review_cases" ADD CONSTRAINT "review_cases_pkey" PRIMARY KEY (id);
ALTER TABLE padova."review_cases" ADD CONSTRAINT "review_cases_status_check" CHECK (status = ANY (ARRAY['open'::text, 'investigating'::text, 'resolved'::text]));
ALTER TABLE padova."settings" ADD CONSTRAINT "settings_business_timezone_check" CHECK (business_timezone = 'America/New_York'::text);
ALTER TABLE padova."settings" ADD CONSTRAINT "settings_id_check" CHECK (id);
ALTER TABLE padova."settings" ADD CONSTRAINT "settings_pkey" PRIMARY KEY (id);
ALTER TABLE padova."staff" ADD CONSTRAINT "staff_pkey" PRIMARY KEY (user_id);
ALTER TABLE padova."staff" ADD CONSTRAINT "staff_role_check" CHECK (role = ANY (ARRAY['owner'::text, 'staff'::text]));
ALTER TABLE padova."supplier_allocations" ADD CONSTRAINT "supplier_allocations_amount_check" CHECK (amount > 0::numeric);
ALTER TABLE padova."supplier_allocations" ADD CONSTRAINT "supplier_allocations_pkey" PRIMARY KEY (id);
ALTER TABLE padova."supplier_obligations" ADD CONSTRAINT "supplier_obligations_pkey" PRIMARY KEY (id);
ALTER TABLE padova."supplier_obligations" ADD CONSTRAINT "supplier_obligations_reverses_id_key" UNIQUE (reverses_id);
ALTER TABLE padova."supplier_payments" ADD CONSTRAINT "supplier_payments_amount_check" CHECK (amount > 0::numeric);
ALTER TABLE padova."supplier_payments" ADD CONSTRAINT "supplier_payments_pkey" PRIMARY KEY (id);
ALTER TABLE padova."supplier_refund_receipts" ADD CONSTRAINT "supplier_refund_receipts_amount_check" CHECK (amount > 0::numeric);
ALTER TABLE padova."supplier_refund_receipts" ADD CONSTRAINT "supplier_refund_receipts_pkey" PRIMARY KEY (id);
ALTER TABLE padova."supplier_refunds" ADD CONSTRAINT "supplier_refunds_check" CHECK (received = 0::numeric OR received_date IS NOT NULL);
ALTER TABLE padova."supplier_refunds" ADD CONSTRAINT "supplier_refunds_expected_check" CHECK (expected >= 0::numeric);
ALTER TABLE padova."supplier_refunds" ADD CONSTRAINT "supplier_refunds_pkey" PRIMARY KEY (id);
ALTER TABLE padova."supplier_refunds" ADD CONSTRAINT "supplier_refunds_received_check" CHECK (received >= 0::numeric);
ALTER TABLE padova."asset_movements" ADD CONSTRAINT "asset_movements_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES padova.assets(id);
ALTER TABLE padova."asset_movements" ADD CONSTRAINT "asset_movements_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."asset_movements" ADD CONSTRAINT "asset_movements_receipt_id_fkey" FOREIGN KEY (receipt_id) REFERENCES padova.receipts(id);
ALTER TABLE padova."asset_movements" ADD CONSTRAINT "asset_movements_reverses_id_fkey" FOREIGN KEY (reverses_id) REFERENCES padova.asset_movements(id);
ALTER TABLE padova."asset_sales" ADD CONSTRAINT "asset_sales_buyer_id_fkey" FOREIGN KEY (buyer_id) REFERENCES padova.parties(id);
ALTER TABLE padova."asset_sales" ADD CONSTRAINT "asset_sales_movement_id_fkey" FOREIGN KEY (movement_id) REFERENCES padova.asset_movements(id);
ALTER TABLE padova."asset_sales" ADD CONSTRAINT "asset_sales_receipt_id_fkey" FOREIGN KEY (receipt_id) REFERENCES padova.receipts(id);
ALTER TABLE padova."assets" ADD CONSTRAINT "assets_holder_id_fkey" FOREIGN KEY (holder_id) REFERENCES padova.parties(id);
ALTER TABLE padova."assets" ADD CONSTRAINT "assets_issuer_id_fkey" FOREIGN KEY (issuer_id) REFERENCES padova.parties(id);
ALTER TABLE padova."assets" ADD CONSTRAINT "assets_origin_booking_id_fkey" FOREIGN KEY (origin_booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."assets" ADD CONSTRAINT "assets_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES padova.parties(id);
ALTER TABLE padova."attachments" ADD CONSTRAINT "attachments_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."booking_expenses" ADD CONSTRAINT "booking_expenses_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."booking_expenses" ADD CONSTRAINT "booking_expenses_reverses_id_fkey" FOREIGN KEY (reverses_id) REFERENCES padova.booking_expenses(id);
ALTER TABLE padova."booking_travelers" ADD CONSTRAINT "booking_travelers_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."booking_travelers" ADD CONSTRAINT "booking_travelers_traveler_id_fkey" FOREIGN KEY (traveler_id) REFERENCES padova.parties(id);
ALTER TABLE padova."bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES padova.parties(id);
ALTER TABLE padova."bookings" ADD CONSTRAINT "bookings_source_party_id_fkey" FOREIGN KEY (source_party_id) REFERENCES padova.parties(id);
ALTER TABLE padova."bookings" ADD CONSTRAINT "bookings_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES padova.parties(id);
ALTER TABLE padova."charges" ADD CONSTRAINT "charges_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."charges" ADD CONSTRAINT "charges_reverses_id_fkey" FOREIGN KEY (reverses_id) REFERENCES padova.charges(id);
ALTER TABLE padova."commission_allocations" ADD CONSTRAINT "commission_allocations_commission_id_fkey" FOREIGN KEY (commission_id) REFERENCES padova.commissions(id);
ALTER TABLE padova."commission_allocations" ADD CONSTRAINT "commission_allocations_receipt_id_fkey" FOREIGN KEY (receipt_id) REFERENCES padova.receipts(id);
ALTER TABLE padova."commissions" ADD CONSTRAINT "commissions_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."commissions" ADD CONSTRAINT "commissions_intermediary_id_fkey" FOREIGN KEY (intermediary_id) REFERENCES padova.parties(id);
ALTER TABLE padova."confirmations" ADD CONSTRAINT "confirmations_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."corporate_rules" ADD CONSTRAINT "corporate_rules_company_id_fkey" FOREIGN KEY (company_id) REFERENCES padova.parties(id);
ALTER TABLE padova."corporate_rules" ADD CONSTRAINT "corporate_rules_traveler_id_fkey" FOREIGN KEY (traveler_id) REFERENCES padova.parties(id);
ALTER TABLE padova."customer_refund_payments" ADD CONSTRAINT "customer_refund_payments_refund_id_fkey" FOREIGN KEY (refund_id) REFERENCES padova.customer_refunds(id);
ALTER TABLE padova."customer_refunds" ADD CONSTRAINT "customer_refunds_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."customer_refunds" ADD CONSTRAINT "customer_refunds_payee_id_fkey" FOREIGN KEY (payee_id) REFERENCES padova.parties(id);
ALTER TABLE padova."customer_refunds" ADD CONSTRAINT "customer_refunds_receipt_allocation_id_fkey" FOREIGN KEY (receipt_allocation_id) REFERENCES padova.receipt_allocations(id);
ALTER TABLE padova."funding_components" ADD CONSTRAINT "funding_components_account_holder_id_fkey" FOREIGN KEY (account_holder_id) REFERENCES padova.parties(id);
ALTER TABLE padova."funding_components" ADD CONSTRAINT "funding_components_asset_movement_id_fkey" FOREIGN KEY (asset_movement_id) REFERENCES padova.asset_movements(id);
ALTER TABLE padova."funding_components" ADD CONSTRAINT "funding_components_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."funding_components" ADD CONSTRAINT "funding_components_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES padova.supplier_payments(id);
ALTER TABLE padova."funding_reversals" ADD CONSTRAINT "funding_reversals_funding_id_fkey" FOREIGN KEY (funding_id) REFERENCES padova.funding_components(id);
ALTER TABLE padova."funding_reversals" ADD CONSTRAINT "funding_reversals_movement_id_fkey" FOREIGN KEY (movement_id) REFERENCES padova.asset_movements(id);
ALTER TABLE padova."itinerary_revisions" ADD CONSTRAINT "itinerary_revisions_actor_fkey" FOREIGN KEY (actor) REFERENCES auth.users(id);
ALTER TABLE padova."itinerary_revisions" ADD CONSTRAINT "itinerary_revisions_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."notes" ADD CONSTRAINT "notes_actor_fkey" FOREIGN KEY (actor) REFERENCES auth.users(id);
ALTER TABLE padova."notes" ADD CONSTRAINT "notes_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."notes" ADD CONSTRAINT "notes_party_id_fkey" FOREIGN KEY (party_id) REFERENCES padova.parties(id);
ALTER TABLE padova."party_relationships" ADD CONSTRAINT "party_relationships_from_party_fkey" FOREIGN KEY (from_party) REFERENCES padova.parties(id);
ALTER TABLE padova."party_relationships" ADD CONSTRAINT "party_relationships_to_party_fkey" FOREIGN KEY (to_party) REFERENCES padova.parties(id);
ALTER TABLE padova."profit_movements" ADD CONSTRAINT "profit_movements_asset_movement_id_fkey" FOREIGN KEY (asset_movement_id) REFERENCES padova.asset_movements(id);
ALTER TABLE padova."profit_movements" ADD CONSTRAINT "profit_movements_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."profit_movements" ADD CONSTRAINT "profit_movements_reverses_id_fkey" FOREIGN KEY (reverses_id) REFERENCES padova.profit_movements(id);
ALTER TABLE padova."receipt_allocations" ADD CONSTRAINT "receipt_allocations_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."receipt_allocations" ADD CONSTRAINT "receipt_allocations_receipt_id_fkey" FOREIGN KEY (receipt_id) REFERENCES padova.receipts(id);
ALTER TABLE padova."receipt_allocations" ADD CONSTRAINT "receipt_allocations_reverses_id_fkey" FOREIGN KEY (reverses_id) REFERENCES padova.receipt_allocations(id);
ALTER TABLE padova."receipts" ADD CONSTRAINT "receipts_payer_id_fkey" FOREIGN KEY (payer_id) REFERENCES padova.parties(id);
ALTER TABLE padova."referral_payments" ADD CONSTRAINT "referral_payments_terms_id_fkey" FOREIGN KEY (terms_id) REFERENCES padova.referral_terms(id);
ALTER TABLE padova."referral_terms" ADD CONSTRAINT "referral_terms_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."referral_terms" ADD CONSTRAINT "referral_terms_referrer_id_fkey" FOREIGN KEY (referrer_id) REFERENCES padova.parties(id);
ALTER TABLE padova."review_cases" ADD CONSTRAINT "review_cases_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."review_cases" ADD CONSTRAINT "review_cases_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES auth.users(id);
ALTER TABLE padova."staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE padova."supplier_allocations" ADD CONSTRAINT "supplier_allocations_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."supplier_allocations" ADD CONSTRAINT "supplier_allocations_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES padova.supplier_payments(id);
ALTER TABLE padova."supplier_obligations" ADD CONSTRAINT "supplier_obligations_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."supplier_obligations" ADD CONSTRAINT "supplier_obligations_reverses_id_fkey" FOREIGN KEY (reverses_id) REFERENCES padova.supplier_obligations(id);
ALTER TABLE padova."supplier_obligations" ADD CONSTRAINT "supplier_obligations_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES padova.parties(id);
ALTER TABLE padova."supplier_payments" ADD CONSTRAINT "supplier_payments_payee_id_fkey" FOREIGN KEY (payee_id) REFERENCES padova.parties(id);
ALTER TABLE padova."supplier_refund_receipts" ADD CONSTRAINT "supplier_refund_receipts_refund_id_fkey" FOREIGN KEY (refund_id) REFERENCES padova.supplier_refunds(id);
ALTER TABLE padova."supplier_refunds" ADD CONSTRAINT "supplier_refunds_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES padova.bookings(id);
ALTER TABLE padova."supplier_refunds" ADD CONSTRAINT "supplier_refunds_funding_id_fkey" FOREIGN KEY (funding_id) REFERENCES padova.funding_components(id);
CREATE OR REPLACE FUNCTION padova.audit_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin
 insert into padova.audit_events(entity_table,entity_id,old_value,new_value,actor,reason) values(tg_table_schema||'.'||tg_table_name,new.id,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid(),current_setting('padova.reason',true)); return new;
end $function$;

CREATE OR REPLACE FUNCTION padova.money(value text, allow_negative boolean DEFAULT false)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare n numeric; begin
 if value is null or value !~ '^-?[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Enter an explicit currency amount with at most two decimal places'; end if;
 n:=value::numeric; if abs(n)>9999999999999999.99 or (not allow_negative and n<0) then raise exception 'Invalid money amount'; end if; return n;
end $function$;

CREATE OR REPLACE FUNCTION padova.reject_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin raise exception 'Append-only history: create a linked correction or reversal'; end $function$;

CREATE OR REPLACE FUNCTION padova.historical_directory(search text DEFAULT ''::text, page integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=padova.require_staff();result jsonb;begin
select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from(select r.id,'historical_contact' record_type,raw->>'name' display_name,raw->>'phone' phone,raw->>'email' email,raw->>'notes' notes,raw,'Needs identity review' kind from padova_staging.evidence_records r join padova_staging.evidence_files f on f.id=r.file_id where f.path='tables/customer_directory.json' and (search='' or raw::text ilike '%'||search||'%') order by r.record_index limit 50 offset greatest(page,0)*50)t;return result;end $function$;

CREATE OR REPLACE FUNCTION padova.manage_staff(email text, active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=padova.require_staff();target uuid;begin
if not exists(select 1 from padova.staff s where s.user_id=actor and s.role='owner' and s.active) then raise exception 'Owner access required' using errcode='42501';end if;
select u.id into target from auth.users u where lower(u.email)=lower(manage_staff.email) and u.email_confirmed_at is not null;
if target is null then raise exception 'Staff member must first create and confirm their individual login';end if;
if target=actor then raise exception 'Owner cannot deactivate their own access';end if;
insert into padova.staff(user_id,role,active) values(target,'staff',manage_staff.active) on conflict(user_id) do update set active=excluded.active;
insert into padova.audit_events(entity_table,entity_id,actor,reason,new_value) values('padova.staff',target,actor,'Owner changed staff access',jsonb_build_object('active',manage_staff.active));
return jsonb_build_object('updated',true);end $function$;

CREATE OR REPLACE FUNCTION padova.require_staff()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid := auth.uid(); begin
 if u is null or not exists(select 1 from padova.staff where user_id=u and active) then raise exception 'Active Padova staff access required' using errcode='42501'; end if;
 return u;
end $function$;

CREATE OR REPLACE FUNCTION padova.command(action text, p jsonb, request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=padova.require_staff(); fp text:=md5(action||p::text); prior padova.requests; result jsonb;
 id uuid; bid uuid; rid uuid; aid uuid; mid uuid; amount numeric; allocated numeric; cost numeric; face numeric; basis numeric; proceeds numeric; original padova.assets; row_data record; item jsonb; day date; v integer; receipt padova.receipts;
begin
 if request_key is null or p is null then raise exception 'Request key and payload required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(request_key::text,0));
 select * into prior from padova.requests where key=request_key;
 if found then if prior.actor<>actor or prior.fingerprint<>fp then raise exception 'Request key reused with different data'; end if; return prior.result; end if;
 perform set_config('padova.reason',coalesce(p->>'reason',action),true);
 if action not in ('review_resolve','review_investigate','note') and not (select operational_entry_enabled from padova.settings where settings.id) then raise exception 'Operational entry is locked until independent backup and restore verification'; end if;
 day:=coalesce((p->>'date')::date,(now() at time zone 'America/New_York')::date);
 bid:=(p->>'booking_id')::uuid;
 if bid is not null then
  perform 1 from padova.bookings where bookings.id=bid and archived_at is null for update;
  if not found then raise exception 'Active booking not found'; end if;
 end if;
 case action
 when 'party_edit' then
  update padova.parties set display_name=p->>'name',phone=p->>'phone',email=p->>'email',details=coalesce(p->'details','{}'),version=version+1 where parties.id=(p->>'party_id')::uuid and version=(p->>'version')::integer returning parties.id into id;
  if not found then raise exception 'Customer changed: reload before saving' using errcode='40001';end if;
 when 'relationship' then
  insert into padova.party_relationships(from_party,to_party,relationship,valid_from,valid_to,evidence) values((p->>'from_party')::uuid,(p->>'to_party')::uuid,p->>'relationship',day,(p->>'valid_to')::date,coalesce(p->'evidence','[]')) returning party_relationships.id into id;
 when 'corporate_rule' then
  insert into padova.corporate_rules(company_id,traveler_id,valid_from,valid_to,booking_rules,service_rules) values((p->>'company_id')::uuid,(p->>'traveler_id')::uuid,day,(p->>'valid_to')::date,jsonb_build_object('description',p->>'booking_rules'),jsonb_build_object('description',p->>'service_rules')) returning corporate_rules.id into id;
 when 'party_create' then
  insert into padova.parties(display_name,kind,phone,email,details) values(p->>'name',p->>'kind',p->>'phone',p->>'email',coalesce(p->'details','{}')) returning parties.id into id;
 when 'booking_create' then
  insert into padova.bookings(customer_id,supplier_id,source_party_id,kind,booked_date,travel_date,end_date,summary,notes,verification) values((p->>'customer_id')::uuid,(p->>'supplier_id')::uuid,(p->>'source_party_id')::uuid,p->>'kind',day,(p->>'travel_date')::date,(p->>'end_date')::date,p->>'summary',p->>'notes','owner_confirmed') returning bookings.id into bid;
  id:=bid;
  for item in select value from jsonb_array_elements(coalesce(p->'confirmations','[]')) loop insert into padova.confirmations(booking_id,kind,reference) values(bid,item->>'kind',item->>'reference'); end loop;
  for item in select value from jsonb_array_elements(coalesce(p->'traveler_ids','[]')) loop insert into padova.booking_travelers(booking_id,traveler_id) values(bid,(item#>>'{}')::uuid); end loop;
  if p->>'sale' is not null then insert into padova.charges(booking_id,kind,amount,effective_date,verification) values(bid,'fare',padova.money(p->>'sale'),day,'owner_confirmed'); end if;
  if p->>'cost' is not null then insert into padova.supplier_obligations(booking_id,supplier_id,amount,effective_date,verification) values(bid,(p->>'supplier_id')::uuid,padova.money(p->>'cost'),day,'owner_confirmed'); end if;
  if p->>'fee' is not null then insert into padova.charges(booking_id,kind,amount,effective_date,verification) values(bid,'booking_fee',padova.money(p->>'fee'),day,'owner_confirmed'); end if;
  insert into padova.itinerary_revisions(booking_id,itinerary,actor,reason) values(bid,coalesce(p->'itinerary','{}'),actor,'Initial itinerary');
  perform padova.profit_refresh(bid,day,'Initial economics');
 when 'booking_edit' then
  update padova.bookings set summary=p->>'summary',status=p->>'status',travel_date=(p->>'travel_date')::date,end_date=(p->>'end_date')::date,notes=p->>'notes',version=version+1 where bookings.id=bid and version=(p->>'version')::integer returning version into v;
  if not found then raise exception 'Booking changed: reload before saving' using errcode='40001'; end if;
  insert into padova.itinerary_revisions(booking_id,itinerary,actor,reason) values(bid,coalesce(p->'itinerary','{}'),actor,p->>'reason');
  if p->>'status' in ('Cancelled','Refund Pending') or exists(select 1 from padova.bookings where bookings.id=bid and kind='capital_one') then insert into padova.review_cases(booking_id,category,title,evidence) values(bid,'credit_recheck','Recheck earlier credits and funding after change/cancellation',p); end if;
  id:=bid;
 when 'partial_cancel' then
  if not exists(select 1 from padova.booking_travelers where booking_id=bid and traveler_id=(p->>'traveler_id')::uuid) then raise exception 'Traveler must belong to the booking';end if;
  insert into padova.itinerary_revisions(booking_id,itinerary,actor,reason) values(bid,jsonb_build_object('event','partial_cancellation','traveler_id',p->>'traveler_id','source',p),actor,p->>'reason');
  if p->>'charge_reduction' is not null then insert into padova.charges(booking_id,kind,amount,effective_date,verification) values(bid,'adjustment',-padova.money(p->>'charge_reduction'),day,'owner_confirmed');end if;
  if p->>'cost_reduction' is not null then insert into padova.supplier_obligations(booking_id,amount,effective_date,verification) values(bid,-padova.money(p->>'cost_reduction'),day,'owner_confirmed');end if;
  insert into padova.review_cases(booking_id,category,title,evidence) values(bid,'partial_cancellation','Track separate supplier/customer refunds and recheck credits',p);
  perform padova.profit_refresh(bid,day,'Partial passenger cancellation');id:=bid;
 when 'financial_reverse' then
  if coalesce(length(trim(p->>'reason')),0)=0 then raise exception 'Reversal reason required';end if;
  case p->>'table'
  when 'charges' then
   select * into row_data from padova.charges c where c.id=(p->>'entry_id')::uuid and c.booking_id=bid;
   if not found or row_data.reverses_id is not null then raise exception 'Original charge required';end if;
   insert into padova.charges(booking_id,kind,amount,effective_date,verification,reverses_id) values(bid,row_data.kind,-row_data.amount,day,'owner_confirmed',row_data.id) returning charges.id into id;
  when 'supplier_obligations' then
   select * into row_data from padova.supplier_obligations o where o.id=(p->>'entry_id')::uuid and o.booking_id=bid;
   if not found or row_data.reverses_id is not null then raise exception 'Original obligation required';end if;
   insert into padova.supplier_obligations(booking_id,supplier_id,amount,effective_date,verification,reverses_id) values(bid,row_data.supplier_id,-row_data.amount,day,'owner_confirmed',row_data.id) returning supplier_obligations.id into id;
  when 'booking_expenses' then
   select * into row_data from padova.booking_expenses e where e.id=(p->>'entry_id')::uuid and e.booking_id=bid;
   if not found or row_data.reverses_id is not null then raise exception 'Original expense required';end if;
   insert into padova.booking_expenses(booking_id,kind,amount,effective_date,reason,reverses_id) values(bid,row_data.kind,-row_data.amount,day,p->>'reason',row_data.id) returning booking_expenses.id into id;
  else raise exception 'Unsupported reversal table';end case;
  perform padova.profit_refresh(bid,day,p->>'reason');
 when 'expense' then
  insert into padova.booking_expenses(booking_id,kind,amount,effective_date,reason) values(bid,p->>'kind',padova.money(p->>'amount',true),day,p->>'reason') returning booking_expenses.id into id;
  perform padova.profit_refresh(bid,day,'Booking expense adjustment');
 when 'charge' then
  insert into padova.charges(booking_id,kind,amount,effective_date,verification,source_evidence) values(bid,p->>'kind',padova.money(p->>'amount',true),day,'owner_confirmed',coalesce(p->'evidence','[]')) returning charges.id into id;
  perform padova.profit_refresh(bid,day,coalesce(p->>'reason','Customer charge adjustment'));
 when 'cost_adjustment' then
  insert into padova.supplier_obligations(booking_id,supplier_id,amount,effective_date,verification) values(bid,(p->>'supplier_id')::uuid,padova.money(p->>'amount',true),day,'owner_confirmed') returning supplier_obligations.id into id;
  perform padova.profit_refresh(bid,day,coalesce(p->>'reason','Supplier cost adjustment'));
 when 'receipt' then
  amount:=padova.money(p->>'amount'); if amount<=0 then raise exception 'Receipt must be positive'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p->>'payer_id',p->>'reference',day::text,p->>'method',amount::text),0));
  if exists(select 1 from padova.receipts cr where cr.payer_id=(p->>'payer_id')::uuid and cr.reference=p->>'reference' and cr.received_date=day and cr.method=p->>'method' and cr.amount=padova.money(p->>'amount')) then raise exception 'Possible duplicate receipt: review the existing payment';end if;
  insert into padova.receipts(payer_id,kind,amount,received_date,method,reference,verification,source_evidence) values((p->>'payer_id')::uuid,p->>'kind',amount,day,p->>'method',p->>'reference','owner_confirmed',coalesce(p->'evidence','[]')) returning receipts.id into rid;
  id:=rid; allocated:=0;
  if p->>'kind'<>'customer' and jsonb_array_length(coalesce(p->'allocations','[]'))>0 then raise exception 'Use commission allocation for commission receipts'; end if;
  -- Stable lock order prevents deadlocks between multi-booking receipt submissions.
  perform 1 from padova.bookings where bookings.id in (select (value->>'booking_id')::uuid from jsonb_array_elements(coalesce(p->'allocations','[]'))) order by bookings.id for update;
  for item in select value from jsonb_array_elements(coalesce(p->'allocations','[]')) loop
   amount:=padova.money(item->>'amount'); if amount<=0 then raise exception 'Allocation must be positive'; end if;
   insert into padova.receipt_allocations(receipt_id,booking_id,amount) values(rid,(item->>'booking_id')::uuid,amount); allocated:=allocated+amount;
  end loop;
  if allocated>padova.money(p->>'amount') then raise exception 'Receipt over-allocation'; end if;
 when 'allocate' then
  rid:=(p->>'receipt_id')::uuid; select * into receipt from padova.receipts where receipts.id=rid for update;
  if not found or receipt.kind<>'customer' then raise exception 'Customer receipt not found'; end if;
  amount:=padova.money(p->>'amount'); if amount<=0 then raise exception 'Positive allocation required'; end if;
  select coalesce(sum(a.amount),0) into allocated from padova.receipt_allocations a where a.receipt_id=rid;
  if allocated+amount>receipt.amount then raise exception 'Receipt over-allocation'; end if;
  insert into padova.receipt_allocations(receipt_id,booking_id,amount) values(rid,bid,amount) returning receipt_allocations.id into id;
 when 'allocation_reverse' then
  select * into row_data from padova.receipt_allocations where receipt_allocations.id=(p->>'allocation_id')::uuid;
  if not found or row_data.amount<=0 then raise exception 'Positive original allocation required'; end if;
  perform 1 from padova.receipts where receipts.id=row_data.receipt_id for update;
  insert into padova.receipt_allocations(receipt_id,booking_id,amount,reverses_id) values(row_data.receipt_id,row_data.booking_id,-row_data.amount,row_data.id) returning receipt_allocations.id into id;
 when 'supplier_payment' then
  amount:=padova.money(p->>'amount');
  insert into padova.supplier_payments(payee_id,amount,paid_date,method,reference) values((p->>'payee_id')::uuid,amount,day,p->>'method',p->>'reference') returning supplier_payments.id into id;
  allocated:=0;
  for item in select value from jsonb_array_elements(p->'allocations') loop
   cost:=padova.money(item->>'amount'); allocated:=allocated+cost;
   insert into padova.supplier_allocations(payment_id,booking_id,amount) values(id,(item->>'booking_id')::uuid,cost);
   insert into padova.funding_components(booking_id,payment_id,kind,face_amount,cost_basis,account_holder_id,reference) values((item->>'booking_id')::uuid,id,p->>'method',cost,cost,(p->>'account_holder_id')::uuid,p->>'reference');
  end loop;
  if allocated<>amount then raise exception 'Supplier allocations must equal payment'; end if;
 when 'asset_create' then
  face:=padova.money(p->>'face'); basis:=padova.money(p->>'basis');
  insert into padova.assets(kind,owner_id,holder_id,issuer_id,origin_booking_id,reference,restrictions,expires_on,original_face,original_basis,verification) values(p->>'kind',(p->>'owner_id')::uuid,(p->>'holder_id')::uuid,(p->>'issuer_id')::uuid,bid,p->>'reference',p->>'restrictions',(p->>'expires_on')::date,face,basis,'owner_confirmed') returning assets.id into aid;
  insert into padova.asset_movements(asset_id,booking_id,kind,face_delta,basis_delta,effective_date) values(aid,bid,'create',face,basis,day);
  id:=aid;
 when 'asset_use', 'asset_sale', 'asset_expiry' then
  aid:=(p->>'asset_id')::uuid; select * into original from padova.assets where assets.id=aid for update;
  if not found then raise exception 'Asset not found'; end if;
  select sum(face_delta),sum(basis_delta) into face,basis from padova.asset_movements where asset_id=aid;
  amount:=padova.money(p->>'face'); if amount<=0 or amount>face then raise exception 'Asset overuse'; end if;
  if action<>'asset_expiry' and original.expires_on<day then raise exception 'Asset expired'; end if;
  if original.kind in ('customer_credit','traveler_credit','points') then raise exception 'Restricted asset needs dedicated workflow and review'; end if;
  cost:=case when amount=face then basis else round(basis*amount/face,2) end;
  proceeds:=case when action='asset_sale' then padova.money(p->>'proceeds') else 0 end;
  insert into padova.asset_movements(asset_id,booking_id,kind,face_delta,basis_delta,proceeds,effective_date) values(aid,bid,case action when 'asset_use' then 'use' when 'asset_sale' then 'sale' else 'expiry' end,-amount,-cost,proceeds,day) returning asset_movements.id into mid;
  if action='asset_use' then
   if bid is null then raise exception 'Booking required'; end if;
   insert into padova.funding_components(booking_id,asset_movement_id,kind,face_amount,cost_basis,reference) values(bid,mid,case original.kind when 'voucher' then 'voucher' else 'credit' end,amount,cost,original.reference);
   if cost<>amount then
    if p->>'basis_treatment' not in ('transfer_into_cost','already_in_cost') or p->>'basis_treatment' is null then raise exception 'Choose whether the carrying basis is already in the supplier cost';end if;
    if p->>'basis_treatment'='transfer_into_cost' then
     if not exists(select 1 from padova.supplier_obligations where booking_id=bid) then raise exception 'Enter supplier face cost before transferring basis';end if;
     insert into padova.supplier_obligations(booking_id,amount,effective_date,verification,source_evidence) values(bid,cost-amount,day,'owner_confirmed',jsonb_build_array(jsonb_build_object('asset_movement_id',mid)));
     perform padova.profit_refresh(bid,day,'Asset carrying basis transferred into supplier economic cost');
    end if;
   end if;
  else
   insert into padova.profit_movements(asset_movement_id,kind,amount,effective_date,verification,reason) values(mid,action,proceeds-cost,day,'owner_confirmed',coalesce(p->>'reason',action));
   if action='asset_sale' and (p->>'received')::boolean then
    if proceeds<=0 then raise exception 'Positive sale proceeds required for receipt'; end if;
    insert into padova.receipts(payer_id,kind,amount,received_date,method,reference,verification) values((p->>'buyer_id')::uuid,'voucher_sale',proceeds,day,p->>'method',p->>'reference','owner_confirmed') returning receipts.id into rid;
   end if;
   if action='asset_sale' then insert into padova.asset_sales(movement_id,buyer_id,proceeds_due,receipt_id) values(mid,(p->>'buyer_id')::uuid,proceeds,rid);end if;
  end if; id:=mid;
 when 'asset_return' then
  select * into row_data from padova.asset_movements where asset_movements.id=(p->>'movement_id')::uuid;
  if not found or row_data.kind<>'use' then raise exception 'Return must reference an original use'; end if;
  perform 1 from padova.assets where assets.id=row_data.asset_id for update;
  insert into padova.asset_movements(asset_id,booking_id,kind,face_delta,basis_delta,effective_date,reverses_id) values(row_data.asset_id,row_data.booking_id,'return',-row_data.face_delta,-row_data.basis_delta,day,row_data.id) returning asset_movements.id into id;
  mid:=id;
  insert into padova.funding_reversals(funding_id,movement_id,reason) select f.id,mid,coalesce(p->>'reason','Asset use returned') from padova.funding_components f where f.asset_movement_id=row_data.id;
  insert into padova.review_cases(booking_id,category,title,evidence) values(row_data.booking_id,'asset_return','Review supplier cost/refund following returned funding',p);
 when 'capital_one_match' then
  if not coalesce((p->>'credit_seen')::boolean,false) then raise exception 'Confirm credit is visible before entering final rate'; end if;
  face:=padova.money(p->>'original_rate'); cost:=padova.money(p->>'final_rate'); amount:=face-cost;
  if amount<=0 then raise exception 'Confirmed price-match benefit must be positive'; end if;
  if not exists(select 1 from padova.bookings where bookings.id=bid and kind='capital_one') then raise exception 'Capital One booking required'; end if;
  select sum(o.amount) into allocated from padova.supplier_obligations o where o.booking_id=bid;
  if allocated is null or allocated<>face then raise exception 'Original rate must equal current economic cost; review prior adjustments'; end if;
  insert into padova.supplier_obligations(booking_id,amount,effective_date,verification) values(bid,-amount,day,'owner_confirmed');
  insert into padova.assets(kind,origin_booking_id,reference,original_face,original_basis,verification) values('capital_one_credit',bid,p->>'reference',amount,amount,'owner_confirmed') returning assets.id into aid;
  insert into padova.asset_movements(asset_id,booking_id,kind,face_delta,basis_delta,effective_date) values(aid,bid,'create',amount,amount,day);
  perform padova.profit_refresh(bid,day,'Verified Capital One credit; benefit recognized once as cost reduction'); id:=aid;
 when 'supplier_refund' then
  select * into row_data from padova.funding_components where funding_components.id=(p->>'funding_id')::uuid and booking_id=bid;
  if not found then raise exception 'Original funding required'; end if;
  amount:=padova.money(p->>'received');
  select coalesce(sum(sr.total_received),0) into allocated from padova.supplier_refund_status sr where sr.funding_id=row_data.id;
  if allocated+amount>row_data.face_amount then raise exception 'Refund exceeds original funding'; end if;
  insert into padova.supplier_refunds(booking_id,funding_id,expected,received,returned_kind,received_date,reference,requires_review) values(bid,row_data.id,padova.money(p->>'expected'),amount,p->>'returned_kind',case when amount>0 then day end,p->>'reference',row_data.kind<>p->>'returned_kind') returning supplier_refunds.id into id;
  if row_data.kind<>p->>'returned_kind' then insert into padova.review_cases(booking_id,category,title,evidence) values(bid,'refund_form_mismatch','Supplier refund returned a different form of value',p); end if;
 when 'supplier_refund_receive' then
  select * into row_data from padova.supplier_refunds sr where sr.id=(p->>'refund_id')::uuid and sr.booking_id=bid for update;
  if not found then raise exception 'Supplier refund expectation required';end if;
  amount:=padova.money(p->>'amount');
  select sr.total_received into allocated from padova.supplier_refund_status sr where sr.id=row_data.id;
  if allocated+amount>row_data.expected then raise exception 'Receipt exceeds expected supplier refund; document an adjustment first';end if;
  select f.kind,f.face_amount into receipt.method,face from padova.funding_components f where f.id=row_data.funding_id;
  if amount+(select coalesce(sum(sr.total_received),0) from padova.supplier_refund_status sr where sr.funding_id=row_data.funding_id)>face then raise exception 'Cumulative supplier refund exceeds original funding';end if;
  insert into padova.supplier_refund_receipts(refund_id,amount,received_date,returned_kind,reference,requires_review) values(row_data.id,amount,day,p->>'returned_kind',p->>'reference',receipt.method<>p->>'returned_kind') returning supplier_refund_receipts.id into id;
  if receipt.method<>p->>'returned_kind' then insert into padova.review_cases(booking_id,category,title,evidence) values(bid,'refund_form_mismatch','Supplier refund returned a different form of value',p);end if;
 when 'customer_refund_pay' then
  select * into row_data from padova.customer_refunds cr where cr.id=(p->>'refund_id')::uuid and cr.booking_id=bid for update;
  if not found then raise exception 'Customer refund obligation required';end if;
  amount:=padova.money(p->>'amount');
  select cr.total_paid into allocated from padova.customer_refund_status cr where cr.id=row_data.id;
  if allocated+amount>row_data.due then raise exception 'Payment exceeds remaining customer refund';end if;
  if p->>'override_reason' is null and not exists(select 1 from padova.supplier_refunds sr where sr.booking_id=bid and not sr.requires_review and (sr.received>0 or exists(select 1 from padova.supplier_refund_receipts rr where rr.refund_id=sr.id and not rr.requires_review))) then raise exception 'Wait for supplier receipt or document exception';end if;
  select coalesce(sum(a.amount),0) into allocated from padova.receipt_allocations a join padova.receipts r on r.id=a.receipt_id where a.booking_id=bid and r.kind='customer';
  select coalesce(sum(cr.total_paid),0) into face from padova.customer_refund_status cr where cr.booking_id=bid;
  if face+amount>allocated then raise exception 'Cumulative customer refunds exceed allocated customer receipts';end if;
  insert into padova.customer_refund_payments(refund_id,amount,paid_date,method,reference,override_reason) values(row_data.id,amount,day,p->>'method',p->>'reference',p->>'override_reason') returning customer_refund_payments.id into id;
 when 'customer_refund' then
  amount:=padova.money(p->>'paid');
  if amount>0 and p->>'override_reason' is null and not exists(select 1 from padova.supplier_refunds sr where sr.booking_id=bid and not sr.requires_review and (sr.received>0 or exists(select 1 from padova.supplier_refund_receipts rr where rr.refund_id=sr.id and not rr.requires_review))) then raise exception 'Wait for supplier receipt or document exception'; end if;
  select coalesce(sum(a.amount),0) into allocated from padova.receipt_allocations a join padova.receipts r on r.id=a.receipt_id where a.booking_id=bid and r.kind='customer';
  if padova.money(p->>'due')>allocated and p->>'override_reason' is null then raise exception 'Refund exceeds customer payments: document override'; end if;
  insert into padova.customer_refunds(booking_id,payee_id,due,paid,retained_fee,paid_date,method,reference,override_reason) values(bid,(p->>'payee_id')::uuid,padova.money(p->>'due'),amount,padova.money(p->>'retained_fee'),case when amount>0 then day end,p->>'method',p->>'reference',p->>'override_reason') returning customer_refunds.id into id;
 when 'commission' then
  insert into padova.commissions(booking_id,intermediary_id,gross,retention,stay_end) values(bid,(p->>'intermediary_id')::uuid,padova.money(p->>'gross'),padova.money(p->>'retention'),(p->>'stay_end')::date) returning commissions.id into id;
  perform padova.profit_refresh(bid,day,'Commission expectation recorded separately from receipt');
 when 'commission_allocate' then
  rid:=(p->>'receipt_id')::uuid; select * into receipt from padova.receipts where receipts.id=rid for update;
  if not found or receipt.kind<>'commission' then raise exception 'Commission receipt required'; end if;
  select * into row_data from padova.commissions where commissions.id=(p->>'commission_id')::uuid for update;
  if not found then raise exception 'Commission not found'; end if;
  amount:=padova.money(p->>'amount');
  if amount<=0 or amount+(select coalesce(sum(c.amount),0) from padova.commission_allocations c where c.receipt_id=rid)>receipt.amount or amount+(select coalesce(sum(c.amount),0) from padova.commission_allocations c where c.commission_id=row_data.id)>row_data.padova_expected then raise exception 'Commission over-allocation'; end if;
  insert into padova.commission_allocations(commission_id,receipt_id,amount) values(row_data.id,rid,amount) returning commission_allocations.id into id;
 when 'referral_terms' then
  insert into padova.referral_terms(booking_id,referrer_id,basis,percentage,fixed_amount,after_commission_receipt,agreed_date) values(bid,(p->>'referrer_id')::uuid,p->>'basis',(p->>'percentage')::numeric,(p->>'fixed_amount')::numeric,coalesce((p->>'after_commission_receipt')::boolean,false),day) returning referral_terms.id into id;
  perform padova.profit_refresh(bid,day,'Booking-specific referral snapshot');
 when 'referral_pay' then
  select * into row_data from padova.referral_terms where booking_id=bid for update;
  if not found then raise exception 'Booking referral agreement required';end if;
  amount:=padova.money(p->>'amount');
  select coalesce(sum(padova_expected),0) into face from padova.commissions where booking_id=bid;
  if row_data.after_commission_receipt and (select coalesce(sum(a.amount),0) from padova.commission_allocations a join padova.commissions c on c.id=a.commission_id where c.booking_id=bid)<face then raise exception 'Wait for the booking commission receipt';end if;
  if exists(select 1 from padova.bookings where bookings.id=bid and coalesce(end_date,travel_date)>day) then raise exception 'Referral payout is normally after travel';end if;
  basis:=case row_data.basis when 'fixed' then row_data.fixed_amount when 'net_commission' then round(face*row_data.percentage,2) else round(greatest((select coalesce(sum(c.amount),0) from padova.charges c where c.booking_id=bid)-(select coalesce(sum(o.amount),0) from padova.supplier_obligations o where o.booking_id=bid),0)*row_data.percentage,2) end;
  if amount+(select coalesce(sum(rp.amount),0) from padova.referral_payments rp where rp.terms_id=row_data.id)>basis then raise exception 'Referral payment exceeds agreed liability';end if;
  insert into padova.referral_payments(terms_id,amount,paid_date,reference) values(row_data.id,amount,day,p->>'reference') returning referral_payments.id into id;
 when 'attachment' then
  if p->>'drive_file_id' !~ '^[A-Za-z0-9_-]+$' then raise exception 'Use an owner-controlled Drive file ID';end if;
  insert into padova.attachments(booking_id,drive_file_id,title,sha256) values(bid,p->>'drive_file_id',p->>'title',p->>'sha256') returning attachments.id into id;
 when 'note' then
  insert into padova.notes(booking_id,party_id,body,actor) values(bid,(p->>'party_id')::uuid,p->>'body',actor) returning notes.id into id;
 when 'review_resolve','review_investigate' then
  update padova.review_cases set status=case action when 'review_resolve' then 'resolved' else 'investigating' end,resolution=p->>'resolution',resolved_by=case when action='review_resolve' then actor end,resolved_at=case when action='review_resolve' then now() end,version=version+1 where review_cases.id=(p->>'review_id')::uuid and version=(p->>'version')::integer returning review_cases.id into id;
  if not found then raise exception 'Review changed: reload before saving' using errcode='40001'; end if;
 when 'archive' then
  update padova.bookings set archived_at=now(),version=version+1 where bookings.id=bid and version=(p->>'version')::integer returning bookings.id into id;
  if not found then raise exception 'Booking changed: reload before archiving' using errcode='40001'; end if;
 else raise exception 'Unsupported operation'; end case;
 result:=jsonb_build_object('id',id,'booking_id',bid,'saved',true);
 insert into padova.requests(key,actor,fingerprint,result) values(request_key,actor,fp,result);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION padova.read_data(section text, search text DEFAULT ''::text, page integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=padova.require_staff(); result jsonb; skip integer:=greatest(page,0)*50; begin
case section
 when 'home' then select jsonb_build_object('region','us-east-1','business_timezone','America/New_York','operational_entry_enabled',(select operational_entry_enabled from padova.settings where id),'open_reviews',(select count(*) from padova.review_cases where status<>'resolved'),'evidence_records',(select count(*) from padova_staging.evidence_records),'bookings',(select count(*) from padova.bookings where archived_at is null),'verified_profit_coverage',(select count(*) from padova.bookings where financial_complete),'missing_commissions',(select count(*) from padova.commissions c where c.stay_end+30<(now() at time zone 'America/New_York')::date and c.padova_expected>(select coalesce(sum(amount),0) from padova.commission_allocations a where a.commission_id=c.id))) into result;
 when 'bookings' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select b.*,p.display_name customer_name,(select string_agg(reference,', ') from padova.confirmations c where c.booking_id=b.id) confirmations from padova.booking_summary b left join padova.parties p on p.id=b.customer_id where b.archived_at is null and (search='' or b.summary ilike '%'||search||'%' or p.display_name ilike '%'||search||'%' or exists(select 1 from padova.confirmations c where c.booking_id=b.id and c.reference ilike '%'||search||'%') or exists(select 1 from padova.booking_travelers bt join padova.parties pt on pt.id=bt.traveler_id where bt.booking_id=b.id and pt.display_name ilike '%'||search||'%')) order by b.booked_date desc,b.id limit 50 offset skip) t;
 when 'customers' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select * from padova.parties where archived_at is null and display_name ilike '%'||search||'%' order by display_name,id limit 50 offset skip)t;
 when 'money' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from(select r.*,p.display_name payer,r.amount-(select coalesce(sum(a.amount),0) from padova.receipt_allocations a where a.receipt_id=r.id)-(select coalesce(sum(a.amount),0) from padova.commission_allocations a where a.receipt_id=r.id) unallocated from padova.receipts r join padova.parties p on p.id=r.payer_id order by received_date desc,r.id limit 50 offset skip)t;
 when 'reviews' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from(select * from padova.review_cases where status<>'resolved' and (title ilike '%'||search||'%' or evidence::text ilike '%'||search||'%') order by created_at,id limit 50 offset skip)t;
 when 'history' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from(select * from padova.audit_events where entity_id::text=search or new_value->>'booking_id'=search order by created_at desc,id limit 100 offset skip)t;
 when 'evidence' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from(select r.id,r.evidence_class,f.path,r.record_index,r.raw from padova_staging.evidence_records r join padova_staging.evidence_files f on f.id=r.file_id where (search='' and f.path='tables/bookings_current.json') or (search<>'' and r.raw::text ilike '%'||search||'%') order by f.path,r.record_index limit 50 offset skip)t;
 when 'reports' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from(select date_trunc('month',m.effective_date)::date as report_month,sum(m.amount) filter(where b.booked_date is not null and date_trunc('month',b.booked_date)=date_trunc('month',m.effective_date)) new_booking_profit,sum(m.amount) filter(where b.booked_date is null or date_trunc('month',b.booked_date)<>date_trunc('month',m.effective_date)) prior_period_adjustments,sum(m.amount) net_profit_movement from padova.profit_movements m left join padova.bookings b on b.id=m.booking_id group by 1 order by 1 desc limit 50 offset skip)t;
 else raise exception 'Unsupported section'; end case; return result;
end $function$;

CREATE OR REPLACE FUNCTION padova.activate_owner()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid();begin
 perform pg_advisory_xact_lock(hashtextextended('padova_owner_bootstrap',0));
 if u is null or not exists(select 1 from auth.users where id=u and lower(email)='bookings@padovatravels.com' and email_confirmed_at is not null) then raise exception 'Verify the Padova owner email first' using errcode='42501';end if;
 if exists(select 1 from padova.staff where role='owner' and user_id<>u) then raise exception 'Owner already enrolled' using errcode='42501';end if;
 insert into padova.staff(user_id,role) values(u,'owner') on conflict(user_id) do nothing;
 return jsonb_build_object('enrolled',true);
end $function$;

CREATE OR REPLACE FUNCTION padova.refund_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare paid_before numeric;received numeric;begin
perform 1 from padova.bookings where id=new.booking_id for update;
select coalesce(sum(total_paid),0) into paid_before from padova.customer_refund_status where booking_id=new.booking_id;
select coalesce(sum(a.amount),0) into received from padova.receipt_allocations a join padova.receipts r on r.id=a.receipt_id where a.booking_id=new.booking_id and r.kind='customer';
if paid_before+new.paid>received then raise exception 'Cumulative customer refunds exceed allocated customer receipts';end if;
if new.override_reason is not null then insert into padova.review_cases(booking_id,category,title,evidence) values(new.booking_id,'refund_exception','Review documented customer refund exception',to_jsonb(new));end if;
return new;end $function$;

CREATE OR REPLACE FUNCTION padova.references_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=padova.require_staff();begin
return jsonb_build_object(
 'parties',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',display_name,'kind',kind)),'[]') from padova.parties where archived_at is null),
 'bookings',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'label',b.summary||' · '||coalesce((select string_agg(reference,', ') from padova.confirmations c where c.booking_id=b.id),b.id::text),'version',b.version)),'[]') from padova.bookings b where b.archived_at is null),
 'assets',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',reference||' · '||kind)),'[]') from padova.assets),
 'receipts',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',reference||' · '||amount)),'[]') from padova.receipts),
 'funding',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',reference||' · '||kind||' · '||face_amount,'booking_id',booking_id)),'[]') from padova.funding_components),
 'commissions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label','Commission '||padova_expected||' · '||stay_end,'booking_id',booking_id)),'[]') from padova.commissions),
 'asset_uses',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'label',a.reference||' · use '||(-m.face_delta))) ,'[]') from padova.asset_movements m join padova.assets a on a.id=m.asset_id where m.kind='use')
);
end $function$;

CREATE OR REPLACE FUNCTION padova.profit_refresh(bid uuid, day date, why text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare sale numeric; cost numeric; comm numeric; referral numeric:=0; total numeric; previous numeric; terms padova.referral_terms; begin
 perform 1 from padova.bookings where id=bid for update;
 select sum(amount) into sale from padova.charges where booking_id=bid;
 select sum(amount) into cost from padova.supplier_obligations where booking_id=bid;
 if sale is null or cost is null then update padova.bookings set financial_complete=false where id=bid; return; end if;
 select coalesce(sum(padova_expected),0) into comm from padova.commissions where booking_id=bid;
 select * into terms from padova.referral_terms where booking_id=bid;
 if found then referral:=case terms.basis when 'fixed' then terms.fixed_amount when 'net_commission' then round(comm*terms.percentage,2) else round(greatest(sale-cost,0)*terms.percentage,2) end; end if;
 total:=sale-cost+comm-referral-(select coalesce(sum(amount),0) from padova.booking_expenses where booking_id=bid);
 select coalesce(sum(amount),0) into previous from padova.profit_movements where booking_id=bid and asset_movement_id is null;
 if total<>previous then insert into padova.profit_movements(booking_id,kind,amount,effective_date,verification,reason) values(bid,'booking_economics',total-previous,day,'owner_confirmed',why); end if;
 update padova.bookings set financial_complete=true where id=bid;
end $function$;

CREATE OR REPLACE FUNCTION padova.historical_bookings(search text DEFAULT ''::text, page integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=padova.require_staff();result jsonb;begin
select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
select r.id,'historical_source' as record_type,raw->>'row' as source_row,raw->>'version' source_version,
raw->'values'->>0 customer_name,raw->'values'->>9 traveler_group,raw->'values'->>10 summary,
raw->'values'->3 source_sale,raw->'values'->5 source_cost,raw->'values'->>4 original_payment_notes,
raw->'values'->>11 booked_date_raw,raw->'values'->>12 travel_date_raw,
concat_ws(' · ',nullif(raw->'values'->>13,''),nullif(raw->'values'->>14,''),nullif(raw->'values'->>15,''),nullif(raw->'values'->>17,'')) confirmations,
raw->>'source_link' source_link,raw->'values'->>18 notes,raw,'unverified' verification
from padova_staging.evidence_records r join padova_staging.evidence_files f on f.id=r.file_id
where f.path='tables/source_rows.json' and raw->>'spreadsheet_id'='1fXs-g-BPHV087XLcoFk5KJAv5Fapme371kLoK4-bJCo'
and raw->>'version'='read_only_snapshot_2026-10-27' and raw->>'tab'='accounting' and (raw->>'row')::integer>1
and exists(select 1 from jsonb_array_elements(raw->'values') with ordinality v(value,n) where n in (1,4,6,10,11,14) and value not in ('null'::jsonb,'""'::jsonb))
and (search='' or raw::text ilike '%'||search||'%')
order by (raw->>'row')::integer limit 50 offset greatest(page,0)*50)t;return result;end $function$;

CREATE OR REPLACE FUNCTION padova.export_application_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t record;data jsonb;tables jsonb:='{}';cols jsonb;deps jsonb;begin
for t in select schemaname,tablename from pg_tables where schemaname in ('padova','padova_staging') and tablename<>'evidence_records' order by schemaname,tablename loop
 execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from %I.%I x',t.schemaname,t.tablename) into data;
 select jsonb_agg(column_name order by ordinal_position) into cols from information_schema.columns where table_schema=t.schemaname and table_name=t.tablename and is_generated='NEVER';
 select coalesce(jsonb_agg(distinct rn.nspname||'.'||rc.relname),'[]') into deps from pg_constraint c join pg_class lc on lc.oid=c.conrelid join pg_namespace ln on ln.oid=lc.relnamespace join pg_class rc on rc.oid=c.confrelid join pg_namespace rn on rn.oid=rc.relnamespace where c.contype='f' and ln.nspname=t.schemaname and lc.relname=t.tablename and c.conrelid<>c.confrelid;
 tables:=tables||jsonb_build_object(t.schemaname||'.'||t.tablename,jsonb_build_object('rows',data,'columns',cols,'dependencies',deps));
end loop;
return jsonb_build_object('format','padova_application_snapshot_v1','project','unugynfzmxjxifgofxjr','region','us-east-1','captured_at',now(),'tables',tables,'evidence_record_count',(select count(*) from padova_staging.evidence_records),'auth_user_count',(select count(*) from auth.users),'limitations','Application tables only. Auth provider state, infrastructure settings and attachment bytes excluded. Source evidence restored from exact hashed handoff plus exported row index.');
end $function$;

CREATE OR REPLACE FUNCTION padova.booking_detail(bid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=padova.require_staff();result jsonb:='{}';name text;data jsonb;begin
if not exists(select 1 from padova.bookings where id=bid) then raise exception 'Booking not found';end if;
foreach name in array array['charges','supplier_obligations','funding_components','supplier_refunds','customer_refunds','commissions','referral_terms','notes','attachments','itinerary_revisions','profit_movements'] loop
execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]'') from padova.%I t where booking_id=$1',name) into data using bid;
result:=result||jsonb_build_object(name,data);end loop;
return result||jsonb_build_object(
'travelers',(select coalesce(jsonb_agg(jsonb_build_object('id',bt.traveler_id,'name',p.display_name,'status',bt.status)),'[]') from padova.booking_travelers bt join padova.parties p on p.id=bt.traveler_id where bt.booking_id=bid),
'customer_payments',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'payer',p.display_name,'receipt',r.reference,'date',r.received_date,'method',r.method,'amount',a.amount)),'[]') from padova.receipt_allocations a join padova.receipts r on r.id=a.receipt_id join padova.parties p on p.id=r.payer_id where a.booking_id=bid),
'customer_refund_status',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from padova.customer_refund_status r where r.booking_id=bid),
'supplier_refund_status',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from padova.supplier_refund_status r where r.booking_id=bid));
end $function$;
CREATE VIEW padova."booking_summary" AS  SELECT id,
    customer_id,
    supplier_id,
    source_party_id,
    kind,
    status,
    booked_date,
    travel_date,
    end_date,
    summary,
    notes,
    version,
    verification,
    financial_complete,
    archived_at,
    created_at,
    ( SELECT sum(c.amount) AS sum
           FROM padova.charges c
          WHERE (c.booking_id = b.id)) AS customer_total,
        CASE
            WHEN (verification = 'owner_confirmed'::text) THEN COALESCE(( SELECT sum(a.amount) AS sum
               FROM (padova.receipt_allocations a
                 JOIN padova.receipts r ON ((r.id = a.receipt_id)))
              WHERE ((a.booking_id = b.id) AND (r.kind = 'customer'::text))), (0)::numeric)
            ELSE ( SELECT sum(a.amount) AS sum
               FROM (padova.receipt_allocations a
                 JOIN padova.receipts r ON ((r.id = a.receipt_id)))
              WHERE ((a.booking_id = b.id) AND (r.kind = 'customer'::text)))
        END AS customer_paid,
    ( SELECT sum(o.amount) AS sum
           FROM padova.supplier_obligations o
          WHERE (o.booking_id = b.id)) AS economic_supplier_cost,
        CASE
            WHEN financial_complete THEN COALESCE(( SELECT sum(p.amount) AS sum
               FROM padova.profit_movements p
              WHERE (p.booking_id = b.id)), (0)::numeric)
            ELSE NULL::numeric
        END AS current_profit
   FROM padova.bookings b;
CREATE VIEW padova."customer_refund_status" AS  SELECT id,
    booking_id,
    receipt_allocation_id,
    payee_id,
    due,
    paid,
    retained_fee,
    paid_date,
    method,
    reference,
    override_reason,
    created_at,
    (paid + ( SELECT COALESCE(sum(p.amount), (0)::numeric) AS "coalesce"
           FROM padova.customer_refund_payments p
          WHERE (p.refund_id = r.id))) AS total_paid
   FROM padova.customer_refunds r;
CREATE VIEW padova."supplier_refund_status" AS  SELECT id,
    booking_id,
    funding_id,
    expected,
    received,
    returned_kind,
    received_date,
    reference,
    requires_review,
    created_at,
    (received + ( SELECT COALESCE(sum(p.amount), (0)::numeric) AS "coalesce"
           FROM padova.supplier_refund_receipts p
          WHERE (p.refund_id = r.id))) AS total_received
   FROM padova.supplier_refunds r;
CREATE OR REPLACE FUNCTION public.padova_historical_directory(search text DEFAULT ''::text, page integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select padova.historical_directory(search,page)$function$;

CREATE OR REPLACE FUNCTION public.padova_manage_staff(email text, active boolean)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select padova.manage_staff(email,active)$function$;

CREATE OR REPLACE FUNCTION public.padova_activate_owner()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select padova.activate_owner()$function$;

CREATE OR REPLACE FUNCTION public.padova_references()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select padova.references_data()$function$;

CREATE OR REPLACE FUNCTION public.padova_command(action text, p jsonb, request_key uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select padova.command(action,p,request_key)$function$;

CREATE OR REPLACE FUNCTION public.padova_read(section text, search text DEFAULT ''::text, page integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select padova.read_data(section,search,page)$function$;

CREATE OR REPLACE FUNCTION public.padova_historical_bookings(search text DEFAULT ''::text, page integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select padova.historical_bookings(search,page)$function$;

CREATE OR REPLACE FUNCTION public.padova_booking_detail(bid uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select padova.booking_detail(bid)$function$;
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.staff FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.settings FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.parties FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.parties FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.party_relationships FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.party_relationships FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.party_relationships FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.corporate_rules FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.corporate_rules FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.corporate_rules FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.bookings FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.bookings FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.booking_travelers FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.booking_travelers FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.booking_travelers FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.confirmations FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.confirmations FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.confirmations FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.itinerary_revisions FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.itinerary_revisions FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.itinerary_revisions FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.charges FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.charges FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.charges FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.supplier_obligations FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.supplier_obligations FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.supplier_obligations FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.receipts FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.receipts FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.receipts FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.receipt_allocations FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.receipt_allocations FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.receipt_allocations FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.supplier_payments FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.supplier_payments FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.supplier_payments FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.supplier_allocations FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.supplier_allocations FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.supplier_allocations FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.assets FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.assets FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.assets FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.asset_movements FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.asset_movements FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.asset_movements FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.funding_components FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.funding_components FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.funding_components FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.supplier_refunds FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.supplier_refunds FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.supplier_refunds FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.customer_refunds FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.customer_refunds FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.customer_refunds FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.commissions FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.commissions FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.commissions FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.commission_allocations FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.commission_allocations FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.commission_allocations FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.referral_terms FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.referral_terms FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.referral_terms FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.referral_payments FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.referral_payments FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.referral_payments FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.profit_movements FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.profit_movements FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.profit_movements FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.attachments FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.attachments FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.attachments FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.notes FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.notes FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.notes FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.audit_events FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.audit_events FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.review_cases FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT OR UPDATE ON padova.review_cases FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.requests FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.asset_sales FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.asset_sales FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT ON padova.asset_sales FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.booking_expenses FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.booking_expenses FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT ON padova.booking_expenses FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.funding_reversals FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.funding_reversals FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT ON padova.funding_reversals FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER cumulative_refund_guard BEFORE INSERT ON padova.customer_refunds FOR EACH ROW EXECUTE FUNCTION padova.refund_guard();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.customer_refund_payments FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.customer_refund_payments FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT ON padova.customer_refund_payments FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE TRIGGER immutable_rows BEFORE DELETE OR UPDATE ON padova.supplier_refund_receipts FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON padova.supplier_refund_receipts FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER audit_rows AFTER INSERT ON padova.supplier_refund_receipts FOR EACH ROW EXECUTE FUNCTION padova.audit_change();
CREATE INDEX profit_movements_date_idx ON padova.profit_movements USING btree (effective_date);
CREATE INDEX receipt_allocations_receipt_idx ON padova.receipt_allocations USING btree (receipt_id);
CREATE INDEX bookings_customer_idx ON padova.bookings USING btree (customer_id);
CREATE INDEX asset_movements_asset_idx ON padova.asset_movements USING btree (asset_id);
CREATE INDEX receipts_ref_idx ON padova.receipts USING btree (reference);
CREATE INDEX bookings_date_idx ON padova.bookings USING btree (booked_date);
CREATE INDEX profit_movements_booking_idx ON padova.profit_movements USING btree (booking_id);
CREATE INDEX receipt_allocations_booking_idx ON padova.receipt_allocations USING btree (booking_id);
CREATE INDEX confirmations_ref_idx ON padova.confirmations USING btree (lower(reference));
ALTER TABLE padova."asset_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."asset_sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."booking_expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."booking_travelers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."charges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."commission_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."commissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."confirmations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."corporate_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."customer_refund_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."customer_refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."funding_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."funding_reversals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."itinerary_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."parties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."party_relationships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."profit_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."receipt_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."referral_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."referral_terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."review_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."supplier_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."supplier_obligations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."supplier_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."supplier_refund_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova."supplier_refunds" ENABLE ROW LEVEL SECURITY;
CREATE SCHEMA padova_staging;
CREATE TABLE padova_staging.import_batches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),label text NOT NULL UNIQUE,extracted_at timestamptz NOT NULL,source_root text NOT NULL,status text NOT NULL DEFAULT 'staged_unverified' CHECK(status='staged_unverified'),limitations text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE padova_staging.evidence_files(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),batch_id uuid NOT NULL REFERENCES padova_staging.import_batches(id),path text NOT NULL,sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),bytes bigint NOT NULL,media_review_status text NOT NULL,UNIQUE(batch_id,path,sha256));
CREATE TABLE padova_staging.evidence_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),file_id uuid NOT NULL REFERENCES padova_staging.evidence_files(id),record_index integer NOT NULL,raw jsonb NOT NULL,evidence_class text NOT NULL,UNIQUE(file_id,record_index));
CREATE TABLE padova_staging.migration_mappings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),evidence_record_id uuid NOT NULL REFERENCES padova_staging.evidence_records(id),target_table text,target_id uuid,decision text NOT NULL CONSTRAINT migration_mappings_decision_check CHECK (decision IN ('proposed','accepted','rejected','superseded')),rationale text NOT NULL,actor uuid,created_at timestamptz NOT NULL DEFAULT now());
