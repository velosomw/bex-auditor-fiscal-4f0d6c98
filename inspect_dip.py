import pandas as pd
import json

file_path = "DIP_CORRETO.xlsx"

try:
    xl = pd.ExcelFile(file_path)
    sheets = xl.sheet_names
    print(f"Sheets: {sheets}")
    
    # Vamos ler as primeiras linhas de cada aba para entender a estrutura
    for sheet in sheets:
        df = xl.parse(sheet, nrows=15)
        print(f"\n--- Sheet: {sheet} ---")
        print(df.to_string())

except Exception as e:
    print(f"Error: {e}")
