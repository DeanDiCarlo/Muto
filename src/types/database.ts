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
      api_usage_log: {
        Row: {
          cost_cents: number
          created_at: string
          generation_job_id: string | null
          id: string
          input_tokens: number
          institution_id: string
          lab_id: string | null
          model: string
          output_tokens: number
          usage_type: Database["public"]["Enums"]["usage_type"]
          user_id: string
        }
        Insert: {
          cost_cents?: number
          created_at?: string
          generation_job_id?: string | null
          id?: string
          input_tokens?: number
          institution_id: string
          lab_id?: string | null
          model: string
          output_tokens?: number
          usage_type: Database["public"]["Enums"]["usage_type"]
          user_id: string
        }
        Update: {
          cost_cents?: number
          created_at?: string
          generation_job_id?: string | null
          id?: string
          input_tokens?: number
          institution_id?: string
          lab_id?: string | null
          model?: string
          output_tokens?: number
          usage_type?: Database["public"]["Enums"]["usage_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_log_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_usage_log_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_usage_log_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_usage_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          chat_session_id: string
          content: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["chat_role"]
        }
        Insert: {
          chat_session_id: string
          content: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["chat_role"]
        }
        Update: {
          chat_session_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["chat_role"]
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          enrollment_id: string
          id: string
          lab_id: string
          last_message_at: string | null
          started_at: string
        }
        Insert: {
          enrollment_id: string
          id?: string
          lab_id: string
          last_message_at?: string | null
          started_at?: string
        }
        Update: {
          enrollment_id?: string
          id?: string
          lab_id?: string
          last_message_at?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      cognitive_model_snapshots: {
        Row: {
          computed_at: string
          enrollment_id: string
          id: string
          lab_id: string | null
          summary: Json
        }
        Insert: {
          computed_at?: string
          enrollment_id: string
          id?: string
          lab_id?: string | null
          summary: Json
        }
        Update: {
          computed_at?: string
          enrollment_id?: string
          id?: string
          lab_id?: string | null
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cognitive_model_snapshots_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cognitive_model_snapshots_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_evaluations: {
        Row: {
          blooms_level: Database["public"]["Enums"]["blooms_level"]
          concept_id: string
          confidence: number
          enrollment_id: string
          evaluated_at: string
          id: string
          mastery_score: number
          reasoning: string | null
          review_response_id: string
        }
        Insert: {
          blooms_level: Database["public"]["Enums"]["blooms_level"]
          concept_id: string
          confidence: number
          enrollment_id: string
          evaluated_at?: string
          id?: string
          mastery_score: number
          reasoning?: string | null
          review_response_id: string
        }
        Update: {
          blooms_level?: Database["public"]["Enums"]["blooms_level"]
          concept_id?: string
          confidence?: number
          enrollment_id?: string
          evaluated_at?: string
          id?: string
          mastery_score?: number
          reasoning?: string | null
          review_response_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concept_evaluations_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_evaluations_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_evaluations_review_response_id_fkey"
            columns: ["review_response_id"]
            isOneToOne: false
            referencedRelation: "review_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          lab_id: string
          name: string
          parent_concept_id: string | null
          position: number
          status: Database["public"]["Enums"]["concept_status"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          lab_id: string
          name: string
          parent_concept_id?: string | null
          position?: number
          status?: Database["public"]["Enums"]["concept_status"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          lab_id?: string
          name?: string
          parent_concept_id?: string | null
          position?: number
          status?: Database["public"]["Enums"]["concept_status"]
        }
        Relationships: [
          {
            foreignKeyName: "concepts_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepts_parent_concept_id_fkey"
            columns: ["parent_concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_blocks: {
        Row: {
          block_type: Database["public"]["Enums"]["block_type"]
          content: string
          created_at: string
          heading_level: number | null
          id: string
          lab_id: string | null
          metadata: Json | null
          page_number: number | null
          position: number
          source_material_id: string
        }
        Insert: {
          block_type: Database["public"]["Enums"]["block_type"]
          content: string
          created_at?: string
          heading_level?: number | null
          id?: string
          lab_id?: string | null
          metadata?: Json | null
          page_number?: number | null
          position?: number
          source_material_id: string
        }
        Update: {
          block_type?: Database["public"]["Enums"]["block_type"]
          content?: string
          created_at?: string
          heading_level?: number | null
          id?: string
          lab_id?: string | null
          metadata?: Json | null
          page_number?: number | null
          position?: number
          source_material_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_blocks_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_blocks_source_material_id_fkey"
            columns: ["source_material_id"]
            isOneToOne: false
            referencedRelation: "source_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      content_embeddings: {
        Row: {
          chunk_index: number
          chunk_text: string
          content_block_id: string
          created_at: string
          embedding: string
          id: string
          lab_id: string | null
        }
        Insert: {
          chunk_index?: number
          chunk_text: string
          content_block_id: string
          created_at?: string
          embedding: string
          id?: string
          lab_id?: string | null
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          content_block_id?: string
          created_at?: string
          embedding?: string
          id?: string
          lab_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_embeddings_content_block_id_fkey"
            columns: ["content_block_id"]
            isOneToOne: false
            referencedRelation: "content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_embeddings_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_alerts: {
        Row: {
          acknowledged: boolean
          alert_type: Database["public"]["Enums"]["alert_type"]
          created_at: string
          current_value: number
          id: string
          institution_id: string
          limit_value: number
          message: string
          rate_limit_id: string
        }
        Insert: {
          acknowledged?: boolean
          alert_type: Database["public"]["Enums"]["alert_type"]
          created_at?: string
          current_value: number
          id?: string
          institution_id: string
          limit_value: number
          message: string
          rate_limit_id: string
        }
        Update: {
          acknowledged?: boolean
          alert_type?: Database["public"]["Enums"]["alert_type"]
          created_at?: string
          current_value?: number
          id?: string
          institution_id?: string
          limit_value?: number
          message?: string
          rate_limit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_alerts_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_alerts_rate_limit_id_fkey"
            columns: ["rate_limit_id"]
            isOneToOne: false
            referencedRelation: "rate_limits"
            referencedColumns: ["id"]
          },
        ]
      }
      course_instances: {
        Row: {
          course_id: string
          created_at: string
          display_slug: string
          id: string
          institution_id: string
          is_active: boolean
          join_code: string
          join_link: string | null
          semester: string
          slug: string
        }
        Insert: {
          course_id: string
          created_at?: string
          display_slug: string
          id?: string
          institution_id: string
          is_active?: boolean
          join_code: string
          join_link?: string | null
          semester: string
          slug: string
        }
        Update: {
          course_id?: string
          created_at?: string
          display_slug?: string
          id?: string
          institution_id?: string
          is_active?: boolean
          join_code?: string
          join_link?: string | null
          semester?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_instances_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_instances_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      course_staff: {
        Row: {
          can_edit_structure: boolean
          course_instance_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          can_edit_structure?: boolean
          course_instance_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          can_edit_structure?: boolean
          course_instance_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_staff_course_instance_id_fkey"
            columns: ["course_instance_id"]
            isOneToOne: false
            referencedRelation: "course_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          display_slug: string
          id: string
          institution_id: string
          slug: string
          subject_area: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          display_slug: string
          id?: string
          institution_id: string
          slug: string
          subject_area?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          display_slug?: string
          id?: string
          institution_id?: string
          slug?: string
          subject_area?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          course_instance_id: string
          enrolled_at: string
          id: string
          user_id: string
        }
        Insert: {
          course_instance_id: string
          enrolled_at?: string
          id?: string
          user_id: string
        }
        Update: {
          course_instance_id?: string
          enrolled_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_instance_id_fkey"
            columns: ["course_instance_id"]
            isOneToOne: false
            referencedRelation: "course_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_jobs: {
        Row: {
          actual_cost_cents: number | null
          completed_at: string | null
          course_id: string
          created_at: string
          created_by: string
          current_step: string | null
          error_message: string | null
          estimated_cost_cents: number | null
          id: string
          input_payload: Json | null
          job_type: Database["public"]["Enums"]["job_type"]
          output_payload: Json | null
          priority: number
          progress_percent: number
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          actual_cost_cents?: number | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          created_by: string
          current_step?: string | null
          error_message?: string | null
          estimated_cost_cents?: number | null
          id?: string
          input_payload?: Json | null
          job_type: Database["public"]["Enums"]["job_type"]
          output_payload?: Json | null
          priority?: number
          progress_percent?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          actual_cost_cents?: number | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          created_by?: string
          current_step?: string | null
          error_message?: string | null
          estimated_cost_cents?: number | null
          id?: string
          input_payload?: Json | null
          job_type?: Database["public"]["Enums"]["job_type"]
          output_payload?: Json | null
          priority?: number
          progress_percent?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "generation_jobs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_plans: {
        Row: {
          approved_at: string | null
          course_id: string
          created_at: string
          generation_job_id: string
          id: string
          plan_data: Json
          professor_notes: string | null
          status: Database["public"]["Enums"]["generation_plan_status"]
        }
        Insert: {
          approved_at?: string | null
          course_id: string
          created_at?: string
          generation_job_id: string
          id?: string
          plan_data: Json
          professor_notes?: string | null
          status?: Database["public"]["Enums"]["generation_plan_status"]
        }
        Update: {
          approved_at?: string | null
          course_id?: string
          created_at?: string
          generation_job_id?: string
          id?: string
          plan_data?: Json
          professor_notes?: string | null
          status?: Database["public"]["Enums"]["generation_plan_status"]
        }
        Relationships: [
          {
            foreignKeyName: "generation_plans_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_plans_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_deadlines: {
        Row: {
          course_instance_id: string
          created_at: string
          day_of_week: number | null
          id: string
          is_active: boolean
          is_recurring: boolean
          label: string
          specific_date: string | null
          time: string
        }
        Insert: {
          course_instance_id: string
          created_at?: string
          day_of_week?: number | null
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          label: string
          specific_date?: string | null
          time: string
        }
        Update: {
          course_instance_id?: string
          created_at?: string
          day_of_week?: number | null
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          label?: string
          specific_date?: string | null
          time?: string
        }
        Relationships: [
          {
            foreignKeyName: "insight_deadlines_course_instance_id_fkey"
            columns: ["course_instance_id"]
            isOneToOne: false
            referencedRelation: "course_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_reports: {
        Row: {
          content: Json
          course_instance_id: string
          generated_at: string
          id: string
          insight_deadline_id: string | null
          report_type: Database["public"]["Enums"]["report_type"]
        }
        Insert: {
          content: Json
          course_instance_id: string
          generated_at?: string
          id?: string
          insight_deadline_id?: string | null
          report_type: Database["public"]["Enums"]["report_type"]
        }
        Update: {
          content?: Json
          course_instance_id?: string
          generated_at?: string
          id?: string
          insight_deadline_id?: string | null
          report_type?: Database["public"]["Enums"]["report_type"]
        }
        Relationships: [
          {
            foreignKeyName: "insight_reports_course_instance_id_fkey"
            columns: ["course_instance_id"]
            isOneToOne: false
            referencedRelation: "course_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insight_reports_insight_deadline_id_fkey"
            columns: ["insight_deadline_id"]
            isOneToOne: false
            referencedRelation: "insight_deadlines"
            referencedColumns: ["id"]
          },
        ]
      }
      institutions: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          sso_config: Json | null
          sso_provider: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          sso_config?: Json | null
          sso_provider?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sso_config?: Json | null
          sso_provider?: string | null
        }
        Relationships: []
      }
      lab_embeddings: {
        Row: {
          created_at: string
          embedded_text: string
          embedding: string
          id: string
          lab_id: string
          quality_score: number
          subject_area: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          embedded_text: string
          embedding: string
          id?: string
          lab_id: string
          quality_score?: number
          subject_area?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          embedded_text?: string
          embedding?: string
          id?: string
          lab_id?: string
          quality_score?: number
          subject_area?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_embeddings_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: true
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      labs: {
        Row: {
          blooms_structure: Json | null
          content: Json | null
          content_version: number
          course_id: string
          created_at: string
          description: string | null
          generated_at: string | null
          generation_context_snapshot: Json | null
          generation_status: Database["public"]["Enums"]["lab_generation_status"]
          id: string
          module_id: string
          position: number
          sandpack_files: Json | null
          slug: string
          title: string
          tutor_context: Json | null
        }
        Insert: {
          blooms_structure?: Json | null
          content?: Json | null
          content_version?: number
          course_id: string
          created_at?: string
          description?: string | null
          generated_at?: string | null
          generation_context_snapshot?: Json | null
          generation_status?: Database["public"]["Enums"]["lab_generation_status"]
          id?: string
          module_id: string
          position?: number
          sandpack_files?: Json | null
          slug: string
          title: string
          tutor_context?: Json | null
        }
        Update: {
          blooms_structure?: Json | null
          content?: Json | null
          content_version?: number
          course_id?: string
          created_at?: string
          description?: string | null
          generated_at?: string | null
          generation_context_snapshot?: Json | null
          generation_status?: Database["public"]["Enums"]["lab_generation_status"]
          id?: string
          module_id?: string
          position?: number
          sandpack_files?: Json | null
          slug?: string
          title?: string
          tutor_context?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "labs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labs_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          id: string
          position: number
          title: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          title: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          action_on_limit: Database["public"]["Enums"]["limit_action"]
          created_at: string
          id: string
          institution_id: string | null
          is_active: boolean
          limit_type: Database["public"]["Enums"]["limit_type"]
          limit_value: number
          usage_type: Database["public"]["Enums"]["usage_type"]
        }
        Insert: {
          action_on_limit?: Database["public"]["Enums"]["limit_action"]
          created_at?: string
          id?: string
          institution_id?: string | null
          is_active?: boolean
          limit_type: Database["public"]["Enums"]["limit_type"]
          limit_value: number
          usage_type: Database["public"]["Enums"]["usage_type"]
        }
        Update: {
          action_on_limit?: Database["public"]["Enums"]["limit_action"]
          created_at?: string
          id?: string
          institution_id?: string | null
          is_active?: boolean
          limit_type?: Database["public"]["Enums"]["limit_type"]
          limit_value?: number
          usage_type?: Database["public"]["Enums"]["usage_type"]
        }
        Relationships: [
          {
            foreignKeyName: "rate_limits_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_questions: {
        Row: {
          blooms_level: Database["public"]["Enums"]["blooms_level"]
          concept_id: string
          created_at: string
          evaluation_rubric: string | null
          id: string
          is_active: boolean
          lab_id: string
          position: number
          question_text: string
          source: Database["public"]["Enums"]["question_source"]
        }
        Insert: {
          blooms_level: Database["public"]["Enums"]["blooms_level"]
          concept_id: string
          created_at?: string
          evaluation_rubric?: string | null
          id?: string
          is_active?: boolean
          lab_id: string
          position?: number
          question_text: string
          source?: Database["public"]["Enums"]["question_source"]
        }
        Update: {
          blooms_level?: Database["public"]["Enums"]["blooms_level"]
          concept_id?: string
          created_at?: string
          evaluation_rubric?: string | null
          id?: string
          is_active?: boolean
          lab_id?: string
          position?: number
          question_text?: string
          source?: Database["public"]["Enums"]["question_source"]
        }
        Relationships: [
          {
            foreignKeyName: "review_questions_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_questions_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      review_responses: {
        Row: {
          answer_text: string
          answered_at: string
          id: string
          review_question_id: string
          review_session_id: string
        }
        Insert: {
          answer_text: string
          answered_at?: string
          id?: string
          review_question_id: string
          review_session_id: string
        }
        Update: {
          answer_text?: string
          answered_at?: string
          id?: string
          review_question_id?: string
          review_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_responses_review_question_id_fkey"
            columns: ["review_question_id"]
            isOneToOne: false
            referencedRelation: "review_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_responses_review_session_id_fkey"
            columns: ["review_session_id"]
            isOneToOne: false
            referencedRelation: "review_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_sessions: {
        Row: {
          completed_at: string | null
          enrollment_id: string
          id: string
          lab_id: string
          started_at: string
        }
        Insert: {
          completed_at?: string | null
          enrollment_id: string
          id?: string
          lab_id: string
          started_at?: string
        }
        Update: {
          completed_at?: string | null
          enrollment_id?: string
          id?: string
          lab_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_sessions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_sessions_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      source_materials: {
        Row: {
          course_id: string
          created_at: string
          file_name: string
          file_size_bytes: number | null
          file_type: string
          id: string
          lab_id: string | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          course_id: string
          created_at?: string
          file_name: string
          file_size_bytes?: number | null
          file_type: string
          id?: string
          lab_id?: string | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          course_id?: string
          created_at?: string
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string
          id?: string
          lab_id?: string | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_materials_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_materials_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_materials_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          institution_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          institution_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          institution_id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "users_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      student_evaluations_view: {
        Row: {
          blooms_level: Database["public"]["Enums"]["blooms_level"] | null
          concept_id: string | null
          enrollment_id: string | null
          evaluated_at: string | null
          id: string | null
          reasoning: string | null
          review_response_id: string | null
        }
        Insert: {
          blooms_level?: Database["public"]["Enums"]["blooms_level"] | null
          concept_id?: string | null
          enrollment_id?: string | null
          evaluated_at?: string | null
          id?: string | null
          reasoning?: string | null
          review_response_id?: string | null
        }
        Update: {
          blooms_level?: Database["public"]["Enums"]["blooms_level"] | null
          concept_id?: string | null
          enrollment_id?: string | null
          evaluated_at?: string | null
          id?: string | null
          reasoning?: string | null
          review_response_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concept_evaluations_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_evaluations_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_evaluations_review_response_id_fkey"
            columns: ["review_response_id"]
            isOneToOne: false
            referencedRelation: "review_responses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      alert_type: "threshold_warning" | "threshold_exceeded"
      block_type:
        | "heading"
        | "paragraph"
        | "figure"
        | "table"
        | "equation"
        | "list"
        | "code"
      blooms_level:
        | "remember"
        | "understand"
        | "apply"
        | "analyze"
        | "evaluate"
        | "create"
      chat_role: "student" | "assistant"
      concept_status: "proposed" | "approved" | "rejected"
      generation_plan_status: "draft" | "approved" | "generating" | "completed"
      job_status: "pending" | "running" | "completed" | "failed" | "cancelled"
      job_type:
        | "parse_materials"
        | "propose_plan"
        | "generate_lab"
        | "generate_batch"
        | "generate_embeddings"
        | "generate_review_questions"
        | "evaluate_review"
      lab_generation_status: "pending" | "generating" | "complete" | "failed"
      limit_action: "block" | "alert" | "queue"
      limit_type:
        | "per_user_hourly"
        | "per_user_daily"
        | "per_institution_daily"
        | "per_institution_monthly"
        | "cost_daily_cents"
        | "cost_monthly_cents"
      question_source: "generated" | "custom"
      report_type: "scheduled" | "on_demand"
      staff_role: "professor" | "ta"
      usage_type:
        | "chatbot"
        | "review_evaluation"
        | "lab_generation"
        | "plan_generation"
        | "embedding_generation"
        | "material_parsing"
      user_role: "professor" | "ta" | "student"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      alert_type: ["threshold_warning", "threshold_exceeded"],
      block_type: [
        "heading",
        "paragraph",
        "figure",
        "table",
        "equation",
        "list",
        "code",
      ],
      blooms_level: [
        "remember",
        "understand",
        "apply",
        "analyze",
        "evaluate",
        "create",
      ],
      chat_role: ["student", "assistant"],
      concept_status: ["proposed", "approved", "rejected"],
      generation_plan_status: ["draft", "approved", "generating", "completed"],
      job_status: ["pending", "running", "completed", "failed", "cancelled"],
      job_type: [
        "parse_materials",
        "propose_plan",
        "generate_lab",
        "generate_batch",
        "generate_embeddings",
        "generate_review_questions",
        "evaluate_review",
      ],
      lab_generation_status: ["pending", "generating", "complete", "failed"],
      limit_action: ["block", "alert", "queue"],
      limit_type: [
        "per_user_hourly",
        "per_user_daily",
        "per_institution_daily",
        "per_institution_monthly",
        "cost_daily_cents",
        "cost_monthly_cents",
      ],
      question_source: ["generated", "custom"],
      report_type: ["scheduled", "on_demand"],
      staff_role: ["professor", "ta"],
      usage_type: [
        "chatbot",
        "review_evaluation",
        "lab_generation",
        "plan_generation",
        "embedding_generation",
        "material_parsing",
      ],
      user_role: ["professor", "ta", "student"],
    },
  },
} as const
