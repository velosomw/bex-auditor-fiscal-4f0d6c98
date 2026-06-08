import ExcelJS from 'exceljs';
import fs from 'fs';

const filePath = 'DIP_CORRETO.xlsx';

async function extract() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    workbook.eachSheet((worksheet, sheetId) => {
        console.log(`\n--- Sheet: ${worksheet.name} ---`);
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber <= 20) {
                console.log(`Row ${rowNumber}: ${JSON.stringify(row.values)}`);
            }
        });
    });
}

extract().catch(console.error);
