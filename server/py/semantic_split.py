import json
import sys
import os
from langchain_experimental.text_splitter import SemanticChunker
from langchain_openai.embeddings import OpenAIEmbeddings
from langchain_community.document_loaders.pdf import PyPDFLoader

def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            'error': 'No filename provided'
        }))
        sys.exit(1)

    try:
        # Get the PDF filename from arguments
        pdf_filename = sys.argv[1]
        pdf_path = os.path.join(os.getcwd(), 'uploads', pdf_filename)

        if not os.path.exists(pdf_path):
            print(json.dumps({
                'error': f'PDF file not found: {pdf_filename}'
            }))
            sys.exit(1)

        # Load the PDF
        loader = PyPDFLoader(pdf_path)
        docs = loader.load()

        # Create semantic chunker with gradient method (best for domain-specific content)
        text_splitter = SemanticChunker(
            OpenAIEmbeddings(),
            breakpoint_threshold_type="gradient",
            breakpoint_threshold_amount=95.0,
            min_chunk_size=100  # Minimum chunk size in characters
        )

        # Split the documents
        split_docs = text_splitter.split_documents(docs)

        # Prepare the chunks data
        chunks = []
        for doc in split_docs:
            chunk = {
                'text': doc.page_content,
                'metadata': doc.metadata
            }
            chunks.append(chunk)

        # Print the result as JSON
        print(json.dumps({
            'success': True,
            'chunks': chunks
        }))
        sys.exit(0)

    except Exception as e:
        print(json.dumps({
            'error': str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()