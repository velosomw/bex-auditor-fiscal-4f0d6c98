import ExcelJS from 'exceljs';
import fs from 'fs';

const filePath = 'DIP_CORRETO.xlsx';

async function extract() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet('Planilha1');

    console.log("Analyzing worksheet rows...");
    worksheet.eachRow((row, rowNumber) => {
        const c2 = row.getCell(2).value;
        const c3 = row.getCell(3).value;
        const c4 = row.getCell(4).value;
        
        if (rowNumber < 100) {
           // console.log(`R${rowNumber}: C2=${c2}, C3=${c3}, C4=${c4}`);
           if (c3 && c3.toString().toUpperCase().includes("RECEITA")) {
               console.log(`Potential RL at R${rowNumber}: ${c3} | Val: ${JSON.stringify(c4)}`);
           }
           if (c3 && c3.toString().toUpperCase().includes("PASSIVO")) {
               console.log(`Potential Passivo at R${rowNumber}: ${c3} | Val: ${JSON.stringify(c4)}`);
           }
        }
    });
}

extract().catch(console.error);
