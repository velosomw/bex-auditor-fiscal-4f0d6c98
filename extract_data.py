import pandas as pd
import json

file_path = "DIP_CORRETO.xlsx"

try:
    xl = pd.ExcelFile(file_path)
    # Procurar por abas que contenham Balancete ou similar
    sheets = [s for s in xl.sheet_names if "Balancete" in s or "Auditoria" in s or "Consolidado" in s]
    if not sheets:
        sheets = xl.sheet_names

    result = {}
    for sheet in sheets:
        df = xl.parse(sheet)
        # Tentar identificar colunas de valores
        # Geralmente temos Ativo, Passivo, PL, Receita
        result[sheet] = {
            "columns": df.columns.tolist(),
            "sample": df.head(10).to_dict()
        }
    
    # Vamos focar em extrair os valores principais: AT, AC, PT, PC, PL, RL
    # Se for uma planilha de Auditoria, os nomes podem ser claros.
    
    print(json.dumps(result, indent=2))

except Exception as e:
    print(f"Error: {e}")
