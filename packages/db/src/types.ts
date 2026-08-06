export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      action_responses: {
        Row: {
          action_id: string
          anonymized_at: string | null
          cites_art_5bis: boolean
          classification:
            | Database["public"]["Enums"]["pa_response_class"]
            | null
          classified_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          document_url: string | null
          id: string
          proposed_remedy: string | null
          proposed_remedy_anon: string | null
          raw_text: string
          reason: string | null
          reason_anon: string | null
          received_at: string
          source: string
        }
        Insert: {
          action_id: string
          anonymized_at?: string | null
          cites_art_5bis?: boolean
          classification?:
            | Database["public"]["Enums"]["pa_response_class"]
            | null
          classified_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          document_url?: string | null
          id?: string
          proposed_remedy?: string | null
          proposed_remedy_anon?: string | null
          raw_text: string
          reason?: string | null
          reason_anon?: string | null
          received_at?: string
          source?: string
        }
        Update: {
          action_id?: string
          anonymized_at?: string | null
          cites_art_5bis?: boolean
          classification?:
            | Database["public"]["Enums"]["pa_response_class"]
            | null
          classified_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          document_url?: string | null
          id?: string
          proposed_remedy?: string | null
          proposed_remedy_anon?: string | null
          raw_text?: string
          reason?: string | null
          reason_anon?: string | null
          received_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_responses_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_responses_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "admin_actions_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_responses_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "public_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      actions: {
        Row: {
          body_markdown: string
          cluster_id: string
          created_at: string
          deadline_at: string | null
          deadline_basis: string | null
          deadline_days: number | null
          docx_url: string | null
          follow_up_generated_at: string | null
          follow_up_of_action_id: string | null
          id: string
          is_synthetic: boolean
          kind: Database["public"]["Enums"]["action_kind"]
          pdf_url: string | null
          recipient: string | null
          recipient_endpoint_id: string | null
          response_received_at: string | null
          response_text: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          signatures_count: number
          signatures_target: number
          status: Database["public"]["Enums"]["action_status"]
          submitted_at: string | null
          title: string
        }
        Insert: {
          body_markdown: string
          cluster_id: string
          created_at?: string
          deadline_at?: string | null
          deadline_basis?: string | null
          deadline_days?: number | null
          docx_url?: string | null
          follow_up_generated_at?: string | null
          follow_up_of_action_id?: string | null
          id?: string
          is_synthetic?: boolean
          kind: Database["public"]["Enums"]["action_kind"]
          pdf_url?: string | null
          recipient?: string | null
          recipient_endpoint_id?: string | null
          response_received_at?: string | null
          response_text?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signatures_count?: number
          signatures_target?: number
          status?: Database["public"]["Enums"]["action_status"]
          submitted_at?: string | null
          title: string
        }
        Update: {
          body_markdown?: string
          cluster_id?: string
          created_at?: string
          deadline_at?: string | null
          deadline_basis?: string | null
          deadline_days?: number | null
          docx_url?: string | null
          follow_up_generated_at?: string | null
          follow_up_of_action_id?: string | null
          id?: string
          is_synthetic?: boolean
          kind?: Database["public"]["Enums"]["action_kind"]
          pdf_url?: string | null
          recipient?: string | null
          recipient_endpoint_id?: string | null
          response_received_at?: string | null
          response_text?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signatures_count?: number
          signatures_target?: number
          status?: Database["public"]["Enums"]["action_status"]
          submitted_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "actions_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "admin_clusters_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "public_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_follow_up_of_action_id_fkey"
            columns: ["follow_up_of_action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_follow_up_of_action_id_fkey"
            columns: ["follow_up_of_action_id"]
            isOneToOne: false
            referencedRelation: "admin_actions_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_follow_up_of_action_id_fkey"
            columns: ["follow_up_of_action_id"]
            isOneToOne: false
            referencedRelation: "public_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_recipient_endpoint_fkey"
            columns: ["recipient_endpoint_id"]
            isOneToOne: false
            referencedRelation: "pa_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      admins: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          last_seen_at: string | null
          link_allowed_until: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          last_seen_at?: string | null
          link_allowed_until?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          last_seen_at?: string | null
          link_allowed_until?: string | null
        }
        Relationships: []
      }
      app_config: {
        Row: {
          description: string
          key: string
          updated_at: string
          value_int: number
        }
        Insert: {
          description: string
          key: string
          updated_at?: string
          value_int: number
        }
        Update: {
          description?: string
          key?: string
          updated_at?: string
          value_int?: number
        }
        Relationships: []
      }
      citizens: {
        Row: {
          auth_user_id: string | null
          city: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_synthetic: boolean
          last_seen_at: string | null
          neighborhood: string | null
          pending_city_report_id: string | null
          pending_detail_report_id: string | null
          phone_e164: string | null
          postal_code: string | null
          preferred_language: string | null
          telegram_id: number | null
        }
        Insert: {
          auth_user_id?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_synthetic?: boolean
          last_seen_at?: string | null
          neighborhood?: string | null
          pending_city_report_id?: string | null
          pending_detail_report_id?: string | null
          phone_e164?: string | null
          postal_code?: string | null
          preferred_language?: string | null
          telegram_id?: number | null
        }
        Update: {
          auth_user_id?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_synthetic?: boolean
          last_seen_at?: string | null
          neighborhood?: string | null
          pending_city_report_id?: string | null
          pending_detail_report_id?: string | null
          phone_e164?: string | null
          postal_code?: string | null
          preferred_language?: string | null
          telegram_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "citizens_pending_city_report_id_fkey"
            columns: ["pending_city_report_id"]
            isOneToOne: false
            referencedRelation: "public_cluster_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citizens_pending_city_report_id_fkey"
            columns: ["pending_city_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citizens_pending_detail_report_id_fkey"
            columns: ["pending_detail_report_id"]
            isOneToOne: false
            referencedRelation: "public_cluster_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citizens_pending_detail_report_id_fkey"
            columns: ["pending_detail_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      clusters: {
        Row: {
          category: string
          centroid: unknown
          citizens_count: number
          city: string
          created_at: string
          id: string
          is_synthetic: boolean
          neighborhood: string | null
          radius_meters: number | null
          reports_count: number
          review_flag: boolean
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["cluster_status"]
          summary: string
          threshold_reached_at: string | null
          timeline_markdown: string | null
          timeline_updated_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          centroid?: unknown
          citizens_count?: number
          city: string
          created_at?: string
          id?: string
          is_synthetic?: boolean
          neighborhood?: string | null
          radius_meters?: number | null
          reports_count?: number
          review_flag?: boolean
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["cluster_status"]
          summary: string
          threshold_reached_at?: string | null
          timeline_markdown?: string | null
          timeline_updated_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          centroid?: unknown
          citizens_count?: number
          city?: string
          created_at?: string
          id?: string
          is_synthetic?: boolean
          neighborhood?: string | null
          radius_meters?: number | null
          reports_count?: number
          review_flag?: boolean
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["cluster_status"]
          summary?: string
          threshold_reached_at?: string | null
          timeline_markdown?: string | null
          timeline_updated_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_id: string | null
          attempts: number
          channel: Database["public"]["Enums"]["notification_channel"]
          citizen_id: string
          cluster_id: string | null
          created_at: string
          dedupe_key: string
          failed_at: string | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          last_error: string | null
          payload: Json
          report_id: string | null
          sent_at: string | null
        }
        Insert: {
          action_id?: string | null
          attempts?: number
          channel: Database["public"]["Enums"]["notification_channel"]
          citizen_id: string
          cluster_id?: string | null
          created_at?: string
          dedupe_key: string
          failed_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          last_error?: string | null
          payload?: Json
          report_id?: string | null
          sent_at?: string | null
        }
        Update: {
          action_id?: string | null
          attempts?: number
          channel?: Database["public"]["Enums"]["notification_channel"]
          citizen_id?: string
          cluster_id?: string | null
          created_at?: string
          dedupe_key?: string
          failed_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          last_error?: string | null
          payload?: Json
          report_id?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "admin_actions_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "public_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_citizen_id_fkey"
            columns: ["citizen_id"]
            isOneToOne: false
            referencedRelation: "citizens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "admin_clusters_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "public_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "public_cluster_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      pa_endpoints: {
        Row: {
          address: string | null
          city: string
          email: string | null
          id: string
          name: string | null
          pec: string | null
          role: string
          source_url: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          address?: string | null
          city: string
          email?: string | null
          id?: string
          name?: string | null
          pec?: string | null
          role: string
          source_url?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string
          email?: string | null
          id?: string
          name?: string | null
          pec?: string | null
          role?: string
          source_url?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      report_embeddings: {
        Row: {
          created_at: string
          embedding: string
          model: string
          report_id: string
        }
        Insert: {
          created_at?: string
          embedding: string
          model?: string
          report_id: string
        }
        Update: {
          created_at?: string
          embedding?: string
          model?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_embeddings_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "public_cluster_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_embeddings_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_media: {
        Row: {
          bytes: number | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          is_synthetic: boolean
          kind: Database["public"]["Enums"]["media_kind"]
          mime_type: string | null
          report_id: string
          storage_path: string
          transcript: string | null
        }
        Insert: {
          bytes?: number | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_synthetic?: boolean
          kind: Database["public"]["Enums"]["media_kind"]
          mime_type?: string | null
          report_id: string
          storage_path: string
          transcript?: string | null
        }
        Update: {
          bytes?: number | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_synthetic?: boolean
          kind?: Database["public"]["Enums"]["media_kind"]
          mime_type?: string | null
          report_id?: string
          storage_path?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_media_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "public_cluster_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_media_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          anon_redactions: Json | null
          anon_reviewed_at: string | null
          anon_text: string | null
          category: string | null
          channel: Database["public"]["Enums"]["report_channel"]
          citizen_id: string | null
          city: string | null
          clean_text: string | null
          cluster_id: string | null
          created_at: string
          external_id: string | null
          follow_up_question: string | null
          id: string
          is_synthetic: boolean
          location: unknown
          location_hint: string | null
          moderated_at: string | null
          moderation_categories: Json | null
          moderation_flagged: boolean
          moderation_reviewed_at: string | null
          moderation_reviewed_by: string | null
          moderation_score: number | null
          neighborhood: string | null
          original_language: string | null
          previous_cluster_id: string | null
          public_token: string
          raw_media_urls: string[]
          raw_text: string
          status: Database["public"]["Enums"]["report_status"]
          triaged_at: string | null
          urgency: number | null
        }
        Insert: {
          anon_redactions?: Json | null
          anon_reviewed_at?: string | null
          anon_text?: string | null
          category?: string | null
          channel: Database["public"]["Enums"]["report_channel"]
          citizen_id?: string | null
          city?: string | null
          clean_text?: string | null
          cluster_id?: string | null
          created_at?: string
          external_id?: string | null
          follow_up_question?: string | null
          id?: string
          is_synthetic?: boolean
          location?: unknown
          location_hint?: string | null
          moderated_at?: string | null
          moderation_categories?: Json | null
          moderation_flagged?: boolean
          moderation_reviewed_at?: string | null
          moderation_reviewed_by?: string | null
          moderation_score?: number | null
          neighborhood?: string | null
          original_language?: string | null
          previous_cluster_id?: string | null
          public_token?: string
          raw_media_urls?: string[]
          raw_text: string
          status?: Database["public"]["Enums"]["report_status"]
          triaged_at?: string | null
          urgency?: number | null
        }
        Update: {
          anon_redactions?: Json | null
          anon_reviewed_at?: string | null
          anon_text?: string | null
          category?: string | null
          channel?: Database["public"]["Enums"]["report_channel"]
          citizen_id?: string | null
          city?: string | null
          clean_text?: string | null
          cluster_id?: string | null
          created_at?: string
          external_id?: string | null
          follow_up_question?: string | null
          id?: string
          is_synthetic?: boolean
          location?: unknown
          location_hint?: string | null
          moderated_at?: string | null
          moderation_categories?: Json | null
          moderation_flagged?: boolean
          moderation_reviewed_at?: string | null
          moderation_reviewed_by?: string | null
          moderation_score?: number | null
          neighborhood?: string | null
          original_language?: string | null
          previous_cluster_id?: string | null
          public_token?: string
          raw_media_urls?: string[]
          raw_text?: string
          status?: Database["public"]["Enums"]["report_status"]
          triaged_at?: string | null
          urgency?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_citizen_id_fkey"
            columns: ["citizen_id"]
            isOneToOne: false
            referencedRelation: "citizens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "admin_clusters_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "public_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_previous_cluster_id_fkey"
            columns: ["previous_cluster_id"]
            isOneToOne: false
            referencedRelation: "admin_clusters_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_previous_cluster_id_fkey"
            columns: ["previous_cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_previous_cluster_id_fkey"
            columns: ["previous_cluster_id"]
            isOneToOne: false
            referencedRelation: "public_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      signatures: {
        Row: {
          action_id: string
          citizen_id: string
          id: string
          ip_hash: string | null
          signed_at: string
        }
        Insert: {
          action_id: string
          citizen_id: string
          id?: string
          ip_hash?: string | null
          signed_at?: string
        }
        Update: {
          action_id?: string
          citizen_id?: string
          id?: string
          ip_hash?: string | null
          signed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signatures_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "admin_actions_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "public_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_citizen_id_fkey"
            columns: ["citizen_id"]
            isOneToOne: false
            referencedRelation: "citizens"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      storage_deletions: {
        Row: {
          attempts: number
          bucket: string
          deleted_at: string | null
          id: string
          last_error: string | null
          path: string
          reason: string
          requested_at: string
        }
        Insert: {
          attempts?: number
          bucket: string
          deleted_at?: string | null
          id?: string
          last_error?: string | null
          path: string
          reason?: string
          requested_at?: string
        }
        Update: {
          attempts?: number
          bucket?: string
          deleted_at?: string | null
          id?: string
          last_error?: string | null
          path?: string
          reason?: string
          requested_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_actions_queue: {
        Row: {
          city: string | null
          cluster_id: string | null
          cluster_review_flag: boolean | null
          cluster_title: string | null
          created_at: string | null
          deadline_at: string | null
          deadline_basis: string | null
          deadline_days: number | null
          follow_up_generated_at: string | null
          follow_up_of_action_id: string | null
          id: string | null
          is_synthetic: boolean | null
          kind: Database["public"]["Enums"]["action_kind"] | null
          recipient: string | null
          response_received_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risposte_da_confermare: number | null
          risposte_totali: number | null
          signatures_count: number | null
          signatures_target: number | null
          status: Database["public"]["Enums"]["action_status"] | null
          submitted_at: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actions_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "admin_clusters_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "public_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_follow_up_of_action_id_fkey"
            columns: ["follow_up_of_action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_follow_up_of_action_id_fkey"
            columns: ["follow_up_of_action_id"]
            isOneToOne: false
            referencedRelation: "admin_actions_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_follow_up_of_action_id_fkey"
            columns: ["follow_up_of_action_id"]
            isOneToOne: false
            referencedRelation: "public_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_clusters_overview: {
        Row: {
          atti_bozza: number | null
          atti_revisionati: number | null
          atti_totali: number | null
          category: string | null
          citizens_count: number | null
          city: string | null
          created_at: string | null
          e_pubblico: boolean | null
          id: string | null
          is_synthetic: boolean | null
          neighborhood: string | null
          reports_count: number | null
          review_flag: boolean | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["cluster_status"] | null
          timeline_updated_at: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      admin_notifications_health: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"] | null
          fallite: number | null
          inviate: number | null
          kind: Database["public"]["Enums"]["notification_kind"] | null
          ora: string | null
          tentativi_max: number | null
          totali: number | null
        }
        Relationships: []
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      public_action_responses: {
        Row: {
          action_id: string | null
          cites_art_5bis: boolean | null
          classification:
            | Database["public"]["Enums"]["pa_response_class"]
            | null
          confirmed_at: string | null
          id: string | null
          proposed_remedy: string | null
          reason: string | null
          received_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_responses_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_responses_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "admin_actions_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_responses_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "public_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      public_actions: {
        Row: {
          body_markdown: string | null
          cluster_id: string | null
          created_at: string | null
          deadline_at: string | null
          deadline_basis: string | null
          deadline_days: number | null
          docx_url: string | null
          follow_up_of_action_id: string | null
          id: string | null
          kind: Database["public"]["Enums"]["action_kind"] | null
          pdf_url: string | null
          recipient: string | null
          response_received_at: string | null
          response_text: string | null
          reviewed_by: string | null
          revisionato: boolean | null
          signatures_count: number | null
          signatures_target: number | null
          status: Database["public"]["Enums"]["action_status"] | null
          submitted_at: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actions_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "admin_clusters_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "public_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_follow_up_of_action_id_fkey"
            columns: ["follow_up_of_action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_follow_up_of_action_id_fkey"
            columns: ["follow_up_of_action_id"]
            isOneToOne: false
            referencedRelation: "admin_actions_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_follow_up_of_action_id_fkey"
            columns: ["follow_up_of_action_id"]
            isOneToOne: false
            referencedRelation: "public_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      public_city_responsiveness: {
        Row: {
          accolte: number | null
          actions_sent: number | null
          avg_response_days: number | null
          city: string | null
          interlocutorie: number | null
          irricevibili: number | null
          respinte: number | null
          responses_confirmed: number | null
        }
        Relationships: []
      }
      public_city_stats: {
        Row: {
          actions_sent: number | null
          citizens_count: number | null
          city: string | null
          clusters_count: number | null
          reports_count: number | null
          responses_received: number | null
        }
        Relationships: []
      }
      public_cluster_reports: {
        Row: {
          anon_text: string | null
          category: string | null
          cluster_id: string | null
          created_at: string | null
          id: string | null
          location: unknown
          urgency: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "admin_clusters_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "public_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      public_clusters: {
        Row: {
          category: string | null
          centroid: unknown
          citizens_count: number | null
          city: string | null
          created_at: string | null
          id: string | null
          neighborhood: string | null
          radius_meters: number | null
          reports_count: number | null
          status: Database["public"]["Enums"]["cluster_status"] | null
          summary: string | null
          threshold_reached_at: string | null
          timeline_markdown: string | null
          timeline_updated_at: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          centroid?: never
          citizens_count?: number | null
          city?: string | null
          created_at?: never
          id?: string | null
          neighborhood?: string | null
          radius_meters?: number | null
          reports_count?: number | null
          status?: Database["public"]["Enums"]["cluster_status"] | null
          summary?: string | null
          threshold_reached_at?: string | null
          timeline_markdown?: string | null
          timeline_updated_at?: never
          title?: string | null
          updated_at?: never
        }
        Update: {
          category?: string | null
          centroid?: never
          citizens_count?: number | null
          city?: string | null
          created_at?: never
          id?: string | null
          neighborhood?: string | null
          radius_meters?: number | null
          reports_count?: number | null
          status?: Database["public"]["Enums"]["cluster_status"] | null
          summary?: string | null
          threshold_reached_at?: string | null
          timeline_markdown?: string | null
          timeline_updated_at?: never
          title?: string | null
          updated_at?: never
        }
        Relationships: []
      }
      public_platform_stats: {
        Row: {
          actions_sent: number | null
          citizens_count: number | null
          clusters_count: number | null
          reports_count: number | null
          responses_received: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      action_follow_up_kind: {
        Args: { kind: Database["public"]["Enums"]["action_kind"] }
        Returns: Database["public"]["Enums"]["action_kind"]
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      blur_point: { Args: { meters?: number; p: unknown }; Returns: unknown }
      cluster_brigading_signals: {
        Args: { target: string }
        Returns: {
          n_citizens: number
          n_citizens_nuovi: number
          n_reports: number
          quota_stessa_ora: number
          similarita_media_interna: number
        }[]
      }
      config_int: { Args: { config_key: string }; Returns: number }
      count_recent_reports: {
        Args: { target_citizen: string; window_minutes?: number }
        Returns: number
      }
      current_citizen_id: { Args: never; Returns: string }
      delete_citizen_account: { Args: { target: string }; Returns: undefined }
      delete_my_account: { Args: never; Returns: undefined }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_privacy_config: {
        Args: never
        Returns: {
          key: string
          value_int: number
        }[]
      }
      get_report_status: {
        Args: { token: string }
        Returns: {
          anon_text: string
          category: string
          citta: string
          cluster_citizens: number
          cluster_id: string
          cluster_is_public: boolean
          cluster_reports: number
          cluster_status: Database["public"]["Enums"]["cluster_status"]
          cluster_title: string
          created_at: string
          quartiere: string
          status: Database["public"]["Enums"]["report_status"]
          urgency: number
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      is_admin: { Args: never; Returns: boolean }
      link_current_admin: { Args: never; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      match_similar_reports: {
        Args: {
          filter_category?: string
          filter_city?: string
          filter_neighborhood?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          citizen_id: string
          cluster_id: string
          report_id: string
          similarity: number
        }[]
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      refresh_cluster_counters: { Args: { target: string }; Returns: undefined }
      report_is_under_moderation: { Args: { target: string }; Returns: boolean }
      search_public_clusters: {
        Args: {
          filter_city?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          category: string
          citizens_count: number
          city: string
          cluster_id: string
          neighborhood: string
          reports_count: number
          status: Database["public"]["Enums"]["cluster_status"]
          summary: string
          title: string
        }[]
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      action_kind:
        | "esposto_procura"
        | "accesso_civico"
        | "segnalazione_difensore_civico"
        | "mozione_consigliere"
        | "dossier_giornalistico"
        | "diffida_pa"
        | "sollecito"
        | "riesame_accesso_civico"
      action_status:
        | "bozza"
        | "in_firma"
        | "inviata"
        | "risposta_ricevuta"
        | "archiviata"
      cluster_status:
        | "emergente"
        | "attivo"
        | "in_azione"
        | "risolto"
        | "ignorato"
      media_kind: "audio" | "foto"
      notification_channel: "telegram" | "email" | "whatsapp"
      notification_kind:
        | "gruppo_formato"
        | "gruppo_pubblico"
        | "atto_preparato"
        | "pa_ha_risposto"
        | "scadenza_meta"
        | "scadenza_raggiunta"
        | "scadenza_superata"
        | "moderazione_riammessa"
        | "moderazione_confermata"
      pa_response_class:
        | "accolta"
        | "respinta"
        | "interlocutoria"
        | "irricevibile"
      report_channel: "whatsapp" | "telegram" | "web" | "voice"
      report_status:
        | "nuovo"
        | "triaged"
        | "clustered"
        | "quarantena"
        | "archiviato"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      action_kind: [
        "esposto_procura",
        "accesso_civico",
        "segnalazione_difensore_civico",
        "mozione_consigliere",
        "dossier_giornalistico",
        "diffida_pa",
        "sollecito",
        "riesame_accesso_civico",
      ],
      action_status: [
        "bozza",
        "in_firma",
        "inviata",
        "risposta_ricevuta",
        "archiviata",
      ],
      cluster_status: [
        "emergente",
        "attivo",
        "in_azione",
        "risolto",
        "ignorato",
      ],
      media_kind: ["audio", "foto"],
      notification_channel: ["telegram", "email", "whatsapp"],
      notification_kind: [
        "gruppo_formato",
        "gruppo_pubblico",
        "atto_preparato",
        "pa_ha_risposto",
        "scadenza_meta",
        "scadenza_raggiunta",
        "scadenza_superata",
        "moderazione_riammessa",
        "moderazione_confermata",
      ],
      pa_response_class: [
        "accolta",
        "respinta",
        "interlocutoria",
        "irricevibile",
      ],
      report_channel: ["whatsapp", "telegram", "web", "voice"],
      report_status: [
        "nuovo",
        "triaged",
        "clustered",
        "quarantena",
        "archiviato",
      ],
    },
  },
} as const

