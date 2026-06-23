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
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          id: string
          notes: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          total: number
          unit_cost: number
        }
        Insert: {
          id?: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          total?: number
          unit_cost?: number
        }
        Update: {
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
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
          id: string
          notes: string | null
          received_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["purchase_order_status"]
          store_id: string
          supplier: string
          total_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          received_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          store_id: string
          supplier: string
          total_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          received_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          store_id?: string
          supplier?: string
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
          id: string
          product_id: string
          quantity: number
          sale_id: string
          total: number
          unit_price: number
        }
        Insert: {
          id?: string
          product_id: string
          quantity?: number
          sale_id: string
          total: number
          unit_price: number
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          sale_id?: string
          total?: number
          unit_price?: number
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
      sales: {
        Row: {
          created_at: string
          customer_doc: string | null
          customer_name: string | null
          customer_whatsapp: string | null
          discount: number
          id: string
          installments: number | null
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          sale_number: number | null
          seller_id: string | null
          store_id: string
          subtotal: number
          total: number
        }
        Insert: {
          created_at?: string
          customer_doc?: string | null
          customer_name?: string | null
          customer_whatsapp?: string | null
          discount?: number
          id?: string
          installments?: number | null
          notes?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          sale_number?: number | null
          seller_id?: string | null
          store_id: string
          subtotal?: number
          total?: number
        }
        Update: {
          created_at?: string
          customer_doc?: string | null
          customer_name?: string | null
          customer_whatsapp?: string | null
          discount?: number
          id?: string
          installments?: number | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          sale_number?: number | null
          seller_id?: string | null
          store_id?: string
          subtotal?: number
          total?: number
        }
        Relationships: [
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
          os_number: number | null
          parts_value: number
          photos: Json | null
          reasons: string[] | null
          receive_checklist: Json | null
          signed_at: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["os_status"]
          store_id: string
          tech_signature: string | null
          technician: string | null
          total_value: number
          updated_at: string
          work_checklist: Json | null
        }
        Insert: {
          accessories?: string[] | null
          battery_health?: number | null
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
          os_number?: number | null
          parts_value?: number
          photos?: Json | null
          reasons?: string[] | null
          receive_checklist?: Json | null
          signed_at?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["os_status"]
          store_id: string
          tech_signature?: string | null
          technician?: string | null
          total_value?: number
          updated_at?: string
          work_checklist?: Json | null
        }
        Update: {
          accessories?: string[] | null
          battery_health?: number | null
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
          os_number?: number | null
          parts_value?: number
          photos?: Json | null
          reasons?: string[] | null
          receive_checklist?: Json | null
          signed_at?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["os_status"]
          store_id?: string
          tech_signature?: string | null
          technician?: string | null
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
          store_id: string
          user_id: string | null
        }
        Insert: {
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
          store_id: string
          user_id?: string | null
        }
        Update: {
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
      stores: {
        Row: {
          address: string | null
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_street: string | null
          address_uf: string | null
          created_at: string
          email: string | null
          hours: string | null
          id: string
          instagram: string | null
          logo_url: string | null
          name: string
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
          created_at?: string
          email?: string | null
          hours?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name: string
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
          created_at?: string
          email?: string | null
          hours?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name?: string
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
          tax_id?: string | null
          trade_name?: string | null
          welcome_text?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount_cents: number
          asaas_charge_id: string | null
          asaas_customer_id: string | null
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
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_cents: number
          asaas_charge_id?: string | null
          asaas_customer_id?: string | null
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
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_cents?: number
          asaas_charge_id?: string | null
          asaas_customer_id?: string | null
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
            foreignKeyName: "trade_ins_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile_extras: {
        Row: {
          allowed_hours: Json | null
          created_at: string
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
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_store_sellers: {
        Args: { _store_id: string }
        Returns: {
          email: string
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
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
      user_has_store_access: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
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
      stock_adjustment_reason:
        | "perda"
        | "brinde"
        | "uso_interno"
        | "correcao"
        | "entrada_manual"
        | "outros"
      stock_item_kind: "product" | "part"
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
      stock_adjustment_reason: [
        "perda",
        "brinde",
        "uso_interno",
        "correcao",
        "entrada_manual",
        "outros",
      ],
      stock_item_kind: ["product", "part"],
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
