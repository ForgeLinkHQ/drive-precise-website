/**
 * Database types.
 *
 * Hand-written to match supabase/migrations, and deliberately narrower than a
 * `supabase gen types` dump: only the tables, views and functions this app
 * actually touches appear here. Regenerate with the CLI once the project is
 * linked to a real Supabase instance — the shapes below are the contract the
 * app is written against and should match what the generator produces.
 *
 * Every row shape below is a `type`, never an `interface`, and that is
 * load-bearing rather than stylistic. postgrest-js constrains each table to
 * `Record<string, unknown>`, and TypeScript grants an implicit index signature
 * to type aliases but not to interfaces. Declared as an interface, the schema
 * quietly fails that constraint, `Database` degrades to `never`, and every
 * query and RPC in the app loses its types without a single error pointing
 * here — the failures surface as "not assignable to parameter of type
 * 'undefined'" at the call sites instead.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type ServiceRow = {
  id: string;
  name: string;
  category: string;
  short_description: string;
  description: string;
  includes: Json;
  pricing: string;
  price_gbp: number | string | null;
  price_suffix: string | null;
  price_confirmed: boolean;
  compare_price_gbp: number | string | null;
  duration_minutes: number | null;
  mobile: string;
  workshop_recommended: boolean;
  collection_available: boolean;
  requires_parts_quote: boolean;
  add_ons: Json;
  incompatible_with: Json;
  suggests_partner: Json;
  seasons: Json;
  also_in: Json;
  customer_type: string;
  mod_stream: string | null;
  add_on_only: boolean;
  featured: boolean;
  sort_order: number;
  is_active: boolean;
  inactive_reason: string | null;
  parts_cost_gbp: number | string | null;
  consumables_cost_gbp: number | string | null;
  labour_allocation_mins: number | null;
  travel_minutes: number | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

/** What `get_public_services()` returns — no cost or margin columns (§60). */
export type PublicServiceRow = Omit<
  ServiceRow,
  | "price_confirmed"
  | "is_active"
  | "inactive_reason"
  | "parts_cost_gbp"
  | "consumables_cost_gbp"
  | "labour_allocation_mins"
  | "travel_minutes"
  | "internal_notes"
  | "created_at"
  | "updated_at"
>;

