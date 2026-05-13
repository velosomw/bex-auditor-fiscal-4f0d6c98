export type StickerType = 'Normal' | 'Especial';

export interface Sticker {
  id: string;
  numero: string;
  atleta: string;
  selecao: string;
  pais: string;
  tipo: StickerType;
  tenho: boolean;
  repetidas: number;
}

export interface SelectionStats {
  nome: string;
  total: number;
  tenho: number;
  percentual: number;
}
