import ExcelJS from 'exceljs';
import fs from 'fs';

const filePath = 'DIP_CORRETO.xlsx';

async function extract() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet('Planilha1');

    console.log("Analyzing worksheet rows...");
    worksheet.eachRow((row, rowNumber) => {
        const vals = row.values;
        if (rowNumber < 200) {
            const rowStr = JSON.stringify(vals).toUpperCase();
            if (rowStr.includes("PASSIVO") || rowStr.includes("PATRIM") || rowStr.includes("RECEITA")) {
                console.log(`R${rowNumber}: ${JSON.stringify(vals)}`);
            }
        }
    });
}

extract().catch(console.error);
