import fitz  # PyMuPDF
from langchain_text_splitters import RecursiveCharacterTextSplitter

def extract_pdf_pages(file_path):
    """
    Extracts text page-by-page from a PDF document.
    Returns a list of dictionaries with page numbers (1-indexed) and text content.
    """
    pages_data = []
    try:
        doc = fitz.open(file_path)
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text = page.get_text("text").strip()
            if text:
                pages_data.append({
                    "page_number": page_num + 1,
                    "text": text
                })
        doc.close()
    except Exception as e:
        print(f"Error reading PDF file {file_path}: {e}")
        raise e
    return pages_data

def chunk_document(filename, pages_data, chunk_size=500, chunk_overlap=50):
    """
    Splits the page-by-page text content into overlapping semantic chunks.
    Preserves page and source document reference metadata.
    """
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", " ", ""]
    )

    chunks = []
    for page in pages_data:
        page_text = page["text"]
        page_num = page["page_number"]
        
        # Split the text on the individual page
        splits = text_splitter.split_text(page_text)
        
        for index, split_text in enumerate(splits):
            chunks.append({
                "text": split_text,
                "metadata": {
                    "source": filename,
                    "page": page_num,
                    "chunk_index": index
                }
            })
            
    return chunks
