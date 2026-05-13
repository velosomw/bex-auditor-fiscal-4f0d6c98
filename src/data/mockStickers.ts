import { Sticker } from '../types/album';

export const MOCK_STICKERS: Sticker[] = [
  // Brasil
  { id: 'bra-01', numero: 'BRA 01', atleta: 'Escudo', selecao: 'Brasil', pais: 'Brasil', tipo: 'Especial', tenho: false, repetidas: 0 },
  { id: 'bra-02', numero: 'BRA 02', atleta: 'Vinicius Jr', selecao: 'Brasil', pais: 'Brasil', tipo: 'Normal', tenho: false, repetidas: 0 },
  { id: 'bra-03', numero: 'BRA 03', atleta: 'Rodrygo', selecao: 'Brasil', pais: 'Brasil', tipo: 'Normal', tenho: false, repetidas: 0 },
  { id: 'bra-04', numero: 'BRA 04', atleta: 'Alisson Becker', selecao: 'Brasil', pais: 'Brasil', tipo: 'Normal', tenho: false, repetidas: 0 },
  { id: 'bra-05', numero: 'BRA 05', atleta: 'Bruno Guimarães', selecao: 'Brasil', pais: 'Brasil', tipo: 'Normal', tenho: false, repetidas: 0 },
  
  // Argentina
  { id: 'arg-01', numero: 'ARG 01', atleta: 'Escudo', selecao: 'Argentina', pais: 'Argentina', tipo: 'Especial', tenho: false, repetidas: 0 },
  { id: 'arg-02', numero: 'ARG 02', atleta: 'Lionel Messi', selecao: 'Argentina', pais: 'Argentina', tipo: 'Normal', tenho: false, repetidas: 0 },
  { id: 'arg-03', numero: 'ARG 03', atleta: 'Julian Alvarez', selecao: 'Argentina', pais: 'Argentina', tipo: 'Normal', tenho: false, repetidas: 0 },
  { id: 'arg-04', numero: 'ARG 04', atleta: 'Emiliano Martínez', selecao: 'Argentina', pais: 'Argentina', tipo: 'Normal', tenho: false, repetidas: 0 },
  
  // França
  { id: 'fra-01', numero: 'FRA 01', atleta: 'Escudo', selecao: 'França', pais: 'França', tipo: 'Especial', tenho: false, repetidas: 0 },
  { id: 'fra-02', numero: 'FRA 02', atleta: 'Kylian Mbappé', selecao: 'França', pais: 'França', tipo: 'Normal', tenho: false, repetidas: 0 },
  { id: 'fra-03', numero: 'FRA 03', atleta: 'Antoine Griezmann', selecao: 'França', pais: 'França', tipo: 'Normal', tenho: false, repetidas: 0 },
  
  // Portugal
  { id: 'por-01', numero: 'POR 01', atleta: 'Escudo', selecao: 'Portugal', pais: 'Portugal', tipo: 'Especial', tenho: false, repetidas: 0 },
  { id: 'por-02', numero: 'POR 02', atleta: 'Cristiano Ronaldo', selecao: 'Portugal', pais: 'Portugal', tipo: 'Normal', tenho: false, repetidas: 0 },
  { id: 'por-03', numero: 'POR 03', atleta: 'Bruno Fernandes', selecao: 'Portugal', pais: 'Portugal', tipo: 'Normal', tenho: false, repetidas: 0 },
  
  // Inglaterra
  { id: 'eng-01', numero: 'ENG 01', atleta: 'Escudo', selecao: 'Inglaterra', pais: 'Inglaterra', tipo: 'Especial', tenho: false, repetidas: 0 },
  { id: 'eng-02', numero: 'ENG 02', atleta: 'Jude Bellingham', selecao: 'Inglaterra', pais: 'Inglaterra', tipo: 'Normal', tenho: false, repetidas: 0 },
  { id: 'eng-03', numero: 'ENG 03', atleta: 'Harry Kane', selecao: 'Inglaterra', pais: 'Inglaterra', tipo: 'Normal', tenho: false, repetidas: 0 },

  // EUA
  { id: 'usa-01', numero: 'USA 01', atleta: 'Escudo', selecao: 'EUA', pais: 'EUA', tipo: 'Especial', tenho: false, repetidas: 0 },
  { id: 'usa-02', numero: 'USA 02', atleta: 'Christian Pulisic', selecao: 'EUA', pais: 'EUA', tipo: 'Normal', tenho: false, repetidas: 0 },

  // México
  { id: 'mex-01', numero: 'MEX 01', atleta: 'Escudo', selecao: 'México', pais: 'México', tipo: 'Especial', tenho: false, repetidas: 0 },
  { id: 'mex-02', numero: 'MEX 02', atleta: 'Santiago Giménez', selecao: 'México', pais: 'México', tipo: 'Normal', tenho: false, repetidas: 0 },
];

export const ALL_SELECTIONS = [
  'Brasil', 'Argentina', 'França', 'Portugal', 'Inglaterra', 'EUA', 'México',
  'Espanha', 'Alemanha', 'Itália', 'Holanda', 'Bélgica', 'Croácia', 'Uruguai',
  'Colômbia', 'Chile', 'Japão', 'Coreia do Sul', 'Marrocos', 'Senegal',
  // ... adicione mais conforme necessário para chegar em 48
];
