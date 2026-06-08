import ExcelJS from 'exceljs';
import fs from 'fs';

const filePath = 'DIP_CORRETO.xlsx';

async function extract() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet('Planilha1');

    const months = ["Setembro 2025", "Outubro 2025", "Novembro 2025", "Dezembro 2025", "Janeiro 2026", "Fevereiro 2026", "Março 2026"];
    const monthColumns = [4, 5, 6, 7, 8, 9, 10]; // Colunas D, E, F, G, H, I, J

    const data = months.map((m, i) => ({
        mes: m,
        col: monthColumns[i],
        at: 0, ac: 0, pt: 0, pc: 0, pl: 0, rl: 0
    }));

    worksheet.eachRow((row, rowNumber) => {
        const desc = row.getCell(3).value; // Descrição na coluna C
        const account = row.getCell(2).value; // Conta na coluna B

        if (!desc) return;

        const d = desc.toString().toUpperCase();

        data.forEach(m => {
            const val = parseFloat(row.getCell(m.col).value) || 0;
            
            // Ativo Total (Conta 1)
            if (account === '1' || d === 'ATIVO') m.at = val;
            // Ativo Circulante (Conta 1.1)
            if (account === '1.1' || d === 'ATIVO CIRCULANTE') m.ac = val;
            // Passivo Total (Conta 2) - Se houver
            if (account === '2' || d === 'PASSIVO') m.pt = val;
            // Passivo Circulante (Conta 2.1)
            if (account === '2.1' || d === 'PASSIVO CIRCULANTE') m.pc = val;
            // Patrimônio Líquido (Conta 2.3)
            if (account === '2.3' || d === 'PATRIMÔNIO LÍQUIDO') m.pl = val;
            // Receita Líquida (Vamos procurar por "Receita Líquida" ou "Receita Operacional Líquida")
            if (d.includes('RECEITA LÍQUIDA') || d.includes('RECEITA OPERACIONAL LÍQUIDA')) m.rl = val;
        });
    });

    console.log(JSON.stringify(data, null, 2));
}

extract().catch(console.error);