export type PackageRow = {
  id: string;
  name: string;
  short_description: string;
  description: string;
  includes: Json;
  also_includes: Json;
  pricing: string;
  price_gbp: number | string | null;
  price_confirmed: boolean;
  duration_minutes: number | null;
  seasons: Json;
  customer_type: string;
  featured: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PublicPackageRow = Omit<
  PackageRow,
  "price_confirmed" | "is_active" | "created_at" | "updated_at"
>;

export type EnquiryRow = {
  id: string;
  reference: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  registration: string;
  mileage: number | null;
  vehicle_notes: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_variant: string | null;
  vehicle_year: number | null;
  vehicle_fuel: string | null;
  vehicle_engine: string | null;
  items: Json;
  indicative_total_gbp: number | string;
  has_from_pricing: boolean;
  quote_only_count: number;
  postcode: string | null;
  service_location: string | null;
  preferred_date: string | null;
  preferred_window: string | null;
  customer_notes: string | null;
  referral_source: string | null;
  campaign: string | null;
  status: string;
  quoted_total_gbp: number | string | null;
  lost_reason: string | null;
  admin_notes: string | null;
  techman_reference: string | null;
  created_at: string;
  updated_at: string;
  contacted_at: string | null;
  quoted_at: string | null;
  booked_at: string | null;
  completed_at: string | null;
};

export type TradeEnquiryRow = {
  id: string;
  reference: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  business_postcode: string | null;
  website: string | null;
  operation_type: string | null;
  vehicles_per_month: string | null;
  services_required: Json;
  has_ramp: boolean | null;
  typical_stock: string | null;
  notes: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignRow = {
  id: string;
  name: string;
  headline: string;
  body: string | null;
  cta_label: string | null;
  cta_service_id: string | null;
  cta_package_id: string | null;
  cta_path: string | null;
  tracking_code: string | null;
  starts_on: string;
  ends_on: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ActiveCampaignRow = Pick<
  CampaignRow,
  | "id"
  | "headline"
  | "body"
  | "cta_label"
  | "cta_service_id"
  | "cta_package_id"
  | "cta_path"
  | "tracking_code"
>;

export type PartnerRow = {
  id: string;
  business_name: string;
  category: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  postcode: string | null;
  services: Json;
  trade_arrangement: string | null;
  commission_type: string | null;
  commission_value: number | string | null;
  is_active: boolean;
  internal_notes: string | null;
  website: string | null;
  public_summary: string | null;
  /** Has this business agreed to be named publicly? Defaults false. */
  is_publicly_listed: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * A partner as a browser may see one.
 *
 * Deliberately built by naming the five safe columns rather than by `Omit`ing
 * the unsafe ones. An Omit silently re-exposes anything added to PartnerRow
 * later; this cannot. `commission_value`, `trade_arrangement` and
 * `internal_notes` are Drive Precise's negotiated position with each business
 * and must never reach the client.
 */
export type PublicPartnerRow = {
  business_name: string;
  category: string;
  location: string | null;
  website: string | null;
  public_summary: string | null;
};

export type PartnerReferralRow = {
  id: string;
  partner_id: string | null;
  enquiry_id: string | null;
  registration: string | null;
  service_category: string;
  service_note: string | null;
  status: string;
  referred_at: string | null;
  customer_spend_gbp: number | string | null;
  commission_gbp: number | string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      services: {
        Row: ServiceRow;
        Insert: Partial<ServiceRow> & Pick<ServiceRow, "id" | "name" | "category" | "pricing">;
        Update: Partial<ServiceRow>;
        Relationships: [];
      };
      service_packages: {
        Row: PackageRow;
        Insert: Partial<PackageRow> & Pick<PackageRow, "id" | "name" | "pricing">;
        Update: Partial<PackageRow>;
        Relationships: [];
      };
      enquiries: {
        Row: EnquiryRow;
        // Inserts go through create_enquiry(); there is no anon INSERT policy
        // on this table and admin never creates one by hand.
        Insert: never;
        Update: Partial<EnquiryRow>;
        Relationships: [];
      };
      trade_enquiries: {
        Row: TradeEnquiryRow;
        Insert: never;
        Update: Partial<TradeEnquiryRow>;
        Relationships: [];
      };
      campaigns: {
        Row: CampaignRow;
        Insert: Partial<CampaignRow> &
          Pick<CampaignRow, "name" | "headline" | "starts_on" | "ends_on">;
        Update: Partial<CampaignRow>;
        Relationships: [];
      };
      partners: {
        Row: PartnerRow;
        Insert: Partial<PartnerRow> & Pick<PartnerRow, "business_name" | "category">;
        Update: Partial<PartnerRow>;
        Relationships: [];
      };
      partner_referrals: {
        Row: PartnerReferralRow;
        Insert: Partial<PartnerReferralRow> & Pick<PartnerReferralRow, "service_category">;
        Update: Partial<PartnerReferralRow>;
        Relationships: [];
      };
      user_roles: {
        Row: { user_id: string; role: string; created_at: string };
        Insert: { user_id: string; role: string };
        Update: Partial<{ user_id: string; role: string }>;
        Relationships: [];
      };
    };
    Views: {
      enquiry_funnel_daily: {
        Row: {
          day: string;
          enquiries: number;
          contacted: number;
          quoted: number;
          booked: number;
          completed: number;
          lost: number;
          avg_initial_basket_gbp: number | string | null;
          avg_quoted_gbp: number | string | null;
        };
        Relationships: [];
      };
      service_attachment: {
        Row: {
          service_id: string | null;
          service_name: string | null;
          times_requested: number;
          times_booked: number;
          booked_rate_pct: number | string | null;
        };
        Relationships: [];
      };
      partner_referral_summary: {
        Row: {
          partner_id: string;
          business_name: string;
          category: string;
          referrals: number;
          converted: number;
          customer_spend_gbp: number | string;
          commission_received_gbp: number | string;
          commission_outstanding_gbp: number | string;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_public_services: {
        Args: Record<string, never>;
        Returns: PublicServiceRow[];
      };
      get_public_packages: {
        Args: Record<string, never>;
        Returns: PublicPackageRow[];
      };
      get_active_campaign: {
        Args: Record<string, never>;
        Returns: ActiveCampaignRow[];
      };
      create_enquiry: {
        Args: {
          _customer_name: string;
          _customer_phone: string;
          _customer_email: string | null;
          _registration: string;
          _mileage: number | null;
          _vehicle_notes: string | null;
          _items: Json;
          _indicative_total_gbp: number;
          _has_from_pricing: boolean;
          _quote_only_count: number;
          _postcode: string | null;
          _service_location: string | null;
          _preferred_date: string | null;
          _preferred_window: string | null;
          _customer_notes: string | null;
          _referral_source: string | null;
          _campaign: string | null;
          // Optional in Postgres, so optional here: an unconfigured lookup
          // simply omits them.
          _vehicle_make?: string | null;
          _vehicle_model?: string | null;
          _vehicle_variant?: string | null;
          _vehicle_year?: number | null;
          _vehicle_fuel?: string | null;
          _vehicle_engine?: string | null;
        };
        Returns: string;
      };
      get_public_partners: {
        Args: Record<string, never>;
        Returns: PublicPartnerRow[];
      };
      create_trade_enquiry: {
        Args: {
          _business_name: string;
          _contact_name: string;
          _email: string;
          _phone: string;
          _business_postcode: string | null;
          _website: string | null;
          _operation_type: string | null;
          _vehicles_per_month: string | null;
          _services_required: Json;
          _has_ramp: boolean | null;
          _typical_stock: string | null;
          _notes: string | null;
        };
        Returns: string;
      };
      record_site_event: {
        Args: {
          _name: string;
          _session_key: string;
          _path: string | null;
          _device: string | null;
          _item_id: string | null;
          _basket_value_gbp: number | null;
          _item_count: number | null;
          _referral_source: string | null;
          _utm_source: string | null;
          _utm_medium: string | null;
          _utm_campaign: string | null;
          _meta: Json;
        };
        Returns: void;
      };
      has_admin_role: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
