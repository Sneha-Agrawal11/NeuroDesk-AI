import fitz  # PyMuPDF
from parsers.base import FileParser
 
class PDFParser(FileParser):
    def parse(self, file_path: str) -> str:
        text = ""
        try:
            doc = fitz.open(file_path)
            for page in doc:
                # page.get_text() (plain "text" mode) can silently merge
                # adjacent words with no space between them when a PDF was
                # generated with precise glyph positioning instead of actual
                # space characters (common with certain resume templates/
                # exporters). That corrupts every downstream AI reading of
                # the text - not just spacing, but keyword detection, name
                # parsing, everything. Reconstructing from word-level boxes
                # guarantees a real space between every word, every time.
                words = page.get_text("words")  # (x0,y0,x1,y1, word, block_no, line_no, word_no)
                if words:
                    lines = {}
                    for w in words:
                        key = (w[5], w[6])  # (block_no, line_no) - preserves reading order
                        lines.setdefault(key, []).append(w[4])
                    for key in sorted(lines.keys()):
                        text += " ".join(lines[key]) + "\n"
                else:
                    text += page.get_text()
            return text
        except Exception as e:
            return f"Error extracting PDF: {str(e)}"
 