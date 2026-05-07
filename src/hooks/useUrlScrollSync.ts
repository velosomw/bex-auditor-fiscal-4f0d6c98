import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Sincroniza a posição de rolagem da janela com a URL via query param `sy`.
 * - Restaura ao montar e em navegações popstate (voltar/avançar).
 * - Persiste com debounce e usa { replace: true } para não poluir o histórico.
 *
 * @param key nome do query param (default: "sy")
 * @param enabled habilita/desabilita o sync
 */
export function useUrlScrollSync(key: string = "sy", enabled: boolean = true) {
  const [searchParams, setSearchParams] = useSearchParams();
  const restoringRef = useRef(false);
  const lastWrittenRef = useRef<string | null>(null);

  // URL → scroll (mount + popstate). Aguarda render para alvo existir.
  useEffect(() => {
    if (!enabled) return;
    const sy = searchParams.get(key);
    if (sy == null) return;
    const y = parseInt(sy, 10);
    if (!Number.isFinite(y)) return;
    restoringRef.current = true;
    // Tenta múltiplos frames para garantir que o conteúdo já foi montado.
    let tries = 0;
    const tick = () => {
      window.scrollTo({ top: y, behavior: "auto" });
      tries++;
      if (tries < 5) requestAnimationFrame(tick);
      else setTimeout(() => { restoringRef.current = false; }, 100);
    };
    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get(key), enabled]);

  // Scroll → URL (debounced).
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (restoringRef.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const y = Math.round(window.scrollY);
        const v = y > 0 ? String(y) : "";
        if (lastWrittenRef.current === v) return;
        lastWrittenRef.current = v;
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          if (v) next.set(key, v); else next.delete(key);
          return next;
        }, { replace: true });
      }, 250);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [enabled, key, setSearchParams]);
}
