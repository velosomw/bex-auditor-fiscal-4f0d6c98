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
      accounting_firms: {
        Row: {
          address: string | null
          address_number: string | null
          cnpj: string
          crc: string
          created_at: string
          email: string
          id: string
          name: string
          phone: string
          source: string
          status: string
          updated_at: string
          user_id: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          cnpj: string
          crc: string
          created_at?: string
          email: string
          id?: string
          name: string
          phone: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          cnpj?: string
          crc?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      audit_documents: {
        Row: {
          batch_id: string | null
          company_id: string
          conformidade: number
          created_at: string
          created_by: string
          file_name: string
          file_size: number
          format: string
          id: string
          riscos: number
          risk_level: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          company_id: string
          conformidade?: number
          created_at?: string
          created_by: string
          file_name: string
          file_size?: number
          format?: string
          id?: string
          riscos?: number
          risk_level?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          company_id?: string
          conformidade?: number
          created_at?: string
          created_by?: string
          file_name?: string
          file_size?: number
          format?: string
          id?: string
          riscos?: number
          risk_level?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_reports: {
        Row: {
          ai_analysis: Json | null
          batch_id: string | null
          company_id: string
          conformidade: number
          created_at: string
          created_by: string
          file_name: string
          file_size: number
          format: string
          id: string
          parsed_data: Json | null
          riscos: number
          risk_level: string
          source: string
          source_documents: Json | null
          status: string
          title: string
          updated_at: string
          variant: string
        }
        Insert: {
          ai_analysis?: Json | null
          batch_id?: string | null
          company_id: string
          conformidade?: number
          created_at?: string
          created_by: string
          file_name?: string
          file_size?: number
          format?: string
          id?: string
          parsed_data?: Json | null
          riscos?: number
          risk_level?: string
          source?: string
          source_documents?: Json | null
          status?: string
          title: string
          updated_at?: string
          variant?: string
        }
        Update: {
          ai_analysis?: Json | null
          batch_id?: string | null
          company_id?: string
          conformidade?: number
          created_at?: string
          created_by?: string
          file_name?: string
          file_size?: number
          format?: string
          id?: string
          parsed_data?: Json | null
          riscos?: number
          risk_level?: string
          source?: string
          source_documents?: Json | null
          status?: string
          title?: string
          updated_at?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      balancete_data: {
        Row: {
          categoria: string | null
          conta_normalizada: string | null
          conta_original: string
          created_at: string
          document_id: string
          id: string
          nivel: number | null
          subcategoria: string | null
          tipo: string | null
          valor: number
        }
        Insert: {
          categoria?: string | null
          conta_normalizada?: string | null
          conta_original: string
          created_at?: string
          document_id: string
          id?: string
          nivel?: number | null
          subcategoria?: string | null
          tipo?: string | null
          valor?: number
        }
        Update: {
          categoria?: string | null
          conta_normalizada?: string | null
          conta_original?: string
          created_at?: string
          document_id?: string
          id?: string
          nivel?: number | null
          subcategoria?: string | null
          tipo?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "balancete_data_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pipeline_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          accounting_firm_id: string | null
          address: string | null
          city: string | null
          cnae: string | null
          cnpj: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          payment_due_date: string | null
          payment_status: string
          phone: string | null
          phone_fixed: string | null
          sector: string | null
          source: string
          status: string
          uf: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          accounting_firm_id?: string | null
          address?: string | null
          city?: string | null
          cnae?: string | null
          cnpj?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_due_date?: string | null
          payment_status?: string
          phone?: string | null
          phone_fixed?: string | null
          sector?: string | null
          source?: string
          status?: string
          uf?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          accounting_firm_id?: string | null
          address?: string | null
          city?: string | null
          cnae?: string | null
          cnpj?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_due_date?: string | null
          payment_status?: string
          phone?: string | null
          phone_fixed?: string | null
          sector?: string | null
          source?: string
          status?: string
          uf?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_accounting_firm_id_fkey"
            columns: ["accounting_firm_id"]
            isOneToOne: false
            referencedRelation: "accounting_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      contabil_dictionary: {
        Row: {
          categoria: string
          created_at: string
          embedding: string | null
          frequencia: number | null
          id: string
          subcategoria: string | null
          termo_original: string
          termo_padrao: string
        }
        Insert: {
          categoria: string
          created_at?: string
          embedding?: string | null
          frequencia?: number | null
          id?: string
          subcategoria?: string | null
          termo_original: string
          termo_padrao: string
        }
        Update: {
          categoria?: string
          created_at?: string
          embedding?: string | null
          frequencia?: number | null
          id?: string
          subcategoria?: string | null
          termo_original?: string
          termo_padrao?: string
        }
        Relationships: []
      }
      dataset_validated: {
        Row: {
          corrected_by: string
          created_at: string
          document_id: string | null
          embedding: string | null
          id: string
          input_json: Json
          notes: string | null
          output_corrected: Json
        }
        Insert: {
          corrected_by: string
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: string
          input_json: Json
          notes?: string | null
          output_corrected: Json
        }
        Update: {
          corrected_by?: string
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: string
          input_json?: Json
          notes?: string | null
          output_corrected?: Json
        }
        Relationships: [
          {
            foreignKeyName: "dataset_validated_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pipeline_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_results: {
        Row: {
          created_at: string
          document_id: string
          id: string
          ocr_score: number | null
          provider: string | null
          raw_text: string | null
          structured_json: Json | null
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          ocr_score?: number | null
          provider?: string | null
          raw_text?: string | null
          structured_json?: Json | null
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          ocr_score?: number | null
          provider?: string | null
          raw_text?: string | null
          structured_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ocr_results_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pipeline_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_analysis_results: {
        Row: {
          alertas: Json | null
          created_at: string
          document_id: string
          id: string
          indicadores: Json | null
          mapping_score: number | null
          ocr_score: number | null
          quality_score: number | null
          validation_score: number | null
        }
        Insert: {
          alertas?: Json | null
          created_at?: string
          document_id: string
          id?: string
          indicadores?: Json | null
          mapping_score?: number | null
          ocr_score?: number | null
          quality_score?: number | null
          validation_score?: number | null
        }
        Update: {
          alertas?: Json | null
          created_at?: string
          document_id?: string
          id?: string
          indicadores?: Json | null
          mapping_score?: number | null
          ocr_score?: number | null
          quality_score?: number | null
          validation_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_analysis_results_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pipeline_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_documents: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string
          error_message: string | null
          file_name: string
          file_type: string
          id: string
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by: string
          error_message?: string | null
          file_name: string
          file_type?: string
          id?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string
          error_message?: string | null
          file_name?: string
          file_type?: string
          id?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_embeddings: {
        Row: {
          created_at: string
          document_id: string | null
          embedding: string | null
          id: string
          metadata: Json | null
          text_content: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text_content?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          text_content?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_embeddings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pipeline_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
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
      match_contabil_dictionary: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          categoria: string
          id: string
          similarity: number
          termo_original: string
          termo_padrao: string
        }[]
      }
      match_dataset_validated: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          id: string
          input_json: Json
          output_corrected: Json
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role:
        | "gestor_ia"
        | "auditor_chefe"
        | "coordenadora"
        | "consultor"
        | "magistrado"
        | "recuperanda"
        | "usuario"
        | "empresa"
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
      app_role: [
        "gestor_ia",
        "auditor_chefe",
        "coordenadora",
        "consultor",
        "magistrado",
        "recuperanda",
        "usuario",
        "empresa",
      ],
    },
  },
} as const
