import ExcelJS from 'exceljs';
import fs from 'fs';

const filePath = 'DIP_CORRETO.xlsx';

async function extract() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet('Planilha1');

    const months = ["Set/25", "Out/25", "Nov/25", "Dez/25", "Jan/26", "Fev/26", "Mar/26"];
    const monthColumns = [4, 5, 6, 7, 8, 9, 10]; 

    const data = months.map((m, i) => ({
        mes: m,
        col: monthColumns[i],
        at: 0, ac: 0, pt: 0, pc: 0, pl: 0, rl: 0
    }));

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const accountRaw = row.getCell(2).value;
        const account = accountRaw ? accountRaw.toString().trim() : "";
        const descRaw = row.getCell(3).value;
        const desc = descRaw ? descRaw.toString().toUpperCase().trim() : "";

        // console.log(`R${rowNumber}: Acc=${account}, Desc=${desc}`);

        data.forEach(m => {
            const cell = row.getCell(m.col);
            let val = 0;
            if (cell.type === ExcelJS.ValueType.Formula) {
                val = cell.result;
            } else {
                val = cell.value;
            }
            
            val = parseFloat(val) || 0;
            
            if (account === "1" || desc === 'ATIVO') m.at = val;
            if (account === "1.1" || desc === 'ATIVO CIRCULANTE') m.ac = val;
            if (account === "2" || desc === 'PASSIVO') m.pt = val;
            if (account === "2.1" || desc === 'PASSIVO CIRCULANTE') m.pc = val;
            if (account === "2.3" || desc === 'PATRIMONIO LIQUIDO') m.pl = val;
            if (account === "3.1" || desc === 'RECEITA OPERACIONAL LÍQUIDA') m.rl = val;
        });
    });

    console.log(JSON.stringify(data, null, 2));
}

extract().catch(console.error);
