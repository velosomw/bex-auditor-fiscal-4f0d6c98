import ExcelJS from 'exceljs';
import fs from 'fs';

const filePath = 'DIP_CORRETO.xlsx';

async function extract() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet('Planilha1');

    console.log("Dumping values of R2, R3, R161, R162, R277, R291...");
    [2, 3, 161, 162, 277, 291].forEach(r => {
        const row = worksheet.getRow(r);
        console.log(`R${r}: ${JSON.stringify(row.values)}`);
    });
}

extract().catch(console.error);
