import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Trophy, 
  CheckCircle2, 
  XCircle, 
  Filter, 
  BarChart3, 
  Users, 
  Moon, 
  Sun,
  LayoutDashboard,
  ClipboardList,
  Flame,
  Star,
  Download,
  Upload,
  RotateCcw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Sticker, SelectionStats } from '../types/album';
import { MOCK_STICKERS, ALL_SELECTIONS } from '../data/mockStickers';

const AlbumFIFA2026 = () => {
  const [stickers, setStickers] = useState<Sticker[]>(() => {
    const saved = localStorage.getItem('fifa-2026-album');
    return saved ? JSON.parse(saved) : MOCK_STICKERS;
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'tenho' | 'nao-tenho' | 'especiais'>('all');
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    localStorage.setItem('fifa-2026-album', JSON.stringify(stickers));
  }, [stickers]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const stats = useMemo(() => {
    const total = stickers.length;
    const tenho = stickers.filter(s => s.tenho).length;
    const faltam = total - tenho;
    const percentual = Math.round((tenho / total) * 100) || 0;
    const especiais = stickers.filter(s => s.tipo === 'Especial' && s.tenho).length;
    const totalEspeciais = stickers.filter(s => s.tipo === 'Especial').length;
    
    return { total, tenho, faltam, percentual, especiais, totalEspeciais };
  }, [stickers]);

  const selectionStats = useMemo(() => {
    const selections = Array.from(new Set(stickers.map(s => s.selecao)));
    return selections.map(sel => {
      const selStickers = stickers.filter(s => s.selecao === sel);
      const selTenho = selStickers.filter(s => s.tenho).length;
      return {
        nome: sel,
        total: selStickers.length,
        tenho: selTenho,
        percentual: Math.round((selTenho / selStickers.length) * 100) || 0
      };
    }).sort((a, b) => b.percentual - a.percentual);
  }, [stickers]);

  const filteredStickers = useMemo(() => {
    return stickers.filter(s => {
      const matchesSearch = 
        s.atleta.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.selecao.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = 
        filter === 'all' ||
        (filter === 'tenho' && s.tenho) ||
        (filter === 'nao-tenho' && !s.tenho) ||
        (filter === 'especiais' && s.tipo === 'Especial');
        
      return matchesSearch && matchesFilter;
    });
  }, [stickers, searchTerm, filter]);

  const toggleSticker = (id: string) => {
    setStickers(prev => prev.map(s => {
      if (s.id === id) {
        const newState = !s.tenho;
        if (newState) {
          // Play subtle sound logic here if desired
          toast.success(`${s.atleta} adicionado à coleção!`);
        }
        return { ...s, tenho: newState };
      }
      return s;
    }));
  };

  const exportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(stickers));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "album_fifa_2026_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-blue-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Trophy className="text-white w-6 h-6" />
            </div>
            <h1 className="font-bold text-xl tracking-tight hidden sm:block">
              Meu Álbum <span className="text-blue-600 dark:text-blue-400">FIFA 2026</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => setDarkMode(!darkMode)} className="rounded-full">
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <Button variant="outline" size="sm" onClick={exportData} className="hidden sm:flex items-center gap-2 rounded-full">
              <Download className="w-4 h-4" /> Exportar
            </Button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <Tabs defaultValue="dashboard" className="space-y-8">
          <div className="flex items-center justify-center">
            <TabsList className="grid w-full max-w-md grid-cols-3 p-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-2xl">
              <TabsTrigger value="dashboard" className="rounded-xl data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
                <LayoutDashboard className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Geral</span>
              </TabsTrigger>
              <TabsTrigger value="controle" className="rounded-xl data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
                <ClipboardList className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Controle</span>
              </TabsTrigger>
              <TabsTrigger value="selecoes" className="rounded-xl data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
                <Users className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Seleções</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="space-y-8">
            {/* Main Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card className="overflow-hidden border-none shadow-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium opacity-80 uppercase tracking-wider">Progresso Total</CardTitle>
                    <div className="text-4xl font-bold">{stats.percentual}%</div>
                  </CardHeader>
                  <CardContent>
                    <Progress value={stats.percentual} className="h-2 bg-white/20" />
                    <p className="text-xs mt-3 opacity-80">{stats.tenho} de {stats.total} figurinhas coladas</p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card className="border-none shadow-lg">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Faltantes</CardTitle>
                    <Flame className="w-4 h-4 text-orange-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{stats.faltam}</div>
                    <p className="text-xs text-slate-500 mt-1">Quase lá! Faltam poucas.</p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <Card className="border-none shadow-lg">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Especiais</CardTitle>
                    <Star className="w-4 h-4 text-yellow-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{stats.especiais}/{stats.totalEspeciais}</div>
                    <p className="text-xs text-slate-500 mt-1">Brilhantes colecionadas.</p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <Card className="border-none shadow-lg">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Repetidas</CardTitle>
                    <RotateCcw className="w-4 h-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">0</div>
                    <p className="text-xs text-slate-500 mt-1">Prontas para troca.</p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Selection Ranking */}
            <Card className="border-none shadow-lg overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                  Ranking de Seleções
                </CardTitle>
                <CardDescription>Progresso por país no seu álbum.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {selectionStats.slice(0, 5).map((sel, idx) => (
                    <div key={sel.nome} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold flex items-center gap-2">
                          <span className="text-slate-400">#{idx + 1}</span>
                          {sel.nome}
                        </span>
                        <span className="text-slate-500">{sel.tenho}/{sel.total} ({sel.percentual}%)</span>
                      </div>
                      <Progress value={sel.percentual} className="h-1.5" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="controle" className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Buscar por jogador, número ou país..." 
                  className="pl-10 h-11 bg-slate-50 dark:bg-slate-950 border-none rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant={filter === 'all' ? 'default' : 'ghost'} 
                  size="sm" 
                  onClick={() => setFilter('all')}
                  className="rounded-full"
                >
                  Todas
                </Button>
                <Button 
                  variant={filter === 'tenho' ? 'default' : 'ghost'} 
                  size="sm" 
                  onClick={() => setFilter('tenho')}
                  className="rounded-full flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Tenho
                </Button>
                <Button 
                  variant={filter === 'nao-tenho' ? 'default' : 'ghost'} 
                  size="sm" 
                  onClick={() => setFilter('nao-tenho')}
                  className="rounded-full flex items-center gap-1.5"
                >
                  <XCircle className="w-3.5 h-3.5" /> Faltam
                </Button>
                <Button 
                  variant={filter === 'especiais' ? 'default' : 'ghost'} 
                  size="sm" 
                  onClick={() => setFilter('especiais')}
                  className="rounded-full flex items-center gap-1.5"
                >
                  <Star className="w-3.5 h-3.5" /> Especiais
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredStickers.map((sticker) => (
                  <motion.div
                    key={sticker.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    whileHover={{ y: -5 }}
                    className="relative"
                  >
                    <Card 
                      className={`
                        cursor-pointer overflow-hidden border-2 transition-all duration-300 rounded-2xl group
                        ${sticker.tenho 
                          ? 'border-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-950/20' 
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grayscale-[0.5]'}
                      `}
                      onClick={() => toggleSticker(sticker.id)}
                    >
                      <div className="aspect-[3/4] p-3 flex flex-col items-center justify-between text-center relative overflow-hidden">
                        {/* Shimmer effect for specials */}
                        {sticker.tipo === 'Especial' && (
                          <div className="absolute inset-0 bg-gradient-to-tr from-yellow-500/10 via-white/5 to-yellow-500/10 animate-pulse pointer-events-none" />
                        )}
                        
                        <div className="w-full flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-500 transition-colors uppercase tracking-tight">
                            {sticker.numero}
                          </span>
                          {sticker.tipo === 'Especial' && (
                            <Badge variant="outline" className="text-[8px] bg-yellow-500/10 text-yellow-600 border-yellow-200/50 px-1.5 py-0 uppercase h-4">
                              ESP
                            </Badge>
                          )}
                        </div>

                        <div className="flex-1 flex flex-col items-center justify-center space-y-2">
                          <div className={`
                            w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-inner
                            ${sticker.tenho ? 'bg-emerald-100 dark:bg-emerald-900' : 'bg-slate-100 dark:bg-slate-800'}
                          `}>
                            ⚽
                          </div>
                          <div className="space-y-0.5">
                            <h3 className="font-bold text-sm leading-tight line-clamp-1">{sticker.atleta}</h3>
                            <p className="text-[10px] text-slate-500 font-medium">{sticker.selecao}</p>
                          </div>
                        </div>

                        <div className="w-full mt-2">
                          <Badge 
                            className={`
                              w-full justify-center text-[10px] font-bold rounded-lg py-0.5 h-6
                              ${sticker.tenho 
                                ? 'bg-emerald-500 text-white hover:bg-emerald-600' 
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600'}
                            `}
                          >
                            {sticker.tenho ? 'TENHO ✓' : 'NÃO TENHO'}
                          </Badge>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            
            {filteredStickers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Search className="w-12 h-12 mb-4 opacity-20" />
                <p>Nenhuma figurinha encontrada.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="selecoes">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {selectionStats.map((sel) => (
                <Card key={sel.nome} className="border-none shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                    <div className="space-y-1">
                      <CardTitle className="text-lg font-bold">{sel.nome}</CardTitle>
                      <CardDescription>{sel.tenho} de {sel.total} figurinhas</CardDescription>
                    </div>
                    <div className="text-2xl font-black text-slate-100 dark:text-slate-800 select-none">
                      {sel.percentual}%
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Progress value={sel.percentual} className="h-2 mb-2" />
                    <Button 
                      variant="secondary" 
                      className="w-full text-xs font-bold rounded-xl h-8"
                      onClick={() => {
                        setSearchTerm(sel.nome);
                        // Force change to controle tab
                        const trigger = document.querySelector('[value="controle"]') as HTMLElement;
                        trigger?.click();
                      }}
                    >
                      VER JOGADORES
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Mobile Floating Action Button Placeholder or Footer */}
      <footer className="mt-20 py-10 border-t border-slate-200 dark:border-slate-800 text-center">
        <p className="text-xs text-slate-400">
          © 2026 Meu Álbum FIFA World Cup. Criado para colecionadores apaixonados.
        </p>
      </footer>
    </div>
  );
};

export default AlbumFIFA2026;
