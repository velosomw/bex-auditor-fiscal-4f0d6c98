import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PlatformLayout from "@/components/PlatformLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, Save, RefreshCw, Mail, Palette, Loader2, Upload, Image as ImageIcon, Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type TplType = "signup" | "recovery" | "invite" | "magiclink" | "email_change" | "reauthentication";

const TPL_LABELS: Record<TplType, string> = {
  signup: "Confirmação de cadastro",
  recovery: "Redefinição de senha",
  invite: "Convite",
  magiclink: "Link mágico (login)",
  email_change: "Alteração de e-mail",
  reauthentication: "Código de verificação",
};

const SAMPLE_MAGIC_LINK = "https://bexbrasil.online/confirmar?token=demo";

interface BrandRow {
  brand_name: string; tagline: string; logo_url: string;
  primary_color: string; primary_color_dark: string;
  header_bg_from: string; header_bg_to: string;
  text_color: string; muted_color: string;
  footer_url: string; footer_label: string;
  logo_width: number; logo_height: number; logo_radius: number;
  logo_align: "left" | "center" | "right";
  logo_object_fit: "cover" | "contain" | "fill" | "none" | "scale-down";
  logo_show: boolean; logo_padding: number; logo_bg_color: string;
}

interface TplRow {
  template_type: TplType; subject: string; preview_text: string;
  header_subtitle: string; heading: string; intro_html: string;
  body_html: string; button_label: string; footer_html: string; enabled: boolean;
}

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const PREVIEW_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/email-template-preview`;

export default function EmailTemplatesEditor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brand, setBrand] = useState<BrandRow | null>(null);
  const [templates, setTemplates] = useState<Record<TplType, TplRow>>({} as any);
  const [active, setActive] = useState<TplType>("signup");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewing, setPreviewing] = useState(false);

  const load = async () => {
    setLoading(true);
    const [b, t] = await Promise.all([
      supabase.from("email_brand_settings").select("*").eq("id", true).maybeSingle(),
      supabase.from("email_template_overrides").select("*"),
    ]);
    if (b.error) toast.error("Erro ao carregar branding"); else setBrand(b.data as any);
    if (t.error) toast.error("Erro ao carregar templates");
    else {
      const map = {} as Record<TplType, TplRow>;
      (t.data || []).forEach((r: any) => { map[r.template_type as TplType] = r; });
      setTemplates(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const current = templates[active];

  const refreshPreview = async () => {
    if (!brand || !current) return;
    setPreviewing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(PREVIEW_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ brand, content: current, template_type: active }),
      });
      if (!res.ok) throw new Error(await res.text());
      setPreviewHtml(await res.text());
    } catch (e: any) {
      toast.error("Erro no preview: " + (e?.message ?? e));
    } finally { setPreviewing(false); }
  };

  useEffect(() => {
    if (!loading) {
      const t = setTimeout(refreshPreview, 250);
      return () => clearTimeout(t);
    }
  }, [loading, active, brand, current]);

  const saveBrand = async () => {
    if (!brand) return;
    setSaving(true);
    const { error } = await supabase.from("email_brand_settings").update(brand).eq("id", true);
    setSaving(false);
    if (error) toast.error("Erro ao salvar branding"); else toast.success("Branding salvo");
  };

  const saveTemplate = async () => {
    if (!current) return;
    setSaving(true);
    const { error } = await supabase
      .from("email_template_overrides")
      .update({
        subject: current.subject, preview_text: current.preview_text,
        header_subtitle: current.header_subtitle, heading: current.heading,
        intro_html: current.intro_html, body_html: current.body_html,
        button_label: current.button_label, footer_html: current.footer_html,
        enabled: current.enabled,
      })
      .eq("template_type", active);
    setSaving(false);
    if (error) toast.error("Erro ao salvar template"); else toast.success("Template salvo");
  };

  const updateTpl = (patch: Partial<TplRow>) =>
    setTemplates((s) => ({ ...s, [active]: { ...s[active], ...patch } }));
  const updateBrand = (patch: Partial<BrandRow>) =>
    setBrand((s) => (s ? { ...s, ...patch } : s));

  const previewSrcDoc = useMemo(() => previewHtml || "<p style='font:14px sans-serif;padding:24px;color:#666'>Carregando preview…</p>", [previewHtml]);

  return (
    <PlatformLayout>
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/gestor-ia")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Mail className="w-6 h-6" /> Templates de E-mail
              </h1>
              <p className="text-sm text-muted-foreground">Edite branding e conteúdo dos e-mails enviados pela plataforma.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Recarregar
          </Button>
        </div>

        {loading || !brand ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT: editor */}
            <div className="space-y-4">
              {/* BRAND */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Palette className="w-4 h-4" /> Marca & Cabeçalho
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Nome da marca" value={brand.brand_name} onChange={(v) => updateBrand({ brand_name: v })} />
                    <Field label="Tagline" value={brand.tagline} onChange={(v) => updateBrand({ tagline: v })} />
                  </div>
                  <LogoEditor brand={brand} onChange={updateBrand} />
                  <div className="grid grid-cols-4 gap-3">
                    <ColorField label="Primária" value={brand.primary_color} onChange={(v) => updateBrand({ primary_color: v })} />
                    <ColorField label="Primária escura" value={brand.primary_color_dark} onChange={(v) => updateBrand({ primary_color_dark: v })} />
                    <ColorField label="Header início" value={brand.header_bg_from} onChange={(v) => updateBrand({ header_bg_from: v })} />
                    <ColorField label="Header fim" value={brand.header_bg_to} onChange={(v) => updateBrand({ header_bg_to: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <ColorField label="Texto" value={brand.text_color} onChange={(v) => updateBrand({ text_color: v })} />
                    <ColorField label="Texto secundário" value={brand.muted_color} onChange={(v) => updateBrand({ muted_color: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="URL do rodapé" value={brand.footer_url} onChange={(v) => updateBrand({ footer_url: v })} />
                    <Field label="Texto do rodapé" value={brand.footer_label} onChange={(v) => updateBrand({ footer_label: v })} />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={saveBrand} disabled={saving} size="sm">
                      <Save className="w-4 h-4 mr-1" /> Salvar branding
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* TEMPLATE */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Conteúdo do template</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-[1fr,auto] gap-3 items-end">
                    <div>
                      <Label className="text-xs">Template</Label>
                      <Select value={active} onValueChange={(v) => setActive(v as TplType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(TPL_LABELS) as TplType[]).map((k) => (
                            <SelectItem key={k} value={k}>{TPL_LABELS[k]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {current && (
                      <div className="flex items-center gap-2 pb-2">
                        <Label className="text-xs">Ativo</Label>
                        <Switch checked={current.enabled} onCheckedChange={(v) => updateTpl({ enabled: v })} />
                      </div>
                    )}
                  </div>

                  {current && (
                    <>
                      <Field label="Assunto (subject)" value={current.subject} onChange={(v) => updateTpl({ subject: v })} />
                      <Field label="Preview (texto curto na inbox)" value={current.preview_text} onChange={(v) => updateTpl({ preview_text: v })} />
                      <Field label="Subtítulo do cabeçalho" value={current.header_subtitle} onChange={(v) => updateTpl({ header_subtitle: v })} />
                      <Field label="Título principal (heading)" value={current.heading} onChange={(v) => updateTpl({ heading: v })} />
                      <TextField label="Parágrafo introdutório (HTML permitido)" value={current.intro_html} onChange={(v) => updateTpl({ intro_html: v })} rows={3} />
                      <TextField label="Parágrafo do corpo (HTML permitido)" value={current.body_html} onChange={(v) => updateTpl({ body_html: v })} rows={3} />
                      <Field label="Texto do botão" value={current.button_label} onChange={(v) => updateTpl({ button_label: v })} />
                      <TextField label="Rodapé / aviso (HTML permitido)" value={current.footer_html} onChange={(v) => updateTpl({ footer_html: v })} rows={3} />
                      <p className="text-xs text-muted-foreground">
                        Variáveis disponíveis: <code>{"{{recipient}}"}</code>, <code>{"{{oldEmail}}"}</code>, <code>{"{{newEmail}}"}</code>
                      </p>
                      <Separator />
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={refreshPreview} disabled={previewing}>
                          <RefreshCw className={`w-4 h-4 mr-1 ${previewing ? "animate-spin" : ""}`} /> Atualizar preview
                        </Button>
                        <Button onClick={saveTemplate} disabled={saving} size="sm">
                          <Save className="w-4 h-4 mr-1" /> Salvar template
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* RIGHT: preview */}
            <Card className="lg:sticky lg:top-4 h-fit">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Pré-visualização — {TPL_LABELS[active]}</span>
                  {previewing && <Loader2 className="w-4 h-4 animate-spin" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <iframe
                  title="email-preview"
                  srcDoc={previewSrcDoc}
                  className="w-full bg-white rounded-md border"
                  style={{ height: "720px" }}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PlatformLayout>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TextField({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Textarea rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 rounded border cursor-pointer bg-transparent"
        />
        <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
      </div>
    </div>
  );
}
