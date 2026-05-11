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
      account_mapping: {
        Row: {
          categoria: string
          confidence: number
          created_at: string
          hits: number
          id: string
          last_seen_at: string
          original_name: string
          original_normalized: string | null
          ref1: string | null
          source: string | null
          subcategoria: string | null
          updated_at: string
        }
        Insert: {
          categoria: string
          confidence?: number
          created_at?: string
          hits?: number
          id?: string
          last_seen_at?: string
          original_name: string
          original_normalized?: string | null
          ref1?: string | null
          source?: string | null
          subcategoria?: string | null
          updated_at?: string
        }
        Update: {
          categoria?: string
          confidence?: number
          created_at?: string
          hits?: number
          id?: string
          last_seen_at?: string
          original_name?: string
          original_normalized?: string | null
          ref1?: string | null
          source?: string | null
          subcategoria?: string | null
          updated_at?: string
        }
        Relationships: []
      }
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
      ai_cost_config: {
        Row: {
          active: boolean
          cost_fixed: number
          cost_per_1k_input: number
          cost_per_1k_output: number
          cost_per_page: number
          cost_per_request: number
          created_at: string
          currency: string
          id: string
          label: string
          notes: string | null
          provider: string
          service: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cost_fixed?: number
          cost_per_1k_input?: number
          cost_per_1k_output?: number
          cost_per_page?: number
          cost_per_request?: number
          created_at?: string
          currency?: string
          id?: string
          label?: string
          notes?: string | null
          provider: string
          service: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cost_fixed?: number
          cost_per_1k_input?: number
          cost_per_1k_output?: number
          cost_per_page?: number
          cost_per_request?: number
          created_at?: string
          currency?: string
          id?: string
          label?: string
          notes?: string | null
          provider?: string
          service?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          cost_calculated: number
          created_at: string
          created_by: string | null
          document_id: string | null
          id: string
          metadata: Json | null
          pages: number
          provider: string
          reference_id: string | null
          requests: number
          service: string
          tokens_input: number
          tokens_output: number
          type: string
        }
        Insert: {
          cost_calculated?: number
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          metadata?: Json | null
          pages?: number
          provider: string
          reference_id?: string | null
          requests?: number
          service: string
          tokens_input?: number
          tokens_output?: number
          type: string
        }
        Update: {
          cost_calculated?: number
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          metadata?: Json | null
          pages?: number
          provider?: string
          reference_id?: string | null
          requests?: number
          service?: string
          tokens_input?: number
          tokens_output?: number
          type?: string
        }
        Relationships: []
      }
      audit_account_cache: {
        Row: {
          categoria: string | null
          cnpj: string | null
          company_id: string | null
          conta_normalizada: string
          conta_original: string
          conta_original_normalizada: string
          created_at: string
          created_by: string | null
          hits: number
          id: string
          last_value: number | null
          layer: string
          periodo: string | null
          similarity: number | null
          subcategoria: string | null
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          cnpj?: string | null
          company_id?: string | null
          conta_normalizada: string
          conta_original: string
          conta_original_normalizada: string
          created_at?: string
          created_by?: string | null
          hits?: number
          id?: string
          last_value?: number | null
          layer?: string
          periodo?: string | null
          similarity?: number | null
          subcategoria?: string | null
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          cnpj?: string | null
          company_id?: string | null
          conta_normalizada?: string
          conta_original?: string
          conta_original_normalizada?: string
          created_at?: string
          created_by?: string | null
          hits?: number
          id?: string
          last_value?: number | null
          layer?: string
          periodo?: string | null
          similarity?: number | null
          subcategoria?: string | null
          updated_at?: string
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
          metadata: Json | null
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
          metadata?: Json | null
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
          metadata?: Json | null
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
      audit_logs: {
        Row: {
          audit_id: string | null
          created_at: string
          duration_ms: number | null
          etapa: string
          id: string
          message: string | null
          payload: Json | null
          status: string
        }
        Insert: {
          audit_id?: string | null
          created_at?: string
          duration_ms?: number | null
          etapa: string
          id?: string
          message?: string | null
          payload?: Json | null
          status: string
        }
        Update: {
          audit_id?: string | null
          created_at?: string
          duration_ms?: number | null
          etapa?: string
          id?: string
          message?: string | null
          payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_reports: {
        Row: {
          ai_analysis: Json | null
          balancete_entries: Json | null
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
          periodos: string[] | null
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
          balancete_entries?: Json | null
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
          periodos?: string[] | null
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
          balancete_entries?: Json | null
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
          periodos?: string[] | null
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
      audits: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          id: string
          meses_count: number
          metadata: Json | null
          name: string
          status: string
          updated_at: string
          variant: string
          version: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          meses_count?: number
          metadata?: Json | null
          name?: string
          status?: string
          updated_at?: string
          variant?: string
          version?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          meses_count?: number
          metadata?: Json | null
          name?: string
          status?: string
          updated_at?: string
          variant?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "audits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      balancete_consolidado: {
        Row: {
          audit_id: string
          balancete_id: string | null
          codigo: string
          created_at: string
          credito: number | null
          debito: number | null
          descricao: string | null
          file_name: string | null
          fonte: string
          id: string
          is_leaf: boolean
          mes_referencia: string
          ref_capital: string | null
          saldo_anterior: number | null
          saldo_atual: number
        }
        Insert: {
          audit_id: string
          balancete_id?: string | null
          codigo: string
          created_at?: string
          credito?: number | null
          debito?: number | null
          descricao?: string | null
          file_name?: string | null
          fonte?: string
          id?: string
          is_leaf?: boolean
          mes_referencia: string
          ref_capital?: string | null
          saldo_anterior?: number | null
          saldo_atual?: number
        }
        Update: {
          audit_id?: string
          balancete_id?: string | null
          codigo?: string
          created_at?: string
          credito?: number | null
          debito?: number | null
          descricao?: string | null
          file_name?: string | null
          fonte?: string
          id?: string
          is_leaf?: boolean
          mes_referencia?: string
          ref_capital?: string | null
          saldo_anterior?: number | null
          saldo_atual?: number
        }
        Relationships: []
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
      balancete_lines: {
        Row: {
          balancete_id: string
          categoria: string | null
          classification_layer: string | null
          confidence: number | null
          conta: string
          created_at: string
          descricao: string | null
          id: string
          ref1: string | null
          saldo: number
          subcategoria: string | null
        }
        Insert: {
          balancete_id: string
          categoria?: string | null
          classification_layer?: string | null
          confidence?: number | null
          conta: string
          created_at?: string
          descricao?: string | null
          id?: string
          ref1?: string | null
          saldo?: number
          subcategoria?: string | null
        }
        Update: {
          balancete_id?: string
          categoria?: string | null
          classification_layer?: string | null
          confidence?: number | null
          conta?: string
          created_at?: string
          descricao?: string | null
          id?: string
          ref1?: string | null
          saldo?: number
          subcategoria?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "balancete_lines_balancete_id_fkey"
            columns: ["balancete_id"]
            isOneToOne: false
            referencedRelation: "balancetes"
            referencedColumns: ["id"]
          },
        ]
      }
      balancetes: {
        Row: {
          audit_id: string
          content_hash: string | null
          created_at: string
          created_by: string
          file_name: string
          id: string
          mes_referencia: string
          pipeline_document_id: string | null
          total_linhas: number
        }
        Insert: {
          audit_id: string
          content_hash?: string | null
          created_at?: string
          created_by: string
          file_name: string
          id?: string
          mes_referencia: string
          pipeline_document_id?: string | null
          total_linhas?: number
        }
        Update: {
          audit_id?: string
          content_hash?: string | null
          created_at?: string
          created_by?: string
          file_name?: string
          id?: string
          mes_referencia?: string
          pipeline_document_id?: string | null
          total_linhas?: number
        }
        Relationships: [
          {
            foreignKeyName: "balancetes_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      bs_dados: {
        Row: {
          ativo_circulante: number
          audit_id: string
          cmv: number
          created_at: string
          credores_rj: number
          despesas: number
          disponivel: number
          divida_financeira: number
          divida_total: number
          divida_trabalhista: number
          divida_tributaria: number
          errors: Json | null
          estoques: number
          fornecedores: number
          id: string
          mes: string
          passivo_circulante: number
          receita_liquida: number
          resultado: number
          updated_at: string
        }
        Insert: {
          ativo_circulante?: number
          audit_id: string
          cmv?: number
          created_at?: string
          credores_rj?: number
          despesas?: number
          disponivel?: number
          divida_financeira?: number
          divida_total?: number
          divida_trabalhista?: number
          divida_tributaria?: number
          errors?: Json | null
          estoques?: number
          fornecedores?: number
          id?: string
          mes: string
          passivo_circulante?: number
          receita_liquida?: number
          resultado?: number
          updated_at?: string
        }
        Update: {
          ativo_circulante?: number
          audit_id?: string
          cmv?: number
          created_at?: string
          credores_rj?: number
          despesas?: number
          disponivel?: number
          divida_financeira?: number
          divida_total?: number
          divida_trabalhista?: number
          divida_tributaria?: number
          errors?: Json | null
          estoques?: number
          fornecedores?: number
          id?: string
          mes?: string
          passivo_circulante?: number
          receita_liquida?: number
          resultado?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bs_dados_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
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
          termo_original_normalizado: string | null
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
          termo_original_normalizado?: string | null
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
          termo_original_normalizado?: string | null
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
      indicadores: {
        Row: {
          audit_id: string
          cmv_despesa_percent: number | null
          cmv_percent: number | null
          created_at: string
          despesa_percent: number | null
          id: string
          liquidez_corrente: number | null
          liquidez_imediata: number | null
          liquidez_seca: number | null
          mes: string
          resultado_percent: number | null
        }
        Insert: {
          audit_id: string
          cmv_despesa_percent?: number | null
          cmv_percent?: number | null
          created_at?: string
          despesa_percent?: number | null
          id?: string
          liquidez_corrente?: number | null
          liquidez_imediata?: number | null
          liquidez_seca?: number | null
          mes: string
          resultado_percent?: number | null
        }
        Update: {
          audit_id?: string
          cmv_despesa_percent?: number | null
          cmv_percent?: number | null
          created_at?: string
          despesa_percent?: number | null
          id?: string
          liquidez_corrente?: number | null
          liquidez_imediata?: number | null
          liquidez_seca?: number | null
          mes?: string
          resultado_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "indicadores_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          audit_id: string
          created_at: string
          diagnostico: string | null
          generated_by: string | null
          id: string
          positivos: Json | null
          problemas: Json | null
          recomendacoes: Json | null
          riscos: Json | null
          tendencia: string | null
        }
        Insert: {
          audit_id: string
          created_at?: string
          diagnostico?: string | null
          generated_by?: string | null
          id?: string
          positivos?: Json | null
          problemas?: Json | null
          recomendacoes?: Json | null
          riscos?: Json | null
          tendencia?: string | null
        }
        Update: {
          audit_id?: string
          created_at?: string
          diagnostico?: string | null
          generated_by?: string | null
          id?: string
          positivos?: Json | null
          problemas?: Json | null
          recomendacoes?: Json | null
          riscos?: Json | null
          tendencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insights_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      kanitz_scores: {
        Row: {
          ativo_total: number | null
          audit_id: string
          created_at: string
          id: string
          insight: string | null
          mes: string
          patrimonio_liquido: number | null
          rating: string
          score: number
          x1: number | null
          x2: number | null
          x3: number | null
          x4: number | null
          x5: number | null
        }
        Insert: {
          ativo_total?: number | null
          audit_id: string
          created_at?: string
          id?: string
          insight?: string | null
          mes: string
          patrimonio_liquido?: number | null
          rating?: string
          score?: number
          x1?: number | null
          x2?: number | null
          x3?: number | null
          x4?: number | null
          x5?: number | null
        }
        Update: {
          ativo_total?: number | null
          audit_id?: string
          created_at?: string
          id?: string
          insight?: string | null
          mes?: string
          patrimonio_liquido?: number | null
          rating?: string
          score?: number
          x1?: number | null
          x2?: number | null
          x3?: number | null
          x4?: number | null
          x5?: number | null
        }
        Relationships: []
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
          content_hash: string | null
          created_at: string
          created_by: string
          error_message: string | null
          file_name: string
          file_type: string
          id: string
          progress: string | null
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          content_hash?: string | null
          created_at?: string
          created_by: string
          error_message?: string | null
          file_name: string
          file_type?: string
          id?: string
          progress?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string
          error_message?: string | null
          file_name?: string
          file_type?: string
          id?: string
          progress?: string | null
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
      ai_cost_summary: {
        Row: {
          service: string | null
          total_cost: number | null
          total_input_tokens: number | null
          total_output_tokens: number | null
          total_pages: number | null
          total_requests: number | null
          type: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      ai_cost_diagnostics: { Args: never; Returns: Json }
      calculate_ai_cost: {
        Args: {
          p_pages: number
          p_requests: number
          p_service: string
          p_tokens_input: number
          p_tokens_output: number
        }
        Returns: number
      }
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
