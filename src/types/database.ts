// Database types for Muto — mirrors Supabase generated types pattern.
// Auto-generation is not used here; types are maintained manually against
// supabase/migrations/001_initial_schema.sql.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      institutions: {
        Row: {
          id: string
          name: string
          slug: string
          sso_provider: string | null
          sso_config: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          sso_provider?: string | null
          sso_config?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          sso_provider?: string | null
          sso_config?: Json | null
          created_at?: string
        }
      }
      users: {
        Row: {
          id: string
          institution_id: string
          email: string
          full_name: string | null
          role: Database['public']['Enums']['user_role']
          created_at: string
        }
        Insert: {
          id: string
          institution_id: string
          email: string
          full_name?: string | null
          role: Database['public']['Enums']['user_role']
          created_at?: string
        }
        Update: {
          id?: string
          institution_id?: string
          email?: string
          full_name?: string | null
          role?: Database['public']['Enums']['user_role']
          created_at?: string
        }
      }
      courses: {
        Row: {
          id: string
          institution_id: string
          created_by: string
          title: string
          description: string | null
          subject_area: string | null
          created_at: string
        }
        Insert: {
          id?: string
          institution_id: string
          created_by: string
          title: string
          description?: string | null
          subject_area?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          institution_id?: string
          created_by?: string
          title?: string
          description?: string | null
          subject_area?: string | null
          created_at?: string
        }
      }
      course_instances: {
        Row: {
          id: string
          course_id: string
          semester: string
          join_code: string
          join_link: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          course_id: string
          semester: string
          join_code: string
          join_link?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          course_id?: string
          semester?: string
          join_code?: string
          join_link?: string | null
          is_active?: boolean
          created_at?: string
        }
      }
      course_staff: {
        Row: {
          id: string
          course_instance_id: string
          user_id: string
          role: Database['public']['Enums']['staff_role']
          can_edit_structure: boolean
          created_at: string
        }
        Insert: {
          id?: string
          course_instance_id: string
          user_id: string
          role: Database['public']['Enums']['staff_role']
          can_edit_structure?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          course_instance_id?: string
          user_id?: string
          role?: Database['public']['Enums']['staff_role']
          can_edit_structure?: boolean
          created_at?: string
        }
      }
      enrollments: {
        Row: {
          id: string
          course_instance_id: string
          user_id: string
          enrolled_at: string
        }
        Insert: {
          id?: string
          course_instance_id: string
          user_id: string
          enrolled_at?: string
        }
        Update: {
          id?: string
          course_instance_id?: string
          user_id?: string
          enrolled_at?: string
        }
      }
      modules: {
        Row: {
          id: string
          course_id: string
          title: string
          description: string | null
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          course_id: string
          title: string
          description?: string | null
          position?: number
          created_at?: string
        }
        Update: {
          id?: string
          course_id?: string
          title?: string
          description?: string | null
          position?: number
          created_at?: string
        }
      }
      labs: {
        Row: {
          id: string
          module_id: string
          title: string
          description: string | null
          position: number
          content: Json | null
          blooms_structure: Json | null
          generation_status: Database['public']['Enums']['lab_generation_status']
          generated_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          module_id: string
          title: string
          description?: string | null
          position?: number
          content?: Json | null
          blooms_structure?: Json | null
          generation_status?: Database['public']['Enums']['lab_generation_status']
          generated_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          module_id?: string
          title?: string
          description?: string | null
          position?: number
          content?: Json | null
          blooms_structure?: Json | null
          generation_status?: Database['public']['Enums']['lab_generation_status']
          generated_at?: string | null
          created_at?: string
        }
      }
      source_materials: {
        Row: {
          id: string
          course_id: string
          lab_id: string | null
          uploaded_by: string
          file_name: string
          file_type: string
          storage_path: string
          file_size_bytes: number | null
          created_at: string
        }
        Insert: {
          id?: string
          course_id: string
          lab_id?: string | null
          uploaded_by: string
          file_name: string
          file_type: string
          storage_path: string
          file_size_bytes?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          course_id?: string
          lab_id?: string | null
          uploaded_by?: string
          file_name?: string
          file_type?: string
          storage_path?: string
          file_size_bytes?: number | null
          created_at?: string
        }
      }
      content_blocks: {
        Row: {
          id: string
          source_material_id: string
          lab_id: string | null
          block_type: Database['public']['Enums']['block_type']
          content: string
          heading_level: number | null
          position: number
          page_number: number | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          source_material_id: string
          lab_id?: string | null
          block_type: Database['public']['Enums']['block_type']
          content: string
          heading_level?: number | null
          position?: number
          page_number?: number | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          source_material_id?: string
          lab_id?: string | null
          block_type?: Database['public']['Enums']['block_type']
          content?: string
          heading_level?: number | null
          position?: number
          page_number?: number | null
          metadata?: Json | null
          created_at?: string
        }
      }
      content_embeddings: {
        Row: {
          id: string
          content_block_id: string
          lab_id: string | null
          embedding: string
          chunk_text: string
          chunk_index: number
          created_at: string
        }
        Insert: {
          id?: string
          content_block_id: string
          lab_id?: string | null
          embedding: string
          chunk_text: string
          chunk_index?: number
          created_at?: string
        }
        Update: {
          id?: string
          content_block_id?: string
          lab_id?: string | null
          embedding?: string
          chunk_text?: string
          chunk_index?: number
          created_at?: string
        }
      }
      concepts: {
        Row: {
          id: string
          lab_id: string
          name: string
          description: string | null
          parent_concept_id: string | null
          status: Database['public']['Enums']['concept_status']
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          lab_id: string
          name: string
          description?: string | null
          parent_concept_id?: string | null
          status?: Database['public']['Enums']['concept_status']
          position?: number
          created_at?: string
        }
        Update: {
          id?: string
          lab_id?: string
          name?: string
          description?: string | null
          parent_concept_id?: string | null
          status?: Database['public']['Enums']['concept_status']
          position?: number
          created_at?: string
        }
      }
      review_questions: {
        Row: {
          id: string
          lab_id: string
          concept_id: string
          question_text: string
          blooms_level: Database['public']['Enums']['blooms_level']
          source: Database['public']['Enums']['question_source']
          evaluation_rubric: string | null
          is_active: boolean
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          lab_id: string
          concept_id: string
          question_text: string
          blooms_level: Database['public']['Enums']['blooms_level']
          source?: Database['public']['Enums']['question_source']
          evaluation_rubric?: string | null
          is_active?: boolean
          position?: number
          created_at?: string
        }
        Update: {
          id?: string
          lab_id?: string
          concept_id?: string
          question_text?: string
          blooms_level?: Database['public']['Enums']['blooms_level']
          source?: Database['public']['Enums']['question_source']
          evaluation_rubric?: string | null
          is_active?: boolean
          position?: number
          created_at?: string
        }
      }
      review_sessions: {
        Row: {
          id: string
          lab_id: string
          enrollment_id: string
          started_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          lab_id: string
          enrollment_id: string
          started_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          lab_id?: string
          enrollment_id?: string
          started_at?: string
          completed_at?: string | null
        }
      }
      review_responses: {
        Row: {
          id: string
          review_session_id: string
          review_question_id: string
          answer_text: string
          answered_at: string
        }
        Insert: {
          id?: string
          review_session_id: string
          review_question_id: string
          answer_text: string
          answered_at?: string
        }
        Update: {
          id?: string
          review_session_id?: string
          review_question_id?: string
          answer_text?: string
          answered_at?: string
        }
      }
      concept_evaluations: {
        Row: {
          id: string
          review_response_id: string
          concept_id: string
          enrollment_id: string
          blooms_level: Database['public']['Enums']['blooms_level']
          mastery_score: number
          confidence: number
          reasoning: string | null
          evaluated_at: string
        }
        Insert: {
          id?: string
          review_response_id: string
          concept_id: string
          enrollment_id: string
          blooms_level: Database['public']['Enums']['blooms_level']
          mastery_score: number
          confidence: number
          reasoning?: string | null
          evaluated_at?: string
        }
        Update: {
          id?: string
          review_response_id?: string
          concept_id?: string
          enrollment_id?: string
          blooms_level?: Database['public']['Enums']['blooms_level']
          mastery_score?: number
          confidence?: number
          reasoning?: string | null
          evaluated_at?: string
        }
      }
      insight_deadlines: {
        Row: {
          id: string
          course_instance_id: string
          label: string
          day_of_week: number | null
          time: string
          is_recurring: boolean
          specific_date: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          course_instance_id: string
          label: string
          day_of_week?: number | null
          time: string
          is_recurring?: boolean
          specific_date?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          course_instance_id?: string
          label?: string
          day_of_week?: number | null
          time?: string
          is_recurring?: boolean
          specific_date?: string | null
          is_active?: boolean
          created_at?: string
        }
      }
      insight_reports: {
        Row: {
          id: string
          course_instance_id: string
          insight_deadline_id: string | null
          report_type: Database['public']['Enums']['report_type']
          content: Json
          generated_at: string
        }
        Insert: {
          id?: string
          course_instance_id: string
          insight_deadline_id?: string | null
          report_type: Database['public']['Enums']['report_type']
          content: Json
          generated_at?: string
        }
        Update: {
          id?: string
          course_instance_id?: string
          insight_deadline_id?: string | null
          report_type?: Database['public']['Enums']['report_type']
          content?: Json
          generated_at?: string
        }
      }
      chat_sessions: {
        Row: {
          id: string
          lab_id: string
          enrollment_id: string
          started_at: string
          last_message_at: string | null
        }
        Insert: {
          id?: string
          lab_id: string
          enrollment_id: string
          started_at?: string
          last_message_at?: string | null
        }
        Update: {
          id?: string
          lab_id?: string
          enrollment_id?: string
          started_at?: string
          last_message_at?: string | null
        }
      }
      chat_messages: {
        Row: {
          id: string
          chat_session_id: string
          role: Database['public']['Enums']['chat_role']
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          chat_session_id: string
          role: Database['public']['Enums']['chat_role']
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          chat_session_id?: string
          role?: Database['public']['Enums']['chat_role']
          content?: string
          created_at?: string
        }
      }
      generation_jobs: {
        Row: {
          id: string
          course_id: string
          created_by: string
          job_type: Database['public']['Enums']['job_type']
          status: Database['public']['Enums']['job_status']
          priority: number
          input_payload: Json | null
          output_payload: Json | null
          progress_percent: number
          current_step: string | null
          error_message: string | null
          estimated_cost_cents: number | null
          actual_cost_cents: number | null
          started_at: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          course_id: string
          created_by: string
          job_type: Database['public']['Enums']['job_type']
          status?: Database['public']['Enums']['job_status']
          priority?: number
          input_payload?: Json | null
          output_payload?: Json | null
          progress_percent?: number
          current_step?: string | null
          error_message?: string | null
          estimated_cost_cents?: number | null
          actual_cost_cents?: number | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          course_id?: string
          created_by?: string
          job_type?: Database['public']['Enums']['job_type']
          status?: Database['public']['Enums']['job_status']
          priority?: number
          input_payload?: Json | null
          output_payload?: Json | null
          progress_percent?: number
          current_step?: string | null
          error_message?: string | null
          estimated_cost_cents?: number | null
          actual_cost_cents?: number | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
      }
      generation_plans: {
        Row: {
          id: string
          course_id: string
          generation_job_id: string
          plan_data: Json
          status: Database['public']['Enums']['generation_plan_status']
          professor_notes: string | null
          created_at: string
          approved_at: string | null
        }
        Insert: {
          id?: string
          course_id: string
          generation_job_id: string
          plan_data: Json
          status?: Database['public']['Enums']['generation_plan_status']
          professor_notes?: string | null
          created_at?: string
          approved_at?: string | null
        }
        Update: {
          id?: string
          course_id?: string
          generation_job_id?: string
          plan_data?: Json
          status?: Database['public']['Enums']['generation_plan_status']
          professor_notes?: string | null
          created_at?: string
          approved_at?: string | null
        }
      }
      api_usage_log: {
        Row: {
          id: string
          user_id: string
          institution_id: string
          usage_type: Database['public']['Enums']['usage_type']
          model: string
          input_tokens: number
          output_tokens: number
          cost_cents: number
          generation_job_id: string | null
          lab_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          institution_id: string
          usage_type: Database['public']['Enums']['usage_type']
          model: string
          input_tokens?: number
          output_tokens?: number
          cost_cents?: number
          generation_job_id?: string | null
          lab_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          institution_id?: string
          usage_type?: Database['public']['Enums']['usage_type']
          model?: string
          input_tokens?: number
          output_tokens?: number
          cost_cents?: number
          generation_job_id?: string | null
          lab_id?: string | null
          created_at?: string
        }
      }
      rate_limits: {
        Row: {
          id: string
          institution_id: string | null
          usage_type: Database['public']['Enums']['usage_type']
          limit_type: Database['public']['Enums']['limit_type']
          limit_value: number
          action_on_limit: Database['public']['Enums']['limit_action']
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          institution_id?: string | null
          usage_type: Database['public']['Enums']['usage_type']
          limit_type: Database['public']['Enums']['limit_type']
          limit_value: number
          action_on_limit?: Database['public']['Enums']['limit_action']
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          institution_id?: string | null
          usage_type?: Database['public']['Enums']['usage_type']
          limit_type?: Database['public']['Enums']['limit_type']
          limit_value?: number
          action_on_limit?: Database['public']['Enums']['limit_action']
          is_active?: boolean
          created_at?: string
        }
      }
      cost_alerts: {
        Row: {
          id: string
          institution_id: string
          rate_limit_id: string
          alert_type: Database['public']['Enums']['alert_type']
          current_value: number
          limit_value: number
          message: string
          acknowledged: boolean
          created_at: string
        }
        Insert: {
          id?: string
          institution_id: string
          rate_limit_id: string
          alert_type: Database['public']['Enums']['alert_type']
          current_value: number
          limit_value: number
          message: string
          acknowledged?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          institution_id?: string
          rate_limit_id?: string
          alert_type?: Database['public']['Enums']['alert_type']
          current_value?: number
          limit_value?: number
          message?: string
          acknowledged?: boolean
          created_at?: string
        }
      }
    }
    Enums: {
      user_role: 'professor' | 'ta' | 'student'
      block_type: 'heading' | 'paragraph' | 'figure' | 'table' | 'equation' | 'list' | 'code'
      blooms_level: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create'
      concept_status: 'proposed' | 'approved' | 'rejected'
      question_source: 'generated' | 'custom'
      job_type:
        | 'parse_materials'
        | 'propose_plan'
        | 'generate_lab'
        | 'generate_batch'
        | 'generate_embeddings'
        | 'generate_review_questions'
      job_status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
      generation_plan_status: 'draft' | 'approved' | 'generating' | 'completed'
      lab_generation_status: 'pending' | 'generating' | 'complete' | 'failed'
      chat_role: 'student' | 'assistant'
      report_type: 'scheduled' | 'on_demand'
      usage_type:
        | 'chatbot'
        | 'review_evaluation'
        | 'lab_generation'
        | 'plan_generation'
        | 'embedding_generation'
        | 'material_parsing'
      limit_type:
        | 'per_user_hourly'
        | 'per_user_daily'
        | 'per_institution_daily'
        | 'per_institution_monthly'
        | 'cost_daily_cents'
        | 'cost_monthly_cents'
      limit_action: 'block' | 'alert' | 'queue'
      alert_type: 'threshold_warning' | 'threshold_exceeded'
      staff_role: 'professor' | 'ta'
    }
    Views: {
      student_evaluations_view: {
        Row: {
          id: string
          review_response_id: string
          concept_id: string
          enrollment_id: string
          blooms_level: Database['public']['Enums']['blooms_level']
          reasoning: string | null
          evaluated_at: string
        }
      }
    }
  }
}

// Convenience helpers (mirrors Supabase generated types pattern)
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]
