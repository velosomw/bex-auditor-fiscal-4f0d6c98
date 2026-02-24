import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { AuditState, AuditStep, AuditConfig, AuditFinding } from "@/types/audit";
import { defaultTopics, defaultFindings, defaultReportSections, defaultOnDemandContents } from "@/data/auditMockData";

interface AuditContextType {
  state: AuditState;
  setStep: (step: AuditStep) => void;
  setConfig: (config: Partial<AuditConfig>) => void;
  toggleTopic: (id: string) => void;
  toggleOnDemandContent: (id: string) => void;
  updateFinding: (id: string, updates: Partial<AuditFinding>) => void;
  goNext: () => void;
  goPrevious: () => void;
  resetAudit: () => void;
}

const initialState: AuditState = {
  currentStep: 1,
  config: { file: null, depth: "executive", purpose: "external" },
  topics: defaultTopics,
  findings: defaultFindings,
  reportSections: defaultReportSections,
  onDemandContents: defaultOnDemandContents,
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

  const toggleTopic = useCallback((id: string) => {
    setState(s => ({
      ...s,
      topics: s.topics.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t),
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

  const goNext = useCallback(() => {
    setState(s => ({
      ...s,
      currentStep: Math.min(s.currentStep + 1, 5) as AuditStep,
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
    <AuditContext.Provider value={{ state, setStep, setConfig, toggleTopic, toggleOnDemandContent, updateFinding, goNext, goPrevious, resetAudit }}>
      {children}
    </AuditContext.Provider>
  );
};

export const useAudit = () => useContext(AuditContext);
