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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      daily_orb_stocks: {
        Row: {
          avg_volume: number
          created_at: string
          exchange: string
          float_millions: number | null
          id: string
          price: number
          price_change: number
          rvol: number
          scan_date: string
          symbol: string
          volume: number
        }
        Insert: {
          avg_volume: number
          created_at?: string
          exchange: string
          float_millions?: number | null
          id?: string
          price: number
          price_change: number
          rvol: number
          scan_date: string
          symbol: string
          volume: number
        }
        Update: {
          avg_volume?: number
          created_at?: string
          exchange?: string
          float_millions?: number | null
          id?: string
          price?: number
          price_change?: number
          rvol?: number
          scan_date?: string
          symbol?: string
          volume?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      trade_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          price: number | null
          qty: number
          side: string
          status: string
          strategy: string | null
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          price?: number | null
          qty: number
          side: string
          status: string
          strategy?: string | null
          symbol: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          price?: number | null
          qty?: number
          side?: string
          status?: string
          strategy?: string | null
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      trading_configurations: {
        Row: {
          api_key_id: string
          auto_trading_enabled: boolean
          created_at: string
          id: string
          is_paper_trading: boolean
          secret_key: string
          selected_strategy: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_id: string
          auto_trading_enabled?: boolean
          created_at?: string
          id?: string
          is_paper_trading?: boolean
          secret_key: string
          selected_strategy?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_id?: string
          auto_trading_enabled?: boolean
          created_at?: string
          id?: string
          is_paper_trading?: boolean
          secret_key?: string
          selected_strategy?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trading_state: {
        Row: {
          created_at: string
          is_locked: boolean
          lock_date: string | null
          lock_reason: string | null
          manual_stop: boolean
          trades_today: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_locked?: boolean
          lock_date?: string | null
          lock_reason?: string | null
          manual_stop?: boolean
          trades_today?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_locked?: boolean
          lock_date?: string | null
          lock_reason?: string | null
          manual_stop?: boolean
          trades_today?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_orb_tickers: {
        Row: {
          id: string
          symbols: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          symbols?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          symbols?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrypt_secret: { Args: { encrypted_text: string }; Returns: string }
      encrypt_secret: { Args: { plain_text: string }; Returns: string }
      get_active_trading_configs: {
        Args: never
        Returns: {
          api_key_id: string
          auto_trading_enabled: boolean
          id: string
          is_paper_trading: boolean
          secret_key: string
          selected_strategy: string
          user_id: string
        }[]
      }
      get_all_trading_configs: {
        Args: never
        Returns: {
          api_key_id: string
          auto_trading_enabled: boolean
          id: string
          is_paper_trading: boolean
          secret_key: string
          selected_strategy: string
          user_id: string
        }[]
      }
      get_decrypted_trading_config: {
        Args: { p_user_id: string }
        Returns: {
          api_key_id: string
          auto_trading_enabled: boolean
          id: string
          is_paper_trading: boolean
          secret_key: string
          selected_strategy: string
          user_id: string
        }[]
      }
      get_service_role_key: { Args: never; Returns: string }
      get_user_orb_tickers: { Args: { p_user_id: string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
