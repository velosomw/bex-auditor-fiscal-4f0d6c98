import pandas as pd

file_path = "/mnt/user-uploads/DIP_setembro-25_a_março-26_v2.xlsx"

try:
    xl = pd.ExcelFile(file_path)
    print(f"Sheets: {xl.sheet_names}")
    for sheet in xl.sheet_names:
        df = xl.parse(sheet)
        print(f"\nSheet: {sheet}")
        print(f"Columns: {df.columns.tolist()[:10]}")
        print(f"Head:\n{df.head(5)}")
except Exception as e:
    print(f"Error: {e}")
