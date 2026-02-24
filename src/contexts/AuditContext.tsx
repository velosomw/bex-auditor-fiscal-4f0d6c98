import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { AuditState, AuditStep, AuditConfig, AuditFinding, ScopeCheckItem, BalancoRow } from "@/types/audit";
import { defaultScopeChecks, defaultFindings, defaultReportSections, defaultOnDemandContents, defaultBalancoRows, defaultDreRows, defaultFinancialAnalysis, defaultEntityData } from "@/data/auditMockData";

interface AuditContextType {
  state: AuditState;
  setStep: (step: AuditStep) => void;
  setConfig: (config: Partial<AuditConfig>) => void;
  toggleScopeCheck: (id: string) => void;
  setScopeIssueType: (id: string, issueType: import("@/types/audit").ScopeIssueType) => void;
  toggleOnDemandContent: (id: string) => void;
  updateFinding: (id: string, updates: Partial<AuditFinding>) => void;
  updateBalancoRow: (conta: string, year: string, value: number) => void;
  goNext: () => void;
  goPrevious: () => void;
  resetAudit: () => void;
}

const initialState: AuditState = {
  currentStep: 1,
  config: {
    files: [],
    depth: "executive",
    purpose: "external",
    entityData: defaultEntityData,
  },
  scopeChecks: defaultScopeChecks,
  findings: defaultFindings,
  balancoRows: defaultBalancoRows,
  dreRows: defaultDreRows,
  financialAnalysis: defaultFinancialAnalysis,
  reportSections: defaultReportSections,
  onDemandContents: defaultOnDemandContents,
  dreValidation: "validado",
};

const AuditContext = createContext<AuditContextType>({} as AuditContextType);

export const AuditProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuditState>(initialState);

  const setStep = useCallback((step: AuditStep) => {
    setState(s => ({ ...s, currentStep: step }));
  }, []);

  const setConfig = useCallback((config: Partial<AuditConfig>) => {
    setState(s => ({ ...s, config: { ...s.config, ...config } }));
  }, []);

  const toggleScopeCheck = useCallback((id: string) => {
    setState(s => ({
      ...s,
      scopeChecks: s.scopeChecks.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c),
    }));
  }, []);

  const setScopeIssueType = useCallback((id: string, issueType: import("@/types/audit").ScopeIssueType) => {
    setState(s => ({
      ...s,
      scopeChecks: s.scopeChecks.map(c => c.id === id ? { ...c, issueType } : c),
    }));
  }, []);

  const toggleOnDemandContent = useCallback((id: string) => {
    setState(s => ({
      ...s,
      onDemandContents: s.onDemandContents.map(c =>
        c.id === id ? { ...c, generated: !c.generated } : c
      ),
    }));
  }, []);

  const updateFinding = useCallback((id: string, updates: Partial<AuditFinding>) => {
    setState(s => ({
      ...s,
      findings: s.findings.map(f => f.id === id ? { ...f, ...updates } : f),
    }));
  }, []);

  const updateBalancoRow = useCallback((conta: string, year: string, value: number) => {
    setState(s => ({
      ...s,
      balancoRows: s.balancoRows.map(r =>
        r.conta === conta ? { ...r, values: { ...r.values, [year]: value }, adjusted: true } : r
      ),
    }));
  }, []);

  const goNext = useCallback(() => {
    setState(s => ({
      ...s,
      currentStep: Math.min(s.currentStep + 1, 13) as AuditStep,
    }));
  }, []);

  const goPrevious = useCallback(() => {
    setState(s => ({
      ...s,
      currentStep: Math.max(s.currentStep - 1, 1) as AuditStep,
    }));
  }, []);

  const resetAudit = useCallback(() => {
    setState(initialState);
  }, []);

  return (
    <AuditContext.Provider value={{
      state, setStep, setConfig, toggleScopeCheck, setScopeIssueType,
      toggleOnDemandContent, updateFinding, updateBalancoRow, goNext, goPrevious, resetAudit,
    }}>
      {children}
    </AuditContext.Provider>
  );
};

export const useAudit = () => useContext(AuditContext);
