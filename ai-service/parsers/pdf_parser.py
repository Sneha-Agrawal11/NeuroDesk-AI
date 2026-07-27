import fitz  # PyMuPDF
from parsers.base import FileParser

class PDFParser(FileParser):
    def parse(self, file_path: str) -> str:
        text = ""
        try:
            doc = fitz.open(file_path)
            for page in doc:
                text += page.get_text()
            return text
        except Exception as e:
            return f"Error extracting PDF: {str(e)}"
