import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlatformLayout from "@/components/PlatformLayout";
import { getGeneratedReport, type GeneratedReportEntry } from "@/services/auditHistoryService";
import { TabRelatorioFinal, ResultsPhase } from "@/pages/Audit";
import { AuditProvider } from "@/contexts/AuditContext";

const ReportView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from || "/user";
  const backLabel = backTo === "/user/empresas" ? "Voltar para Empresas" : "Voltar para Minha Área";
  const [report, setReport] = useState<GeneratedReportEntry | null>(null);

  useEffect(() => {
    if (id) setReport(getGeneratedReport(id));
  }, [id]);

  if (!report) {
    return (
      <PlatformLayout>
        <div className="max-w-[1400px] mx-auto p-6">
          <Button variant="ghost" size="sm" onClick={() => navigate(backTo)} className="mb-4 gap-1.5">
            <ArrowLeft className="w-4 h-4" /> {backLabel}
          </Button>
          <div className="text-center py-20">
            <p className="text-muted-foreground">Relatório não encontrado ou expirado.</p>
            <Button onClick={() => navigate("/audit")} className="mt-4">Iniciar nova auditoria</Button>
          </div>
        </div>
      </PlatformLayout>
    );
  }

  const isCompleto = report.variant === "completo";

  return (
    <AuditProvider>
      <PlatformLayout>
        <div className="max-w-[1400px] mx-auto p-4 md:p-6">
          <Button variant="ghost" size="sm" onClick={() => navigate(backTo)} className="mb-4 gap-1.5">
            <ArrowLeft className="w-4 h-4" /> {backLabel}
          </Button>
          {isCompleto ? (
            <ResultsPhase
              onBack={() => navigate(backTo)}
              aiAnalysis={report.aiAnalysis}
              parsedData={report.parsedData}
              selectedDepth="tecnico"
              skipPersist
            />
          ) : (
            <TabRelatorioFinal
              onBack={() => navigate(backTo)}
              aiAnalysis={report.aiAnalysis}
              parsedData={report.parsedData}
              variant="resumido"
            />
          )}
        </div>
      </PlatformLayout>
    </AuditProvider>
  );
};

export default ReportView;
