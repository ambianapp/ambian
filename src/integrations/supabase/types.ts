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
      active_sessions: {
        Row: {
          created_at: string
          device_info: string | null
          id: string
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          id?: string
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: string | null
          id?: string
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          created_at: string
          event_details: Json | null
          event_message: string | null
          event_type: string
          id: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_details?: Json | null
          event_message?: string | null
          event_type: string
          id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_details?: Json | null
          event_message?: string | null
          event_type?: string
          id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      deleted_playlist_tracks: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          id: string
          original_position: number
          playlist_id: string
          playlist_name: string | null
          track_artist: string | null
          track_id: string
          track_title: string | null
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          original_position: number
          playlist_id: string
          playlist_name?: string | null
          track_artist?: string | null
          track_id: string
          track_title?: string | null
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          original_position?: number
          playlist_id?: string
          playlist_name?: string | null
          track_artist?: string | null
          track_id?: string
          track_title?: string | null
        }
        Relationships: []
      }
      industry_collection_playlists: {
        Row: {
          collection_id: string
          created_at: string
          display_order: number | null
          id: string
          playlist_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          display_order?: number | null
          id?: string
          playlist_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          display_order?: number | null
          id?: string
          playlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "industry_collection_playlists_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "industry_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industry_collection_playlists_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      industry_collections: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      liked_playlists: {
        Row: {
          created_at: string
          id: string
          playlist_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          playlist_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          playlist_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liked_playlists_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      liked_songs: {
        Row: {
          created_at: string
          id: string
          track_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          track_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          track_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liked_songs_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      play_history: {
        Row: {
          id: string
          played_at: string
          playlist_id: string
          user_id: string
        }
        Insert: {
          id?: string
          played_at?: string
          playlist_id: string
          user_id: string
        }
        Update: {
          id?: string
          played_at?: string
          playlist_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "play_history_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_schedules: {
        Row: {
          created_at: string
          days_of_week: number[]
          end_time: string
          id: string
          is_active: boolean
          name: string | null
          playlist_id: string
          priority: number
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[]
          end_time: string
          id?: string
          is_active?: boolean
          name?: string | null
          playlist_id: string
          priority?: number
          start_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[]
          end_time?: string
          id?: string
          is_active?: boolean
          name?: string | null
          playlist_id?: string
          priority?: number
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_schedules_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_tracks: {
        Row: {
          added_at: string
          id: string
          playlist_id: string
          position: number | null
          track_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          playlist_id: string
          position?: number | null
          track_id: string
        }
        Update: {
          added_at?: string
          id?: string
          playlist_id?: string
          position?: number | null
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_tracks_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_tracks_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          category: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_public: boolean | null
          is_system: boolean | null
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          is_system?: boolean | null
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          is_system?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          language: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          language?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          language?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_commissions: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string
          id: string
          paid_at: string | null
          partner_id: string
          payout_id: string | null
          period_end: string
          period_start: string
          referral_signup_id: string
          status: string
          stripe_payment_intent_id: string | null
          subscription_amount: number
        }
        Insert: {
          commission_amount: number
          commission_rate: number
          created_at?: string
          id?: string
          paid_at?: string | null
          partner_id: string
          payout_id?: string | null
          period_end: string
          period_start: string
          referral_signup_id: string
          status?: string
          stripe_payment_intent_id?: string | null
          subscription_amount: number
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          partner_id?: string
          payout_id?: string | null
          period_end?: string
          period_start?: string
          referral_signup_id?: string
          status?: string
          stripe_payment_intent_id?: string | null
          subscription_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "referral_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commissions_referral_signup_id_fkey"
            columns: ["referral_signup_id"]
            isOneToOne: false
            referencedRelation: "referral_signups"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_partners: {
        Row: {
          commission_duration_months: number
          commission_rate: number
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          referral_code: string
          stripe_connect_account_id: string | null
          stripe_connect_status: string | null
          updated_at: string
        }
        Insert: {
          commission_duration_months?: number
          commission_rate?: number
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          name: string
          referral_code: string
          stripe_connect_account_id?: string | null
          stripe_connect_status?: string | null
          updated_at?: string
        }
        Update: {
          commission_duration_months?: number
          commission_rate?: number
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          referral_code?: string
          stripe_connect_account_id?: string | null
          stripe_connect_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      referral_signups: {
        Row: {
          commission_end_date: string | null
          created_at: string
          free_months_granted: number
          id: string
          partner_id: string
          referral_code: string
          subscription_start_date: string | null
          user_id: string
        }
        Insert: {
          commission_end_date?: string | null
          created_at?: string
          free_months_granted?: number
          id?: string
          partner_id: string
          referral_code: string
          subscription_start_date?: string | null
          user_id: string
        }
        Update: {
          commission_end_date?: string | null
          created_at?: string
          free_months_granted?: number
          id?: string
          partner_id?: string
          referral_code?: string
          subscription_start_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_signups_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          device_slots: number
          id: string
          plan_type: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          device_slots?: number
          id?: string
          plan_type?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          device_slots?: number
          id?: string
          plan_type?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tracks: {
        Row: {
          album: string | null
          artist: string
          audio_url: string | null
          cover_url: string | null
          created_at: string
          duration: string | null
          genre: string | null
          id: string
          title: string
        }
        Insert: {
          album?: string | null
          artist: string
          audio_url?: string | null
          cover_url?: string | null
          created_at?: string
          duration?: string | null
          genre?: string | null
          id?: string
          title: string
        }
        Update: {
          album?: string | null
          artist?: string
          audio_url?: string | null
          cover_url?: string | null
          created_at?: string
          duration?: string | null
          genre?: string | null
          id?: string
          title?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      has_active_subscription: { Args: { _user_id: string }; Returns: boolean }
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
