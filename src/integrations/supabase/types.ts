export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_bonuses: {
        Row: {
          bonus_type: string
          created_at: string
          days_granted: number
          granted_by: string | null
          id: string
          partner_trial_id: string | null
          period_end: string
          period_start: string
          previous_ends_at: string | null
          reason: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          store_id: string | null
          subscription_id: string | null
          target_email: string
          user_id: string | null
        }
        Insert: {
          bonus_type: string
          created_at?: string
          days_granted: number
          granted_by?: string | null
          id?: string
          partner_trial_id?: string | null
          period_end: string
          period_start: string
          previous_ends_at?: string | null
          reason: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          store_id?: string | null
          subscription_id?: string | null
          target_email: string
          user_id?: string | null
        }
        Update: {
          bonus_type?: string
          created_at?: string
          days_granted?: number
          granted_by?: string | null
          id?: string
          partner_trial_id?: string | null
          period_end?: string
          period_start?: string
          previous_ends_at?: string | null
          reason?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          store_id?: string | null
          subscription_id?: string | null
          target_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_bonuses_partner_trial_id_fkey"
            columns: ["partner_trial_id"]
            isOneToOne: false
            referencedRelation: "partner_trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_bonuses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_bonuses_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_master_profile: {
        Row: {
          granted_at: string
          granted_by: string | null
          is_super: boolean
          notes: string | null
          permissions: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          is_super?: boolean
          notes?: string | null
          permissions?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          is_super?: boolean
          notes?: string | null
          permissions?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          store_id: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          store_id: string
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          store_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      asaas_settings: {
        Row: {
          account_email: string | null
          api_key_set: boolean
          connection_status: string | null
          created_at: string
          environment: string
          id: string
          last_tested_at: string | null
          updated_at: string
          wallet_id: string | null
          webhook_token_set: boolean
        }
        Insert: {
          account_email?: string | null
          api_key_set?: boolean
          connection_status?: string | null
          created_at?: string
          environment?: string
          id?: string
          last_tested_at?: string | null
          updated_at?: string
          wallet_id?: string | null
          webhook_token_set?: boolean
        }
        Update: {
          account_email?: string | null
          api_key_set?: boolean
          connection_status?: string | null
          created_at?: string
          environment?: string
          id?: string
          last_tested_at?: string | null
          updated_at?: string
          wallet_id?: string | null
          webhook_token_set?: boolean
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity: string | null
          entity_id: string | null
          id: string
          ip: string | null
          module: string | null
          new_value: Json | null
          old_value: Json | null
          role: string | null
          screen: string | null
          status: string | null
          store_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          module?: string | null
          new_value?: Json | null
          old_value?: Json | null
          role?: string | null
          screen?: string | null
          status?: string | null
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          module?: string | null
          new_value?: Json | null
          old_value?: Json | null
          role?: string | null
          screen?: string | null
          status?: string | null
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          reason: string
          session_id: string
          store_id: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          id?: string
          reason: string
          session_id: string
          store_id: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          reason?: string
          session_id?: string
          store_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          counted_cash: number | null
          created_at: string
          difference: number | null
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_amount: number
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          created_at?: string
          difference?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_amount?: number
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          created_at?: string
          difference?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_amount?: number
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_entries: {
        Row: {
          base_amount: number
          commission_amount: number
          created_at: string
          expense_id: string | null
          id: string
          notes: string | null
          origin: string
          os_id: string | null
          paid_at: string | null
          rule_id: string | null
          sale_id: string | null
          status: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_amount?: number
          commission_amount?: number
          created_at?: string
          expense_id?: string | null
          id?: string
          notes?: string | null
          origin: string
          os_id?: string | null
          paid_at?: string | null
          rule_id?: string | null
          sale_id?: string | null
          status?: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_amount?: number
          commission_amount?: number
          created_at?: string
          expense_id?: string | null
          id?: string
          notes?: string | null
          origin?: string
          os_id?: string | null
          paid_at?: string | null
          rule_id?: string | null
          sale_id?: string | null
          status?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_entries_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          applies_to: string
          base: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          scope: string
          scope_ref: string | null
          store_id: string
          type: string
          updated_at: string
          value: number
        }
        Insert: {
          applies_to: string
          base: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          scope: string
          scope_ref?: string | null
          store_id: string
          type: string
          updated_at?: string
          value: number
        }
        Update: {
          applies_to?: string
          base?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          scope?: string
          scope_ref?: string | null
          store_id?: string
          type?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_code: string
          coupon_id: string
          created_at: string
          customer_email: string | null
          discount_cents: number
          id: string
          original_cents: number | null
          store_id: string | null
          subscription_id: string | null
        }
        Insert: {
          coupon_code: string
          coupon_id: string
          created_at?: string
          customer_email?: string | null
          discount_cents: number
          id?: string
          original_cents?: number | null
          store_id?: string | null
          subscription_id?: string | null
        }
        Update: {
          coupon_code?: string
          coupon_id?: string
          created_at?: string
          customer_email?: string | null
          discount_cents?: number
          id?: string
          original_cents?: number | null
          store_id?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          discount_type: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value: number
          id: string
          partner_label: string | null
          times_used: number
          updated_at: string
          usage_limit: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          discount_type: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value: number
          id?: string
          partner_label?: string | null
          times_used?: number
          updated_at?: string
          usage_limit?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          discount_type?: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value?: number
          id?: string
          partner_label?: string | null
          times_used?: number
          updated_at?: string
          usage_limit?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_street: string | null
          address_uf: string | null
          address_zip: string | null
          birthdate: string | null
          created_at: string
          doc_type: string | null
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          store_id: string
          tags: string[] | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_street?: string | null
          address_uf?: string | null
          address_zip?: string | null
          birthdate?: string | null
          created_at?: string
          doc_type?: string | null
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          store_id: string
          tags?: string[] | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_street?: string | null
          address_uf?: string | null
          address_zip?: string | null
          birthdate?: string | null
          created_at?: string
          doc_type?: string | null
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string
          tags?: string[] | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_leads: {
        Row: {
          city: string | null
          company: string | null
          contacted: boolean
          contacted_at: string | null
          created_at: string
          created_by: string | null
          fbclid: string | null
          id: string
          instagram: string
          kind: string
          name: string
          notes: string | null
          referral_code: string | null
          referrer: string | null
          state: string | null
          status: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          whatsapp: string
        }
        Insert: {
          city?: string | null
          company?: string | null
          contacted?: boolean
          contacted_at?: string | null
          created_at?: string
          created_by?: string | null
          fbclid?: string | null
          id?: string
          instagram: string
          kind?: string
          name: string
          notes?: string | null
          referral_code?: string | null
          referrer?: string | null
          state?: string | null
          status?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          whatsapp: string
        }
        Update: {
          city?: string | null
          company?: string | null
          contacted?: boolean
          contacted_at?: string | null
          created_at?: string
          created_by?: string | null
          fbclid?: string | null
          id?: string
          instagram?: string
          kind?: string
          name?: string
          notes?: string | null
          referral_code?: string | null
          referrer?: string | null
          state?: string | null
          status?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          whatsapp?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_system: boolean
          name: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean
          name: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean
          name?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          category_name: string
          cost_center: string | null
          created_at: string
          created_by: string | null
          description: string
          expense_date: string
          id: string
          notes: string | null
          payment_method: string
          receipt_url: string | null
          store_id: string
          subcategory: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          category_name: string
          cost_center?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          expense_date?: string
          id?: string
          notes?: string | null
          payment_method: string
          receipt_url?: string | null
          store_id: string
          subcategory?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          category_name?: string
          cost_center?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          expense_date?: string
          id?: string
          notes?: string | null
          payment_method?: string
          receipt_url?: string | null
          store_id?: string
          subcategory?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          cidade: string | null
          created_at: string
          id: string
          nome: string
          nome_loja: string | null
          origem_pagina: string | null
          status: string
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          whatsapp: string
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          id?: string
          nome: string
          nome_loja?: string | null
          origem_pagina?: string | null
          status?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp: string
        }
        Update: {
          cidade?: string | null
          created_at?: string
          id?: string
          nome?: string
          nome_loja?: string | null
          origem_pagina?: string | null
          status?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp?: string
        }
        Relationships: []
      }
      marketing_investments: {
        Row: {
          ad: string | null
          adset: string | null
          amount_cents: number
          campaign: string | null
          channel: string
          clicks: number
          created_at: string
          created_by: string | null
          id: string
          impressions: number
          notes: string | null
          reach: number
          reference_date: string
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          ad?: string | null
          adset?: string | null
          amount_cents?: number
          campaign?: string | null
          channel?: string
          clicks?: number
          created_at?: string
          created_by?: string | null
          id?: string
          impressions?: number
          notes?: string | null
          reach?: number
          reference_date?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          ad?: string | null
          adset?: string | null
          amount_cents?: number
          campaign?: string | null
          channel?: string
          clicks?: number
          created_at?: string
          created_by?: string | null
          id?: string
          impressions?: number
          notes?: string | null
          reach?: number
          reference_date?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      marketing_settings: {
        Row: {
          id: number
          meta_access_token: string | null
          meta_pixel_id: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          meta_access_token?: string | null
          meta_pixel_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          meta_access_token?: string | null
          meta_pixel_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      meta_pixel_events: {
        Row: {
          capi_response: Json | null
          capi_status: number | null
          created_at: string
          currency: string | null
          custom_data: Json | null
          email_hash: string | null
          event_id: string
          event_name: string
          event_source_url: string | null
          fbc: string | null
          fbp: string | null
          id: string
          ip: string | null
          landing_path: string | null
          phone_hash: string | null
          referrer: string | null
          session_id: string | null
          source: string
          test_event_code: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          value: number | null
        }
        Insert: {
          capi_response?: Json | null
          capi_status?: number | null
          created_at?: string
          currency?: string | null
          custom_data?: Json | null
          email_hash?: string | null
          event_id: string
          event_name: string
          event_source_url?: string | null
          fbc?: string | null
          fbp?: string | null
          id?: string
          ip?: string | null
          landing_path?: string | null
          phone_hash?: string | null
          referrer?: string | null
          session_id?: string | null
          source: string
          test_event_code?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          value?: number | null
        }
        Update: {
          capi_response?: Json | null
          capi_status?: number | null
          created_at?: string
          currency?: string | null
          custom_data?: Json | null
          email_hash?: string | null
          event_id?: string
          event_name?: string
          event_source_url?: string | null
          fbc?: string | null
          fbp?: string | null
          id?: string
          ip?: string | null
          landing_path?: string | null
          phone_hash?: string | null
          referrer?: string | null
          session_id?: string | null
          source?: string
          test_event_code?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          value?: number | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          notify_bill_due: boolean
          notify_low_stock: boolean
          notify_monthly_report: boolean
          notify_new_sale: boolean
          notify_new_service: boolean
          push_enabled: boolean
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notify_bill_due?: boolean
          notify_low_stock?: boolean
          notify_monthly_report?: boolean
          notify_new_sale?: boolean
          notify_new_service?: boolean
          push_enabled?: boolean
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          notify_bill_due?: boolean
          notify_low_stock?: boolean
          notify_monthly_report?: boolean
          notify_new_sale?: boolean
          notify_new_service?: boolean
          push_enabled?: boolean
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      os_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: Database["public"]["Enums"]["os_status"] | null
          id: string
          os_id: string
          store_id: string
          to_status: Database["public"]["Enums"]["os_status"] | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["os_status"] | null
          id?: string
          os_id: string
          store_id: string
          to_status?: Database["public"]["Enums"]["os_status"] | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["os_status"] | null
          id?: string
          os_id?: string
          store_id?: string
          to_status?: Database["public"]["Enums"]["os_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "os_status_history_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      page_visits: {
        Row: {
          created_at: string
          id: string
          path: string
          referrer: string | null
          session_id: string | null
          store_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          path: string
          referrer?: string | null
          session_id?: string | null
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          path?: string
          referrer?: string | null
          session_id?: string | null
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_visits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_trials: {
        Row: {
          activated_at: string | null
          city: string | null
          created_at: string
          email: string
          full_access_ends_at: string | null
          full_access_granted_at: string | null
          full_access_months: number
          full_name: string | null
          id: string
          instagram: string | null
          invite_link: string | null
          invited_at: string
          invited_by: string | null
          kind: string
          notes: string | null
          state: string | null
          status: string
          store_name: string | null
          trial_days: number
          trial_ends_at: string | null
          updated_at: string
          user_id: string | null
          whatsapp: string | null
        }
        Insert: {
          activated_at?: string | null
          city?: string | null
          created_at?: string
          email: string
          full_access_ends_at?: string | null
          full_access_granted_at?: string | null
          full_access_months?: number
          full_name?: string | null
          id?: string
          instagram?: string | null
          invite_link?: string | null
          invited_at?: string
          invited_by?: string | null
          kind?: string
          notes?: string | null
          state?: string | null
          status?: string
          store_name?: string | null
          trial_days?: number
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          activated_at?: string | null
          city?: string | null
          created_at?: string
          email?: string
          full_access_ends_at?: string | null
          full_access_granted_at?: string | null
          full_access_months?: number
          full_name?: string | null
          id?: string
          instagram?: string | null
          invite_link?: string | null
          invited_at?: string
          invited_by?: string | null
          kind?: string
          notes?: string | null
          state?: string | null
          status?: string
          store_name?: string | null
          trial_days?: number
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      parts_inventory: {
        Row: {
          brand: string | null
          category: Database["public"]["Enums"]["part_category"]
          category_other: string | null
          compatible_models: string | null
          cost_price: number
          created_at: string
          id: string
          is_tool: boolean
          location: string | null
          name: string
          notes: string | null
          sale_price: number
          sku: string | null
          stock_current: number
          stock_min: number
          store_id: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category: Database["public"]["Enums"]["part_category"]
          category_other?: string | null
          compatible_models?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          is_tool?: boolean
          location?: string | null
          name: string
          notes?: string | null
          sale_price?: number
          sku?: string | null
          stock_current?: number
          stock_min?: number
          store_id: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category?: Database["public"]["Enums"]["part_category"]
          category_other?: string | null
          compatible_models?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          is_tool?: boolean
          location?: string | null
          name?: string
          notes?: string | null
          sale_price?: number
          sku?: string | null
          stock_current?: number
          stock_min?: number
          store_id?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_inventory_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_sales: {
        Row: {
          created_at: string
          customer_doc: string | null
          customer_name: string | null
          customer_whatsapp: string | null
          discount: number
          id: string
          installments: number | null
          net_value: number | null
          net_value_reason: string | null
          notes: string | null
          part_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          qty: number
          seller_id: string | null
          store_id: string
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          customer_doc?: string | null
          customer_name?: string | null
          customer_whatsapp?: string | null
          discount?: number
          id?: string
          installments?: number | null
          net_value?: number | null
          net_value_reason?: string | null
          notes?: string | null
          part_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          qty?: number
          seller_id?: string | null
          store_id: string
          total?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          customer_doc?: string | null
          customer_name?: string | null
          customer_whatsapp?: string | null
          discount?: number
          id?: string
          installments?: number | null
          net_value?: number | null
          net_value_reason?: string | null
          notes?: string | null
          part_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          qty?: number
          seller_id?: string | null
          store_id?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "parts_sales_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_logs: {
        Row: {
          action: string | null
          amount_cents: number | null
          asaas_payload: Json | null
          created_at: string
          event_type: string
          id: string
          status: string | null
          subscription_id: string | null
        }
        Insert: {
          action?: string | null
          amount_cents?: number | null
          asaas_payload?: Json | null
          created_at?: string
          event_type: string
          id?: string
          status?: string | null
          subscription_id?: string | null
        }
        Update: {
          action?: string | null
          amount_cents?: number | null
          asaas_payload?: Json | null
          created_at?: string
          event_type?: string
          id?: string
          status?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_sync_audits: {
        Row: {
          created_at: string
          csv_data: string | null
          divergences: Json
          divergences_count: number
          filename: string
          id: string
          inserted_count: number
          notes: string | null
          ok_count: number
          store_id: string
          total_db_items: number
          total_pdf_items: number
          total_units_db: number
          total_units_pdf: number
          updated_count: number
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          csv_data?: string | null
          divergences?: Json
          divergences_count?: number
          filename: string
          id?: string
          inserted_count?: number
          notes?: string | null
          ok_count?: number
          store_id: string
          total_db_items?: number
          total_pdf_items?: number
          total_units_db?: number
          total_units_pdf?: number
          updated_count?: number
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          csv_data?: string | null
          divergences?: Json
          divergences_count?: number
          filename?: string
          id?: string
          inserted_count?: number
          notes?: string | null
          ok_count?: number
          store_id?: string
          total_db_items?: number
          total_pdf_items?: number
          total_units_db?: number
          total_units_pdf?: number
          updated_count?: number
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdf_sync_audits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      phonee_smoke_test_runs: {
        Row: {
          checks: Json
          created_at: string
          failed_checks: Json | null
          id: string
          pass: boolean
          ran_at: string
          run_by: string | null
          source: string
        }
        Insert: {
          checks: Json
          created_at?: string
          failed_checks?: Json | null
          id?: string
          pass: boolean
          ran_at?: string
          run_by?: string | null
          source?: string
        }
        Update: {
          checks?: Json
          created_at?: string
          failed_checks?: Json | null
          id?: string
          pass?: boolean
          ran_at?: string
          run_by?: string | null
          source?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          duration_months: number | null
          id: string
          max_installments: number
          name: string
          price_cents: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          duration_months?: number | null
          id?: string
          max_installments?: number
          name: string
          price_cents: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          duration_months?: number | null
          id?: string
          max_installments?: number
          name?: string
          price_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_transfers: {
        Row: {
          created_at: string
          from_product_id: string
          from_store_id: string
          id: string
          note: string | null
          quantity: number
          to_product_id: string | null
          to_store_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          from_product_id: string
          from_store_id: string
          id?: string
          note?: string | null
          quantity: number
          to_product_id?: string | null
          to_store_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          from_product_id?: string
          from_store_id?: string
          id?: string
          note?: string | null
          quantity?: number
          to_product_id?: string | null
          to_store_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_transfers_from_product_id_fkey"
            columns: ["from_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_transfers_from_store_id_fkey"
            columns: ["from_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_transfers_to_product_id_fkey"
            columns: ["to_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_transfers_to_store_id_fkey"
            columns: ["to_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category: Database["public"]["Enums"]["product_category"]
          compatible_model: string | null
          condition: Database["public"]["Enums"]["product_condition"]
          cost_price: number
          created_at: string
          data_entrada: string
          ean: string | null
          id: string
          last_sold_at: string | null
          location: string | null
          name: string
          photos: string[] | null
          sale_price: number
          sku: string | null
          status: Database["public"]["Enums"]["product_status"]
          stock_current: number
          stock_max: number
          stock_min: number
          store_id: string
          subcategory: string | null
          supplier: string | null
          updated_at: string
          visible_in_catalog: boolean
        }
        Insert: {
          brand?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          compatible_model?: string | null
          condition?: Database["public"]["Enums"]["product_condition"]
          cost_price?: number
          created_at?: string
          data_entrada?: string
          ean?: string | null
          id?: string
          last_sold_at?: string | null
          location?: string | null
          name: string
          photos?: string[] | null
          sale_price?: number
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          stock_current?: number
          stock_max?: number
          stock_min?: number
          store_id: string
          subcategory?: string | null
          supplier?: string | null
          updated_at?: string
          visible_in_catalog?: boolean
        }
        Update: {
          brand?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          compatible_model?: string | null
          condition?: Database["public"]["Enums"]["product_condition"]
          cost_price?: number
          created_at?: string
          data_entrada?: string
          ean?: string | null
          id?: string
          last_sold_at?: string | null
          location?: string | null
          name?: string
          photos?: string[] | null
          sale_price?: number
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          stock_current?: number
          stock_max?: number
          stock_min?: number
          store_id?: string
          subcategory?: string | null
          supplier?: string | null
          updated_at?: string
          visible_in_catalog?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          pix_key: string | null
          pix_type: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          pix_key?: string | null
          pix_type?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          pix_key?: string | null
          pix_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          sku: string | null
          total: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          sku?: string | null
          total?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sku?: string | null
          total?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          due_date: string | null
          expected_delivery_at: string | null
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_status: string
          received_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["purchase_order_status"]
          store_id: string
          supplier: string
          supplier_id: string | null
          tags: string[]
          total_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          expected_delivery_at?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          received_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          store_id: string
          supplier: string
          supplier_id?: string | null
          tags?: string[]
          total_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          expected_delivery_at?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          received_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          store_id?: string
          supplier?: string
          supplier_id?: string | null
          tags?: string[]
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          store_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          store_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      receivable_payments: {
        Row: {
          amount: number
          cash_session_id: string | null
          created_at: string
          id: string
          method: string
          notes: string | null
          receivable_id: string
          received_at: string
          received_by: string | null
          sale_id: string
          store_id: string
        }
        Insert: {
          amount: number
          cash_session_id?: string | null
          created_at?: string
          id?: string
          method: string
          notes?: string | null
          receivable_id: string
          received_at?: string
          received_by?: string | null
          sale_id: string
          store_id: string
        }
        Update: {
          amount?: number
          cash_session_id?: string | null
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          receivable_id?: string
          received_at?: string
          received_by?: string | null
          sale_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivable_payments_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_payments_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "sale_receivables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_credits: {
        Row: {
          amount_cents: number
          available_at: string
          created_at: string
          id: string
          notes: string | null
          referral_id: string | null
          subscription_id: string | null
          type: Database["public"]["Enums"]["referral_credit_type"]
          user_id: string
        }
        Insert: {
          amount_cents: number
          available_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          referral_id?: string | null
          subscription_id?: string | null
          type: Database["public"]["Enums"]["referral_credit_type"]
          user_id: string
        }
        Update: {
          amount_cents?: number
          available_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          referral_id?: string | null
          subscription_id?: string | null
          type?: Database["public"]["Enums"]["referral_credit_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_credits_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_credits_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          bonus_cents: number
          converted_at: string | null
          created_at: string
          id: string
          referral_code: string
          referred_email: string | null
          referred_store_id: string | null
          referred_subscription_id: string | null
          referrer_user_id: string
          status: Database["public"]["Enums"]["referral_status"]
          updated_at: string
        }
        Insert: {
          bonus_cents?: number
          converted_at?: string | null
          created_at?: string
          id?: string
          referral_code: string
          referred_email?: string | null
          referred_store_id?: string | null
          referred_subscription_id?: string | null
          referrer_user_id: string
          status?: Database["public"]["Enums"]["referral_status"]
          updated_at?: string
        }
        Update: {
          bonus_cents?: number
          converted_at?: string | null
          created_at?: string
          id?: string
          referral_code?: string
          referred_email?: string | null
          referred_store_id?: string | null
          referred_subscription_id?: string | null
          referrer_user_id?: string
          status?: Database["public"]["Enums"]["referral_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_store_id_fkey"
            columns: ["referred_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_subscription_id_fkey"
            columns: ["referred_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          action: string
          allowed: boolean
          created_at: string
          id: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
          updated_at: string
        }
        Insert: {
          action: string
          allowed?: boolean
          created_at?: string
          id?: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
          updated_at?: string
        }
        Update: {
          action?: string
          allowed?: boolean
          created_at?: string
          id?: string
          module?: string
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          brand: string | null
          category: string | null
          description: string | null
          discount_amount: number
          id: string
          imei_serial: string | null
          is_service: boolean
          model: string | null
          name: string | null
          product_id: string | null
          public_notes: string | null
          quantity: number
          sale_id: string
          sku: string | null
          total: number
          unit: string | null
          unit_cost: number
          unit_price: number
          warranty_days: number | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          description?: string | null
          discount_amount?: number
          id?: string
          imei_serial?: string | null
          is_service?: boolean
          model?: string | null
          name?: string | null
          product_id?: string | null
          public_notes?: string | null
          quantity?: number
          sale_id: string
          sku?: string | null
          total: number
          unit?: string | null
          unit_cost?: number
          unit_price: number
          warranty_days?: number | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          description?: string | null
          discount_amount?: number
          id?: string
          imei_serial?: string | null
          is_service?: boolean
          model?: string | null
          name?: string | null
          product_id?: string | null
          public_notes?: string | null
          quantity?: number
          sale_id?: string
          sku?: string | null
          total?: number
          unit?: string | null
          unit_cost?: number
          unit_price?: number
          warranty_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          installments: number | null
          method: string
          notes: string | null
          sale_id: string
          store_id: string
          trade_in_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          installments?: number | null
          method: string
          notes?: string | null
          sale_id: string
          store_id: string
          trade_in_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          installments?: number | null
          method?: string
          notes?: string | null
          sale_id?: string
          store_id?: string
          trade_in_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_trade_in_id_fkey"
            columns: ["trade_in_id"]
            isOneToOne: false
            referencedRelation: "trade_ins"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_receivables: {
        Row: {
          amount: number
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_whatsapp: string | null
          due_date: string
          id: string
          installment_number: number
          notes: string | null
          paid_amount: number
          paid_at: string | null
          renegotiated_from: string | null
          sale_id: string
          status: string
          store_id: string
          total_installments: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_whatsapp?: string | null
          due_date: string
          id?: string
          installment_number: number
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          renegotiated_from?: string | null
          sale_id: string
          status?: string
          store_id: string
          total_installments: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_whatsapp?: string | null
          due_date?: string
          id?: string
          installment_number?: number
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          renegotiated_from?: string | null
          sale_id?: string
          status?: string
          store_id?: string
          total_installments?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_receivables_renegotiated_from_fkey"
            columns: ["renegotiated_from"]
            isOneToOne: false
            referencedRelation: "sale_receivables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_receivables_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_receivables_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_return_items: {
        Row: {
          created_at: string
          defect_note: string | null
          id: string
          product_id: string | null
          quantity: number
          restock: boolean
          return_id: string
          sale_item_id: string
          unit_value: number
          warranty_os_id: string | null
        }
        Insert: {
          created_at?: string
          defect_note?: string | null
          id?: string
          product_id?: string | null
          quantity: number
          restock?: boolean
          return_id: string
          sale_item_id: string
          unit_value?: number
          warranty_os_id?: string | null
        }
        Update: {
          created_at?: string
          defect_note?: string | null
          id?: string
          product_id?: string | null
          quantity?: number
          restock?: boolean
          return_id?: string
          sale_item_id?: string
          unit_value?: number
          warranty_os_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sale_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_returns: {
        Row: {
          created_at: string
          created_by: string | null
          expense_id: string | null
          id: string
          notes: string | null
          reason: string | null
          refund_method: string
          sale_id: string
          store_credit_id: string | null
          store_id: string
          total_returned: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expense_id?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          refund_method: string
          sale_id: string
          store_credit_id?: string | null
          store_id: string
          total_returned?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expense_id?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          refund_method?: string
          sale_id?: string
          store_credit_id?: string | null
          store_id?: string
          total_returned?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cash_session_id: string | null
          created_at: string
          customer_doc: string | null
          customer_id: string | null
          customer_name: string | null
          customer_whatsapp: string | null
          discount: number
          due_date: string | null
          id: string
          installments: number | null
          last_reminder_sent_at: string | null
          net_value: number | null
          net_value_reason: string | null
          notes: string | null
          payment_breakdown: Json | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: string
          returned_total: number
          sale_number: number | null
          seller_id: string | null
          store_id: string
          subtotal: number
          total: number
        }
        Insert: {
          cash_session_id?: string | null
          created_at?: string
          customer_doc?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_whatsapp?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          installments?: number | null
          last_reminder_sent_at?: string | null
          net_value?: number | null
          net_value_reason?: string | null
          notes?: string | null
          payment_breakdown?: Json | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status?: string
          returned_total?: number
          sale_number?: number | null
          seller_id?: string | null
          store_id: string
          subtotal?: number
          total?: number
        }
        Update: {
          cash_session_id?: string | null
          created_at?: string
          customer_doc?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_whatsapp?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          installments?: number | null
          last_reminder_sent_at?: string | null
          net_value?: number | null
          net_value_reason?: string | null
          notes?: string | null
          payment_breakdown?: Json | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: string
          returned_total?: number
          sale_number?: number | null
          seller_id?: string | null
          store_id?: string
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_parts: {
        Row: {
          created_at: string
          id: string
          part_id: string
          qty: number
          service_order_id: string
          store_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          part_id: string
          qty?: number
          service_order_id: string
          store_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          part_id?: string
          qty?: number
          service_order_id?: string
          store_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_order_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_parts_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_parts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          accessories: string[] | null
          battery_health: number | null
          budget_decided_at: string | null
          budget_decided_by_name: string | null
          budget_decided_ip: unknown
          budget_status: Database["public"]["Enums"]["os_budget_status"]
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_city: string | null
          customer_cpf: string | null
          customer_email: string | null
          customer_name: string
          customer_signature: string | null
          customer_whatsapp: string | null
          delivery_checklist: Json | null
          device_brand: string | null
          device_category: string | null
          device_color: string | null
          device_imei1: string | null
          device_imei2: string | null
          device_model: string | null
          device_password: string | null
          device_serial: string | null
          device_storage: string | null
          device_system: string | null
          end_date: string | null
          estimated_days: number | null
          final_notes: string | null
          id: string
          issue_description: string | null
          labor_value: number
          net_value: number | null
          net_value_reason: string | null
          os_number: number | null
          parts_value: number
          photos: Json | null
          public_token: string
          reasons: string[] | null
          receive_checklist: Json | null
          signed_at: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["os_status"]
          store_id: string
          tech_signature: string | null
          technician: string | null
          technician_id: string | null
          total_value: number
          updated_at: string
          work_checklist: Json | null
        }
        Insert: {
          accessories?: string[] | null
          battery_health?: number | null
          budget_decided_at?: string | null
          budget_decided_by_name?: string | null
          budget_decided_ip?: unknown
          budget_status?: Database["public"]["Enums"]["os_budget_status"]
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_city?: string | null
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name: string
          customer_signature?: string | null
          customer_whatsapp?: string | null
          delivery_checklist?: Json | null
          device_brand?: string | null
          device_category?: string | null
          device_color?: string | null
          device_imei1?: string | null
          device_imei2?: string | null
          device_model?: string | null
          device_password?: string | null
          device_serial?: string | null
          device_storage?: string | null
          device_system?: string | null
          end_date?: string | null
          estimated_days?: number | null
          final_notes?: string | null
          id?: string
          issue_description?: string | null
          labor_value?: number
          net_value?: number | null
          net_value_reason?: string | null
          os_number?: number | null
          parts_value?: number
          photos?: Json | null
          public_token?: string
          reasons?: string[] | null
          receive_checklist?: Json | null
          signed_at?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["os_status"]
          store_id: string
          tech_signature?: string | null
          technician?: string | null
          technician_id?: string | null
          total_value?: number
          updated_at?: string
          work_checklist?: Json | null
        }
        Update: {
          accessories?: string[] | null
          battery_health?: number | null
          budget_decided_at?: string | null
          budget_decided_by_name?: string | null
          budget_decided_ip?: unknown
          budget_status?: Database["public"]["Enums"]["os_budget_status"]
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_city?: string | null
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_signature?: string | null
          customer_whatsapp?: string | null
          delivery_checklist?: Json | null
          device_brand?: string | null
          device_category?: string | null
          device_color?: string | null
          device_imei1?: string | null
          device_imei2?: string | null
          device_model?: string | null
          device_password?: string | null
          device_serial?: string | null
          device_storage?: string | null
          device_system?: string | null
          end_date?: string | null
          estimated_days?: number | null
          final_notes?: string | null
          id?: string
          issue_description?: string | null
          labor_value?: number
          net_value?: number | null
          net_value_reason?: string | null
          os_number?: number | null
          parts_value?: number
          photos?: Json | null
          public_token?: string
          reasons?: string[] | null
          receive_checklist?: Json | null
          signed_at?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["os_status"]
          store_id?: string
          tech_signature?: string | null
          technician?: string | null
          technician_id?: string | null
          total_value?: number
          updated_at?: string
          work_checklist?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          approval_status: Database["public"]["Enums"]["stock_adjustment_status"]
          created_at: string
          id: string
          item_kind: Database["public"]["Enums"]["stock_item_kind"]
          item_name: string
          justification: string | null
          new_stock: number
          part_id: string | null
          prev_stock: number
          product_id: string | null
          qty_change: number
          reason: Database["public"]["Enums"]["stock_adjustment_reason"]
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          store_id: string
          user_id: string | null
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["stock_adjustment_status"]
          created_at?: string
          id?: string
          item_kind: Database["public"]["Enums"]["stock_item_kind"]
          item_name: string
          justification?: string | null
          new_stock: number
          part_id?: string | null
          prev_stock: number
          product_id?: string | null
          qty_change: number
          reason?: Database["public"]["Enums"]["stock_adjustment_reason"]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          store_id: string
          user_id?: string | null
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["stock_adjustment_status"]
          created_at?: string
          id?: string
          item_kind?: Database["public"]["Enums"]["stock_item_kind"]
          item_name?: string
          justification?: string | null
          new_stock?: number
          part_id?: string | null
          prev_stock?: number
          product_id?: string | null
          qty_change?: number
          reason?: Database["public"]["Enums"]["stock_adjustment_reason"]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          store_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_daily_snapshots: {
        Row: {
          balance: number
          created_at: string
          id: string
          product_id: string
          snapshot_date: string
          store_id: string
          unit_cost: number | null
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          product_id: string
          snapshot_date: string
          store_id: string
          unit_cost?: number | null
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          product_id?: string
          snapshot_date?: string
          store_id?: string
          unit_cost?: number | null
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          balance_after: number | null
          balance_before: number | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          occurred_at: string
          origin_id: string | null
          origin_table: string | null
          product_id: string
          quantity: number
          store_id: string
          type: string
          unit_cost: number | null
        }
        Insert: {
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          occurred_at?: string
          origin_id?: string | null
          origin_table?: string | null
          product_id: string
          quantity: number
          store_id: string
          type: string
          unit_cost?: number | null
        }
        Update: {
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          occurred_at?: string
          origin_id?: string | null
          origin_table?: string | null
          product_id?: string
          quantity?: number
          store_id?: string
          type?: string
          unit_cost?: number | null
        }
        Relationships: []
      }
      store_brands: {
        Row: {
          brand: string
          category: string
          created_at: string
          id: string
          store_id: string
        }
        Insert: {
          brand: string
          category: string
          created_at?: string
          id?: string
          store_id: string
        }
        Update: {
          brand?: string
          category?: string
          created_at?: string
          id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_brands_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_credits: {
        Row: {
          balance: number
          code: string
          created_at: string
          customer_doc: string | null
          customer_id: string | null
          customer_name: string | null
          expires_at: string | null
          id: string
          origin_return_id: string | null
          original_amount: number
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          balance: number
          code: string
          created_at?: string
          customer_doc?: string | null
          customer_id?: string | null
          customer_name?: string | null
          expires_at?: string | null
          id?: string
          origin_return_id?: string | null
          original_amount: number
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          code?: string
          created_at?: string
          customer_doc?: string | null
          customer_id?: string | null
          customer_name?: string | null
          expires_at?: string | null
          id?: string
          origin_return_id?: string | null
          original_amount?: number
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_credits_origin_return_id_fkey"
            columns: ["origin_return_id"]
            isOneToOne: false
            referencedRelation: "sale_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_credits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_street: string | null
          address_uf: string | null
          allow_negative_stock: boolean
          block_sale_when_cash_closed: boolean
          created_at: string
          email: string | null
          hours: string | null
          id: string
          instagram: string | null
          logo_url: string | null
          name: string
          os_stalled_days: number
          owner_id: string
          pdf_accent_color: string | null
          pdf_footer_text: string | null
          pdf_logo_url: string | null
          pdf_primary_color: string | null
          phone: string | null
          price_table_note: string | null
          primary_color: string | null
          show_legal_name_on_docs: boolean
          show_non_fiscal_notice: boolean
          show_tax_id_on_docs: boolean
          slug: string
          store_credit_default_days: number
          tax_id: string | null
          trade_name: string | null
          welcome_text: string | null
        }
        Insert: {
          address?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_street?: string | null
          address_uf?: string | null
          allow_negative_stock?: boolean
          block_sale_when_cash_closed?: boolean
          created_at?: string
          email?: string | null
          hours?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name: string
          os_stalled_days?: number
          owner_id: string
          pdf_accent_color?: string | null
          pdf_footer_text?: string | null
          pdf_logo_url?: string | null
          pdf_primary_color?: string | null
          phone?: string | null
          price_table_note?: string | null
          primary_color?: string | null
          show_legal_name_on_docs?: boolean
          show_non_fiscal_notice?: boolean
          show_tax_id_on_docs?: boolean
          slug: string
          store_credit_default_days?: number
          tax_id?: string | null
          trade_name?: string | null
          welcome_text?: string | null
        }
        Update: {
          address?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_street?: string | null
          address_uf?: string | null
          allow_negative_stock?: boolean
          block_sale_when_cash_closed?: boolean
          created_at?: string
          email?: string | null
          hours?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name?: string
          os_stalled_days?: number
          owner_id?: string
          pdf_accent_color?: string | null
          pdf_footer_text?: string | null
          pdf_logo_url?: string | null
          pdf_primary_color?: string | null
          phone?: string | null
          price_table_note?: string | null
          primary_color?: string | null
          show_legal_name_on_docs?: boolean
          show_non_fiscal_notice?: boolean
          show_tax_id_on_docs?: boolean
          slug?: string
          store_credit_default_days?: number
          tax_id?: string | null
          trade_name?: string | null
          welcome_text?: string | null
        }
        Relationships: []
      }
      subscription_change_requests: {
        Row: {
          applied_at: string | null
          changes: Json
          created_at: string
          decided_at: string | null
          id: string
          reason: string
          requested_at: string
          requested_by: string
          review_notes: string | null
          reviewed_by: string | null
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          changes: Json
          created_at?: string
          decided_at?: string | null
          id?: string
          reason: string
          requested_at?: string
          requested_by: string
          review_notes?: string | null
          reviewed_by?: string | null
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          changes?: Json
          created_at?: string
          decided_at?: string | null
          id?: string
          reason?: string
          requested_at?: string
          requested_by?: string
          review_notes?: string | null
          reviewed_by?: string | null
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_change_requests_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount_cents: number
          asaas_charge_id: string | null
          asaas_customer_id: string | null
          billing_cycle: string
          cancel_at_period_end: boolean
          created_at: string
          customer_doc: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          expires_at: string | null
          id: string
          installments: number
          invoice_url: string | null
          payment_method: string
          pix_copy_paste: string | null
          pix_qr_code: string | null
          plan_id: string
          refund_requested_at: string | null
          refund_status: string | null
          started_at: string | null
          status: string
          store_id: string | null
          trial_expired_notice_sent_at: string | null
          trial_warning_sent_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_cents: number
          asaas_charge_id?: string | null
          asaas_customer_id?: string | null
          billing_cycle?: string
          cancel_at_period_end?: boolean
          created_at?: string
          customer_doc: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          expires_at?: string | null
          id?: string
          installments?: number
          invoice_url?: string | null
          payment_method: string
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          plan_id: string
          refund_requested_at?: string | null
          refund_status?: string | null
          started_at?: string | null
          status?: string
          store_id?: string | null
          trial_expired_notice_sent_at?: string | null
          trial_warning_sent_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_cents?: number
          asaas_charge_id?: string | null
          asaas_customer_id?: string | null
          billing_cycle?: string
          cancel_at_period_end?: boolean
          created_at?: string
          customer_doc?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          expires_at?: string | null
          id?: string
          installments?: number
          invoice_url?: string | null
          payment_method?: string
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          plan_id?: string
          refund_requested_at?: string | null
          refund_status?: string | null
          started_at?: string | null
          status?: string
          store_id?: string | null
          trial_expired_notice_sent_at?: string | null
          trial_warning_sent_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          avg_delivery_days: number | null
          brands: string[]
          city: string | null
          cnpj: string | null
          company_name: string
          created_at: string
          email: string | null
          id: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          representative_name: string | null
          state: string | null
          store_id: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          active?: boolean
          avg_delivery_days?: number | null
          brands?: string[]
          city?: string | null
          cnpj?: string | null
          company_name: string
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          representative_name?: string | null
          state?: string | null
          store_id: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          active?: boolean
          avg_delivery_days?: number | null
          brands?: string[]
          city?: string | null
          cnpj?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          representative_name?: string | null
          state?: string | null
          store_id?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          attachments: Json
          created_at: string
          id: string
          is_admin: boolean
          message: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          created_at?: string
          id?: string
          is_admin?: boolean
          message: string
          ticket_id: string
          user_id: string
        }
        Update: {
          attachments?: Json
          created_at?: string
          id?: string
          is_admin?: boolean
          message?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_status_history: {
        Row: {
          changed_by: string | null
          changed_by_is_admin: boolean
          created_at: string
          from_status:
            | Database["public"]["Enums"]["support_ticket_status"]
            | null
          id: string
          note: string | null
          ticket_id: string
          to_status: Database["public"]["Enums"]["support_ticket_status"]
        }
        Insert: {
          changed_by?: string | null
          changed_by_is_admin?: boolean
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["support_ticket_status"]
            | null
          id?: string
          note?: string | null
          ticket_id: string
          to_status: Database["public"]["Enums"]["support_ticket_status"]
        }
        Update: {
          changed_by?: string | null
          changed_by_is_admin?: boolean
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["support_ticket_status"]
            | null
          id?: string
          note?: string | null
          ticket_id?: string
          to_status?: Database["public"]["Enums"]["support_ticket_status"]
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_status_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          attachments: Json
          category: string | null
          created_at: string
          id: string
          message: string
          priority: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          store_id: string | null
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          category?: string | null
          created_at?: string
          id?: string
          message: string
          priority?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          store_id?: string | null
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: Json
          category?: string | null
          created_at?: string
          id?: string
          message?: string
          priority?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          store_id?: string | null
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_ins: {
        Row: {
          battery_health: number | null
          brand: string | null
          checklist: Json
          color: string | null
          condition: Database["public"]["Enums"]["device_condition"]
          created_at: string
          created_by: string | null
          customer_doc: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          entry_expense_id: string | null
          entry_value: number
          id: string
          imei: string | null
          imei_status: string | null
          intended_sale_value: number
          model: string
          notes: string | null
          photos_in: string[]
          photos_out: string[]
          product_id: string | null
          received_in_sale_id: string | null
          repair_costs: number
          repair_parts: Json
          scrap_for_parts: boolean
          status: Database["public"]["Enums"]["trade_in_status"]
          storage_gb: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          battery_health?: number | null
          brand?: string | null
          checklist?: Json
          color?: string | null
          condition?: Database["public"]["Enums"]["device_condition"]
          created_at?: string
          created_by?: string | null
          customer_doc?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          entry_expense_id?: string | null
          entry_value?: number
          id?: string
          imei?: string | null
          imei_status?: string | null
          intended_sale_value?: number
          model: string
          notes?: string | null
          photos_in?: string[]
          photos_out?: string[]
          product_id?: string | null
          received_in_sale_id?: string | null
          repair_costs?: number
          repair_parts?: Json
          scrap_for_parts?: boolean
          status?: Database["public"]["Enums"]["trade_in_status"]
          storage_gb?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          battery_health?: number | null
          brand?: string | null
          checklist?: Json
          color?: string | null
          condition?: Database["public"]["Enums"]["device_condition"]
          created_at?: string
          created_by?: string | null
          customer_doc?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          entry_expense_id?: string | null
          entry_value?: number
          id?: string
          imei?: string | null
          imei_status?: string | null
          intended_sale_value?: number
          model?: string
          notes?: string | null
          photos_in?: string[]
          photos_out?: string[]
          product_id?: string | null
          received_in_sale_id?: string | null
          repair_costs?: number
          repair_parts?: Json
          scrap_for_parts?: boolean
          status?: Database["public"]["Enums"]["trade_in_status"]
          storage_gb?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_ins_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_ins_received_in_sale_id_fkey"
            columns: ["received_in_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_ins_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_signup_attempts: {
        Row: {
          created_at: string
          id: string
          ip: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string | null
        }
        Relationships: []
      }
      user_profile_extras: {
        Row: {
          allowed_hours: Json | null
          created_at: string
          expires_at: string | null
          failed_attempts: number
          job_title: string | null
          last_login_at: string | null
          locked_until: string | null
          notes: string | null
          permissions: Json
          status: string
          store_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_hours?: Json | null
          created_at?: string
          expires_at?: string | null
          failed_attempts?: number
          job_title?: string | null
          last_login_at?: string | null
          locked_until?: string | null
          notes?: string | null
          permissions?: Json
          status?: string
          store_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_hours?: Json | null
          created_at?: string
          expires_at?: string | null
          failed_attempts?: number
          job_title?: string | null
          last_login_at?: string | null
          locked_until?: string | null
          notes?: string | null
          permissions?: Json
          status?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profile_extras_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          store_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_store_permissions: {
        Row: {
          can_edit_purchases: boolean
          can_edit_sales: boolean
          can_view_purchases: boolean
          can_view_sales: boolean
          created_at: string
          id: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_edit_purchases?: boolean
          can_edit_sales?: boolean
          can_view_purchases?: boolean
          can_view_sales?: boolean
          created_at?: string
          id?: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_edit_purchases?: boolean
          can_edit_sales?: boolean
          can_view_purchases?: boolean
          can_view_sales?: boolean
          created_at?: string
          id?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_store_permissions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stores: {
        Row: {
          store_id: string
          user_id: string
        }
        Insert: {
          store_id: string
          user_id: string
        }
        Update: {
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_settings: {
        Row: {
          created_at: string
          default_days: number
          default_enabled: boolean
          id: string
          message_template: string
          notice_text: string
          options: Json
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_days?: number
          default_enabled?: boolean
          id?: string
          message_template?: string
          notice_text?: string
          options?: Json
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_days?: number
          default_enabled?: boolean
          id?: string
          message_template?: string
          notice_text?: string
          options?: Json
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages_log: {
        Row: {
          created_at: string
          event_key: string
          id: string
          message_text: string
          os_id: string | null
          phone: string | null
          sale_id: string | null
          sent_by: string | null
          store_id: string
          template_id: string | null
          template_title: string | null
        }
        Insert: {
          created_at?: string
          event_key: string
          id?: string
          message_text: string
          os_id?: string | null
          phone?: string | null
          sale_id?: string | null
          sent_by?: string | null
          store_id: string
          template_id?: string | null
          template_title?: string | null
        }
        Update: {
          created_at?: string
          event_key?: string
          id?: string
          message_text?: string
          os_id?: string | null
          phone?: string | null
          sale_id?: string | null
          sent_by?: string | null
          store_id?: string
          template_id?: string | null
          template_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_log_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_log_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_log_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body: string
          created_at: string
          event_key: string
          id: string
          is_active: boolean
          store_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          event_key: string
          id?: string
          is_active?: boolean
          store_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          event_key?: string
          id?: string
          is_active?: boolean
          store_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_cash_movement: {
        Args: {
          _amount: number
          _reason: string
          _session_id: string
          _type: string
        }
        Returns: string
      }
      admin_change_user_plan: {
        Args: {
          _new_expires_at?: string
          _new_plan_id: string
          _new_status?: string
          _reason?: string
          _subscription_id: string
        }
        Returns: Json
      }
      admin_grant_master: {
        Args: {
          _email: string
          _notes?: string
          _permissions: string[]
          _reason?: string
        }
        Returns: Json
      }
      admin_has_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      admin_list_masters: {
        Args: never
        Returns: {
          email: string
          full_name: string
          granted_at: string
          granted_by: string
          granted_by_email: string
          is_super: boolean
          notes: string
          permissions: string[]
          updated_at: string
          user_id: string
        }[]
      }
      admin_revoke_master: {
        Args: { _reason: string; _user_id: string }
        Returns: Json
      }
      admin_update_master_permissions: {
        Args: { _permissions: string[]; _reason: string; _user_id: string }
        Returns: Json
      }
      apply_commissions_for_os: { Args: { _os_id: string }; Returns: undefined }
      apply_commissions_for_sale: {
        Args: { _sale_id: string }
        Returns: undefined
      }
      apply_coupon: {
        Args: { _amount_cents: number; _code: string }
        Returns: Json
      }
      approve_public_budget: {
        Args: {
          _decision: string
          _ip?: unknown
          _name: string
          _token: string
        }
        Returns: Json
      }
      approve_subscription_change: {
        Args: { _request_id: string; _review_notes?: string }
        Returns: Json
      }
      assert_sale_has_items: { Args: { _sale_id: string }; Returns: boolean }
      backfill_trial_orphans: { Args: never; Returns: Json }
      can_manage_commissions: {
        Args: { _store_id: string; _uid: string }
        Returns: boolean
      }
      cancel_trade_in_repair: {
        Args: { _reason?: string; _trade_in_id: string }
        Returns: string
      }
      close_cash_session: {
        Args: { _counted_cash: number; _notes?: string; _session_id: string }
        Returns: Json
      }
      create_purchase_with_stock: {
        Args: {
          _create_expense: boolean
          _due_date: string
          _expected_delivery_at: string
          _items: Json
          _notes: string
          _payment_method: string
          _payment_status: string
          _store_id: string
          _supplier_id: string
          _supplier_name: string
          _tags: string[]
        }
        Returns: Json
      }
      create_sale: {
        Args: {
          _customer_doc: string
          _customer_id: string
          _customer_name: string
          _customer_whatsapp: string
          _discount: number
          _installments: number
          _items: Json
          _notes: string
          _payment_method: Database["public"]["Enums"]["payment_method"]
          _payments: Json
          _store_id: string
          _trade_in?: Json
        }
        Returns: Json
      }
      create_sale_return: {
        Args: {
          _items: Json
          _notes: string
          _reason: string
          _refund_method: string
          _sale_id: string
        }
        Returns: Json
      }
      dispatch_push_event: {
        Args: { _event: string; _payload: Json; _store_id: string }
        Returns: undefined
      }
      finish_trade_in_repair: {
        Args: {
          _manual_cost?: number
          _manual_notes?: string
          _parts?: Json
          _trade_in_id: string
        }
        Returns: string
      }
      generate_referral_code: { Args: { _user_id?: string }; Returns: string }
      generate_store_credit_code: {
        Args: { _store_id: string }
        Returns: string
      }
      get_cash_consolidated: {
        Args: { _from: string; _store_id: string; _to: string }
        Returns: Json
      }
      get_cash_session_summary: { Args: { _session_id: string }; Returns: Json }
      get_dashboard_metrics: {
        Args: { _from: string; _store_id: string; _to: string }
        Returns: Json
      }
      get_meta_pixel_id: { Args: never; Returns: string }
      get_open_cash_session: {
        Args: { _store_id: string }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          counted_cash: number | null
          created_at: string
          difference: number | null
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_amount: number
          status: string
          store_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "cash_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_os: { Args: { _token: string }; Returns: Json }
      get_stock_movement_report: {
        Args: {
          p_brand?: string
          p_category?: string
          p_end: string
          p_start: string
          p_store_id: string
          p_supplier?: string
        }
        Returns: {
          ajuste_negativo: number
          ajuste_positivo: number
          brand: string
          category: string
          divergencia: number
          entrada_compra: number
          entrada_devolucao: number
          entrada_troca: number
          product_id: string
          product_name: string
          saida_os: number
          saida_transferencia: number
          saida_venda: number
          saldo_atual: number
          saldo_calculado: number
          saldo_inicial: number
          sku: string
          supplier: string
          unit_cost: number
        }[]
      }
      get_store_sellers: {
        Args: { _store_id: string }
        Returns: {
          email: string
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      get_store_technicians: {
        Args: { _store_id: string }
        Returns: {
          email: string
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      grant_access_bonus: {
        Args: {
          p_bonus_type: string
          p_days: number
          p_email: string
          p_reason: string
        }
        Returns: {
          bonus_type: string
          created_at: string
          days_granted: number
          granted_by: string | null
          id: string
          partner_trial_id: string | null
          period_end: string
          period_start: string
          previous_ends_at: string | null
          reason: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          store_id: string | null
          subscription_id: string | null
          target_email: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "access_bonuses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_permission: {
        Args: {
          _action: string
          _module: string
          _store_id: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _store_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_master: { Args: { _user_id: string }; Returns: boolean }
      is_owner: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      link_orphan_subscription: {
        Args: { _email: string; _user_id: string }
        Returns: undefined
      }
      my_stores: {
        Args: { _user_id: string }
        Returns: {
          billing_cycle: string
          expires_at: string
          is_owner: boolean
          logo_url: string
          name: string
          plan_name: string
          role: Database["public"]["Enums"]["app_role"]
          slug: string
          store_id: string
          subscription_status: string
        }[]
      }
      open_cash_session: {
        Args: { _notes?: string; _opening_amount: number; _store_id: string }
        Returns: string
      }
      pay_commission_entries: {
        Args: {
          _entry_ids: string[]
          _expense_date?: string
          _notes?: string
          _payment_method?: string
        }
        Returns: Json
      }
      phonee_asaas_charge_duplicates: {
        Args: never
        Returns: {
          asaas_charge_id: string
          qtd: number
        }[]
      }
      phonee_asaas_idempotency_probe: { Args: never; Returns: Json }
      phonee_asaas_index_status: { Args: never; Returns: Json }
      phonee_audit_log_actions: {
        Args: never
        Returns: {
          action: string
          qtd: number
        }[]
      }
      phonee_audit_log_search: {
        Args: {
          _action?: string
          _actor_id?: string
          _from?: string
          _limit?: number
          _offset?: number
          _store_id?: string
          _to?: string
        }
        Returns: {
          action: string
          actor_email: string
          actor_id: string
          actor_name: string
          created_at: string
          details: Json
          entity: string
          entity_id: string
          id: string
          module: string
          new_value: Json
          old_value: Json
          screen: string
          status: string
          store_id: string
          store_name: string
          target_email: string
          target_id: string
          target_name: string
        }[]
      }
      phonee_bind_user_to_store: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _store_id: string
          _user_id: string
        }
        Returns: undefined
      }
      phonee_bulk_bind_users: {
        Args: { _rows: Json; _store_id: string }
        Returns: Json
      }
      phonee_bulk_validate_bindings: {
        Args: { _rows: Json; _store_id: string }
        Returns: {
          email: string
          reason: string
          role: string
          status: string
          user_id: string
        }[]
      }
      phonee_coupons_revenue: { Args: { _days?: number }; Returns: Json }
      phonee_growth: {
        Args: never
        Returns: {
          gmv: number
          month_start: string
          new_stores: number
          new_subscriptions: number
        }[]
      }
      phonee_list_store_permissions: {
        Args: { _store_id: string }
        Returns: {
          can_edit_purchases: boolean
          can_edit_sales: boolean
          can_view_purchases: boolean
          can_view_sales: boolean
          email: string
          full_name: string
          user_id: string
        }[]
      }
      phonee_marketing_dashboard: {
        Args: { _from?: string; _to?: string }
        Returns: Json
      }
      phonee_overview: { Args: never; Returns: Json }
      phonee_partner_trials_list: {
        Args: never
        Returns: {
          activated_at: string
          city: string
          days_left: number
          email: string
          full_access_ends_at: string
          full_access_granted_at: string
          full_access_months: number
          full_name: string
          id: string
          instagram: string
          invite_link: string
          invited_at: string
          kind: string
          notes: string
          state: string
          status: string
          store_name: string
          trial_days: number
          trial_ends_at: string
          user_id: string
          whatsapp: string
        }[]
      }
      phonee_permission_audit: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          has_role: boolean
          has_store: boolean
          is_admin_master: boolean
          issue: string
          user_id: string
        }[]
      }
      phonee_pixel_events_overview: { Args: { _days?: number }; Returns: Json }
      phonee_plans_list: {
        Args: never
        Returns: {
          id: string
          name: string
          price_cents: number
        }[]
      }
      phonee_referrals_overview: { Args: never; Returns: Json }
      phonee_sales_traffic: {
        Args: {
          _days?: number
          _from?: string
          _path?: string
          _store_id?: string
          _to?: string
        }
        Returns: Json
      }
      phonee_security_test: { Args: never; Returns: Json }
      phonee_set_store_permission: {
        Args: {
          _allowed: boolean
          _feature: string
          _store_id: string
          _user_id: string
        }
        Returns: undefined
      }
      phonee_set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _store_id: string
          _user_id: string
        }
        Returns: undefined
      }
      phonee_smoke_test: { Args: { _as_admin?: string }; Returns: Json }
      phonee_smoke_test_run_and_log: {
        Args: { _source?: string }
        Returns: string
      }
      phonee_store_bindings: {
        Args: { _store_id: string }
        Returns: {
          email: string
          full_name: string
          is_owner: boolean
          roles: Database["public"]["Enums"]["app_role"][]
          user_id: string
        }[]
      }
      phonee_stores: {
        Args: never
        Returns: {
          avg_ticket: number
          billing_cycle: string
          created_at: string
          expires_at: string
          owner_email: string
          owner_id: string
          owner_name: string
          plan_name: string
          sales_count: number
          store_id: string
          store_name: string
          subscription_status: string
          total_sales: number
        }[]
      }
      phonee_test_negative_stock_sale:
        | { Args: never; Returns: Json }
        | { Args: { _owner: string }; Returns: Json }
      phonee_traffic_paths: {
        Args: never
        Returns: {
          path: string
          visits: number
        }[]
      }
      phonee_unbind_user_from_store: {
        Args: { _store_id: string; _user_id: string }
        Returns: undefined
      }
      phonee_user_metrics: { Args: never; Returns: Json }
      phonee_user_subscriptions: {
        Args: { _user_id: string }
        Returns: {
          amount_cents: number
          billing_cycle: string
          created_at: string
          expires_at: string
          plan_id: string
          plan_name: string
          status: string
          store_id: string
          store_name: string
          subscription_id: string
        }[]
      }
      phonee_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          instagram: string
          is_admin_master: boolean
          phone: string
          plan_name: string
          roles: string[]
          stores: Json
          stores_count: number
          subscription_status: string
          user_id: string
        }[]
      }
      phonee_validate_role_assignment: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _store_id: string
          _user_id: string
        }
        Returns: Json
      }
      product_stock_filter_options: {
        Args: { _store_id: string }
        Returns: Json
      }
      product_stock_metrics: { Args: { _store_id: string }; Returns: Json }
      receive_installment: {
        Args: {
          _amount: number
          _method: string
          _notes?: string
          _receivable_id: string
          _received_at?: string
        }
        Returns: Json
      }
      redeem_coupon: {
        Args: {
          _code: string
          _customer_email: string
          _discount_cents: number
          _original_cents: number
          _store_id: string
          _subscription_id: string
        }
        Returns: string
      }
      redeem_store_credit: {
        Args: {
          _amount: number
          _code: string
          _sale_id: string
          _store_id: string
        }
        Returns: Json
      }
      referral_balance: { Args: { _user_id?: string }; Returns: number }
      referral_dashboard: { Args: { _user_id?: string }; Returns: Json }
      referral_pending_balance: { Args: { _user_id?: string }; Returns: number }
      referral_ranking: {
        Args: never
        Returns: {
          convertidas: number
          display_name: string
          rank: number
          total: number
        }[]
      }
      register_credit_installments: {
        Args: {
          _customer_whatsapp?: string
          _entry_amount: number
          _first_due: string
          _installments: number
          _interval_days?: number
          _sale_id: string
        }
        Returns: Json
      }
      register_referral: {
        Args: {
          _code: string
          _referred_email?: string
          _referred_store_id?: string
          _referred_subscription_id?: string
        }
        Returns: string
      }
      reject_subscription_change: {
        Args: { _request_id: string; _review_notes: string }
        Returns: Json
      }
      renegotiate_receivables: {
        Args: {
          _first_due: string
          _interval_days?: number
          _new_installments: number
          _reason?: string
          _receivable_ids: string[]
        }
        Returns: Json
      }
      request_subscription_change: {
        Args: { _changes: Json; _reason: string; _subscription_id: string }
        Returns: string
      }
      reverse_commission_payment: {
        Args: { _expense_id: string }
        Returns: undefined
      }
      revoke_access_bonus: {
        Args: { p_bonus_id: string; p_reason: string }
        Returns: {
          bonus_type: string
          created_at: string
          days_granted: number
          granted_by: string | null
          id: string
          partner_trial_id: string | null
          period_end: string
          period_start: string
          previous_ends_at: string | null
          reason: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          store_id: string | null
          subscription_id: string | null
          target_email: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "access_bonuses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_sale_products: {
        Args: { _limit?: number; _query?: string; _store_id: string }
        Returns: {
          brand: string
          category: string
          color: string
          compatible_model: string
          cost_price: number
          ean: string
          id: string
          name: string
          sale_price: number
          sku: string
          stock_current: number
          storage: string
          subcategory: string
        }[]
      }
      seed_whatsapp_templates_for_store: {
        Args: { _store_id: string }
        Returns: undefined
      }
      stock_products_page: {
        Args: {
          _brand?: string
          _category?: string
          _filter?: string
          _page?: number
          _page_size?: number
          _query?: string
          _store_id: string
        }
        Returns: {
          brand: string
          category: string
          condition: string
          cost_price: number
          id: string
          last_sold_at: string
          name: string
          sale_price: number
          sku: string
          status: string
          stock_current: number
          stock_min: number
          supplier: string
          total_count: number
        }[]
      }
      take_stock_snapshot: { Args: { p_date?: string }; Returns: number }
      trial_eligibility: {
        Args: { _doc?: string; _email?: string; _user_id?: string }
        Returns: Json
      }
      update_purchase_with_stock: {
        Args: {
          _create_expense: boolean
          _due_date: string
          _expected_delivery_at: string
          _items: Json
          _notes: string
          _order_id: string
          _payment_method: string
          _payment_status: string
          _supplier_id: string
          _supplier_name: string
          _tags: string[]
        }
        Returns: Json
      }
      update_sale_with_stock: {
        Args: {
          _customer_doc: string
          _customer_id: string
          _customer_name: string
          _customer_whatsapp: string
          _discount: number
          _installments: number
          _items: Json
          _notes: string
          _payment_method: Database["public"]["Enums"]["payment_method"]
          _payments: Json
          _sale_id: string
        }
        Returns: Json
      }
      use_referral_credit: {
        Args: { _amount_cents: number; _notes?: string }
        Returns: Json
      }
      user_has_store_access: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      user_store_can: {
        Args: { _feature: string; _store_id: string; _user_id: string }
        Returns: boolean
      }
      validate_store_credit: {
        Args: { _code: string; _store_id: string }
        Returns: Json
      }
    }
    Enums: {
      alert_severity: "info" | "warning" | "danger"
      app_role:
        | "dono"
        | "gerente"
        | "vendedor"
        | "estoquista"
        | "admin_master"
        | "administrador"
        | "financeiro"
        | "tecnico"
        | "atendimento"
      coupon_discount_type: "valor" | "percentual"
      device_condition: "otimo" | "bom" | "regular" | "com_defeito"
      os_budget_status: "pendente" | "aprovado" | "reprovado"
      os_status:
        | "recebido"
        | "em_analise"
        | "aguardando_orcamento"
        | "aguardando_aprovacao"
        | "aguardando_peca"
        | "em_reparo"
        | "em_testes"
        | "pronto_retirada"
        | "entregue"
        | "cancelado"
      part_category:
        | "telas"
        | "baterias"
        | "tampas"
        | "cameras"
        | "flex"
        | "componentes"
        | "outros"
        | "ferramentas"
      payment_method:
        | "dinheiro"
        | "pix"
        | "debito"
        | "credito"
        | "crediario"
        | "boleto"
      product_category:
        | "acessorio"
        | "peca"
        | "aparelho_novo"
        | "aparelho_seminovo"
      product_condition: "novo" | "seminovo" | "recondicionado"
      product_status: "ativo" | "inativo" | "promocao"
      purchase_order_status:
        | "rascunho"
        | "enviado"
        | "recebido"
        | "parcial"
        | "cancelado"
      referral_credit_type:
        | "credito_indicacao"
        | "uso_desconto"
        | "ajuste_admin"
      referral_status: "pendente" | "convertida" | "cancelada"
      stock_adjustment_reason:
        | "perda"
        | "brinde"
        | "uso_interno"
        | "correcao"
        | "entrada_manual"
        | "outros"
      stock_adjustment_status: "pendente" | "aprovado" | "rejeitado"
      stock_item_kind: "product" | "part"
      support_ticket_status:
        | "aberto"
        | "pendente"
        | "resolvido"
        | "em_andamento"
        | "aguardando_cliente"
        | "fechado"
      trade_in_status:
        | "em_avaliacao"
        | "aprovado"
        | "em_estoque"
        | "vendido"
        | "recusado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_severity: ["info", "warning", "danger"],
      app_role: [
        "dono",
        "gerente",
        "vendedor",
        "estoquista",
        "admin_master",
        "administrador",
        "financeiro",
        "tecnico",
        "atendimento",
      ],
      coupon_discount_type: ["valor", "percentual"],
      device_condition: ["otimo", "bom", "regular", "com_defeito"],
      os_budget_status: ["pendente", "aprovado", "reprovado"],
      os_status: [
        "recebido",
        "em_analise",
        "aguardando_orcamento",
        "aguardando_aprovacao",
        "aguardando_peca",
        "em_reparo",
        "em_testes",
        "pronto_retirada",
        "entregue",
        "cancelado",
      ],
      part_category: [
        "telas",
        "baterias",
        "tampas",
        "cameras",
        "flex",
        "componentes",
        "outros",
        "ferramentas",
      ],
      payment_method: [
        "dinheiro",
        "pix",
        "debito",
        "credito",
        "crediario",
        "boleto",
      ],
      product_category: [
        "acessorio",
        "peca",
        "aparelho_novo",
        "aparelho_seminovo",
      ],
      product_condition: ["novo", "seminovo", "recondicionado"],
      product_status: ["ativo", "inativo", "promocao"],
      purchase_order_status: [
        "rascunho",
        "enviado",
        "recebido",
        "parcial",
        "cancelado",
      ],
      referral_credit_type: [
        "credito_indicacao",
        "uso_desconto",
        "ajuste_admin",
      ],
      referral_status: ["pendente", "convertida", "cancelada"],
      stock_adjustment_reason: [
        "perda",
        "brinde",
        "uso_interno",
        "correcao",
        "entrada_manual",
        "outros",
      ],
      stock_adjustment_status: ["pendente", "aprovado", "rejeitado"],
      stock_item_kind: ["product", "part"],
      support_ticket_status: [
        "aberto",
        "pendente",
        "resolvido",
        "em_andamento",
        "aguardando_cliente",
        "fechado",
      ],
      trade_in_status: [
        "em_avaliacao",
        "aprovado",
        "em_estoque",
        "vendido",
        "recusado",
      ],
    },
  },
} as const
