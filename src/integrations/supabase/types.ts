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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      buyer_selection_drafts: {
        Row: {
          created_at: string | null
          current_step: number | null
          highest_step_reached: number | null
          id: string
          selections: Json
          unit_number: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_step?: number | null
          highest_step_reached?: number | null
          id?: string
          selections?: Json
          unit_number: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_step?: number | null
          highest_step_reached?: number | null
          id?: string
          selections?: Json
          unit_number?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      buyer_selections: {
        Row: {
          additional_windows_qty: number | null
          admin_notes: string | null
          area_upgrades: Json | null
          backsplash_grout_color: string | null
          backsplash_grout_comments: string | null
          backsplash_grout_enabled: boolean | null
          backsplash_orientation: string | null
          bathroom_tile_ensuite_selected: boolean | null
          bathroom_tile_guest_selected: boolean | null
          bathroom_tile_selected: boolean | null
          bedroom_carpet_colour: string | null
          bedroom_flooring_choice: string | null
          bedroom_lvp_colour: string | null
          bedroom_lvp_same_as_main: boolean | null
          completed_at: string | null
          created_at: string
          custom_tiled_shower: boolean | null
          document_uploads: Json | null
          email: string
          estimated_possession_date: string | null
          first_name: string
          floor_plan_annotations: Json | null
          hardwood_upgrade_selected: boolean | null
          has_stairs: boolean | null
          heated_floor_bathrooms: number | null
          id: string
          last_name: string
          lvp_colour: string | null
          lvp_comments: string | null
          patio_doors_qty: number | null
          phone_number: string | null
          premium_carpet_bedroom: boolean | null
          premium_underpad_bedroom: boolean | null
          premium_underpad_stairs: boolean | null
          quoted_at: string | null
          reviewed_at: string | null
          sales_comments: string | null
          spc_tile_colour: string | null
          spc_tile_comments: string | null
          stair_carpet_colour: string | null
          stair_lvp_upgrade_selected: boolean | null
          stair_upgrade_type: string | null
          status: string | null
          unit_number: string
          unit_type: string | null
          updated_at: string
          upgrade_comments: string | null
          upgrade_floor_selection: string | null
          upgrade_interests: Json | null
          upgrade_interests_notes: string | null
          window_comments: string | null
          window_total: number | null
        }
        Insert: {
          additional_windows_qty?: number | null
          admin_notes?: string | null
          area_upgrades?: Json | null
          backsplash_grout_color?: string | null
          backsplash_grout_comments?: string | null
          backsplash_grout_enabled?: boolean | null
          backsplash_orientation?: string | null
          bathroom_tile_ensuite_selected?: boolean | null
          bathroom_tile_guest_selected?: boolean | null
          bathroom_tile_selected?: boolean | null
          bedroom_carpet_colour?: string | null
          bedroom_flooring_choice?: string | null
          bedroom_lvp_colour?: string | null
          bedroom_lvp_same_as_main?: boolean | null
          completed_at?: string | null
          created_at?: string
          custom_tiled_shower?: boolean | null
          document_uploads?: Json | null
          email: string
          estimated_possession_date?: string | null
          first_name: string
          floor_plan_annotations?: Json | null
          hardwood_upgrade_selected?: boolean | null
          has_stairs?: boolean | null
          heated_floor_bathrooms?: number | null
          id?: string
          last_name: string
          lvp_colour?: string | null
          lvp_comments?: string | null
          patio_doors_qty?: number | null
          phone_number?: string | null
          premium_carpet_bedroom?: boolean | null
          premium_underpad_bedroom?: boolean | null
          premium_underpad_stairs?: boolean | null
          quoted_at?: string | null
          reviewed_at?: string | null
          sales_comments?: string | null
          spc_tile_colour?: string | null
          spc_tile_comments?: string | null
          stair_carpet_colour?: string | null
          stair_lvp_upgrade_selected?: boolean | null
          stair_upgrade_type?: string | null
          status?: string | null
          unit_number: string
          unit_type?: string | null
          updated_at?: string
          upgrade_comments?: string | null
          upgrade_floor_selection?: string | null
          upgrade_interests?: Json | null
          upgrade_interests_notes?: string | null
          window_comments?: string | null
          window_total?: number | null
        }
        Update: {
          additional_windows_qty?: number | null
          admin_notes?: string | null
          area_upgrades?: Json | null
          backsplash_grout_color?: string | null
          backsplash_grout_comments?: string | null
          backsplash_grout_enabled?: boolean | null
          backsplash_orientation?: string | null
          bathroom_tile_ensuite_selected?: boolean | null
          bathroom_tile_guest_selected?: boolean | null
          bathroom_tile_selected?: boolean | null
          bedroom_carpet_colour?: string | null
          bedroom_flooring_choice?: string | null
          bedroom_lvp_colour?: string | null
          bedroom_lvp_same_as_main?: boolean | null
          completed_at?: string | null
          created_at?: string
          custom_tiled_shower?: boolean | null
          document_uploads?: Json | null
          email?: string
          estimated_possession_date?: string | null
          first_name?: string
          floor_plan_annotations?: Json | null
          hardwood_upgrade_selected?: boolean | null
          has_stairs?: boolean | null
          heated_floor_bathrooms?: number | null
          id?: string
          last_name?: string
          lvp_colour?: string | null
          lvp_comments?: string | null
          patio_doors_qty?: number | null
          phone_number?: string | null
          premium_carpet_bedroom?: boolean | null
          premium_underpad_bedroom?: boolean | null
          premium_underpad_stairs?: boolean | null
          quoted_at?: string | null
          reviewed_at?: string | null
          sales_comments?: string | null
          spc_tile_colour?: string | null
          spc_tile_comments?: string | null
          stair_carpet_colour?: string | null
          stair_lvp_upgrade_selected?: boolean | null
          stair_upgrade_type?: string | null
          status?: string | null
          unit_number?: string
          unit_type?: string | null
          updated_at?: string
          upgrade_comments?: string | null
          upgrade_floor_selection?: string | null
          upgrade_interests?: Json | null
          upgrade_interests_notes?: string | null
          window_comments?: string | null
          window_total?: number | null
        }
        Relationships: []
      }
      pricing_config: {
        Row: {
          config_key: string
          config_value: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_percentage: boolean
          updated_at: string
        }
        Insert: {
          config_key: string
          config_value: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_percentage?: boolean
          updated_at?: string
        }
        Update: {
          config_key?: string
          config_value?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_percentage?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone_number: string | null
          unit_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone_number?: string | null
          unit_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone_number?: string | null
          unit_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sales_pipeline: {
        Row: {
          buyer_email: string | null
          buyer_first_name: string | null
          buyer_last_name: string | null
          buyer_phone: string | null
          buyer_selection_id: string | null
          contract_amount: number | null
          contract_signed: boolean | null
          created_at: string
          deposit_amount: number | null
          deposit_date: string | null
          deposit_received: boolean | null
          documents_sent: boolean | null
          documents_signed: boolean | null
          hubspot_contact_id: string | null
          hubspot_deal_id: string | null
          id: string
          lead_date: string | null
          meeting_date: string | null
          notes: string | null
          pipeline_stage: string
          quoted_date: string | null
          signed_date: string | null
          tax_amount: number | null
          total_amount: number | null
          unit_number: string
          unit_type: string | null
          updated_at: string
        }
        Insert: {
          buyer_email?: string | null
          buyer_first_name?: string | null
          buyer_last_name?: string | null
          buyer_phone?: string | null
          buyer_selection_id?: string | null
          contract_amount?: number | null
          contract_signed?: boolean | null
          created_at?: string
          deposit_amount?: number | null
          deposit_date?: string | null
          deposit_received?: boolean | null
          documents_sent?: boolean | null
          documents_signed?: boolean | null
          hubspot_contact_id?: string | null
          hubspot_deal_id?: string | null
          id?: string
          lead_date?: string | null
          meeting_date?: string | null
          notes?: string | null
          pipeline_stage?: string
          quoted_date?: string | null
          signed_date?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          unit_number: string
          unit_type?: string | null
          updated_at?: string
        }
        Update: {
          buyer_email?: string | null
          buyer_first_name?: string | null
          buyer_last_name?: string | null
          buyer_phone?: string | null
          buyer_selection_id?: string | null
          contract_amount?: number | null
          contract_signed?: boolean | null
          created_at?: string
          deposit_amount?: number | null
          deposit_date?: string | null
          deposit_received?: boolean | null
          documents_sent?: boolean | null
          documents_signed?: boolean | null
          hubspot_contact_id?: string | null
          hubspot_deal_id?: string | null
          id?: string
          lead_date?: string | null
          meeting_date?: string | null
          notes?: string | null
          pipeline_stage?: string
          quoted_date?: string | null
          signed_date?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          unit_number?: string
          unit_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_pipeline_buyer_selection_id_fkey"
            columns: ["buyer_selection_id"]
            isOneToOne: false
            referencedRelation: "buyer_selections"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_audit_logs: {
        Row: {
          action_type: string
          change_summary: string | null
          changed_by_email: string | null
          changed_by_user_id: string | null
          changes: Json
          created_at: string
          id: string
          new_values: Json | null
          previous_values: Json | null
          submission_id: string
        }
        Insert: {
          action_type?: string
          change_summary?: string | null
          changed_by_email?: string | null
          changed_by_user_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          new_values?: Json | null
          previous_values?: Json | null
          submission_id: string
        }
        Update: {
          action_type?: string
          change_summary?: string | null
          changed_by_email?: string | null
          changed_by_user_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          new_values?: Json | null
          previous_values?: Json | null
          submission_id?: string
        }
        Relationships: []
      }
      submission_line_items: {
        Row: {
          approval_status: string
          created_at: string
          expected_delivery: string | null
          id: string
          installation_status: string
          line_key: string
          line_label: string | null
          notes: string | null
          order_date: string | null
          po_number: string | null
          quantity_ordered: number | null
          quantity_required: number | null
          received_date: string | null
          risk_level: string
          sku: string | null
          storage_location: string | null
          submission_id: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          approval_status?: string
          created_at?: string
          expected_delivery?: string | null
          id?: string
          installation_status?: string
          line_key: string
          line_label?: string | null
          notes?: string | null
          order_date?: string | null
          po_number?: string | null
          quantity_ordered?: number | null
          quantity_required?: number | null
          received_date?: string | null
          risk_level?: string
          sku?: string | null
          storage_location?: string | null
          submission_id: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?: string
          created_at?: string
          expected_delivery?: string | null
          id?: string
          installation_status?: string
          line_key?: string
          line_label?: string | null
          notes?: string | null
          order_date?: string | null
          po_number?: string | null
          quantity_ordered?: number | null
          quantity_required?: number | null
          received_date?: string | null
          risk_level?: string
          sku?: string | null
          storage_location?: string | null
          submission_id?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      submission_ownership: {
        Row: {
          created_at: string
          designer_assigned: string | null
          due_date: string | null
          id: string
          next_action: string | null
          next_action_owner: string | null
          notes: string | null
          risk_level: string
          sales_rep: string | null
          submission_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          designer_assigned?: string | null
          due_date?: string | null
          id?: string
          next_action?: string | null
          next_action_owner?: string | null
          notes?: string | null
          risk_level?: string
          sales_rep?: string | null
          submission_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          designer_assigned?: string | null
          due_date?: string | null
          id?: string
          next_action?: string | null
          next_action_owner?: string | null
          notes?: string | null
          risk_level?: string
          sales_rep?: string | null
          submission_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      submission_payments: {
        Row: {
          balance_owing: number
          created_at: string
          deposit_amount: number
          deposit_paid: boolean
          deposit_paid_date: string | null
          deposit_required: boolean
          id: string
          invoice_number: string | null
          notes: string | null
          payment_status: string
          submission_id: string
          updated_at: string
        }
        Insert: {
          balance_owing?: number
          created_at?: string
          deposit_amount?: number
          deposit_paid?: boolean
          deposit_paid_date?: string | null
          deposit_required?: boolean
          id?: string
          invoice_number?: string | null
          notes?: string | null
          payment_status?: string
          submission_id: string
          updated_at?: string
        }
        Update: {
          balance_owing?: number
          created_at?: string
          deposit_amount?: number
          deposit_paid?: boolean
          deposit_paid_date?: string | null
          deposit_required?: boolean
          id?: string
          invoice_number?: string | null
          notes?: string | null
          payment_status?: string
          submission_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      unit_area_data: {
        Row: {
          all_lvp: number
          backsplash: number
          created_at: string
          display_order: number
          guest_bathroom: number
          id: string
          laundry: number
          main_living: number
          master_bedroom: number
          master_bedroom_lvp: number
          master_ensuite: number
          second_bedroom: number
          second_bedroom_carpet: number
          unit_type_code: string
          unit_type_label: string
          updated_at: string
        }
        Insert: {
          all_lvp?: number
          backsplash?: number
          created_at?: string
          display_order?: number
          guest_bathroom?: number
          id?: string
          laundry?: number
          main_living?: number
          master_bedroom?: number
          master_bedroom_lvp?: number
          master_ensuite?: number
          second_bedroom?: number
          second_bedroom_carpet?: number
          unit_type_code: string
          unit_type_label: string
          updated_at?: string
        }
        Update: {
          all_lvp?: number
          backsplash?: number
          created_at?: string
          display_order?: number
          guest_bathroom?: number
          id?: string
          laundry?: number
          main_living?: number
          master_bedroom?: number
          master_bedroom_lvp?: number
          master_ensuite?: number
          second_bedroom?: number
          second_bedroom_carpet?: number
          unit_type_code?: string
          unit_type_label?: string
          updated_at?: string
        }
        Relationships: []
      }
      upgrade_line_items: {
        Row: {
          apply_to_material_key: string | null
          blend_into_material: boolean
          cost: number
          cost_type: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          apply_to_material_key?: string | null
          blend_into_material?: boolean
          cost?: number
          cost_type?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          apply_to_material_key?: string | null
          blend_into_material?: boolean
          cost?: number
          cost_type?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      upgrade_materials: {
        Row: {
          cost_per_unit: number
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          material_key: string
          name: string
          parent_material_key: string | null
          unit_type: string
          updated_at: string
        }
        Insert: {
          cost_per_unit?: number
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          material_key: string
          name: string
          parent_material_key?: string | null
          unit_type?: string
          updated_at?: string
        }
        Update: {
          cost_per_unit?: number
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          material_key?: string
          name?: string
          parent_material_key?: string | null
          unit_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_activity_logs: {
        Row: {
          action_type: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          performed_by_email: string | null
          performed_by_user_id: string | null
          target_user_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          performed_by_email?: string | null
          performed_by_user_id?: string | null
          target_user_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          performed_by_email?: string | null
          performed_by_user_id?: string | null
          target_user_email?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
