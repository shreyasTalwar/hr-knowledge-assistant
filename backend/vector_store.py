import os
from pinecone import Pinecone
from dotenv import load_dotenv

# Ensure environment variables are loaded
load_dotenv()

# Global dimensions and models resolved dynamically on startup
EMBEDDING_MODEL = "bge-small-en-v1.5"
INDEX_DIMENSION = 384

if PINECONE_API_KEY and PINECONE_INDEX_NAME:
    try:
        pc = Pinecone(api_key=PINECONE_API_KEY)
        index = pc.Index(PINECONE_INDEX_NAME)
        print(f"Connected to Pinecone Index: {PINECONE_INDEX_NAME}")
        
        # Query index description to adjust the embedding model to match the exact dimension
        desc = pc.describe_index(name=PINECONE_INDEX_NAME)
        INDEX_DIMENSION = desc.dimension
        if INDEX_DIMENSION == 1024:
            EMBEDDING_MODEL = "multilingual-e5-large"
        else:
            EMBEDDING_MODEL = "bge-small-en-v1.5"
            
        print(f"Index Dimension: {INDEX_DIMENSION}, Selected Model: {EMBEDDING_MODEL}")
    except Exception as e:
        print(f"Failed to initialize Pinecone Index connection: {e}")
else:
    print("Warning: PINECONE_API_KEY or PINECONE_INDEX_NAME environment variables are missing. Vector indexing will be disabled.")

def get_embedding(text, input_type="passage"):
    """
    Generate vector embedding using Pinecone's Inference API.
    Handles 'passage' or 'query' format parameters.
    """
    if not pc:
        raise ValueError("Pinecone client is not initialized.")
    
    try:
        res = pc.inference.embed(
            model=EMBEDDING_MODEL,
            inputs=[text],
            parameters={
                "input_type": input_type,
                "truncate": "END"
            }
        )
        values = list(res[0].values)
        if len(values) != INDEX_DIMENSION:
            raise ValueError(
                f"Embedding dimension mismatch: expected {INDEX_DIMENSION}, got {len(values)} using {EMBEDDING_MODEL}"
            )
        return values
    except Exception as e:
        print(f"Pinecone embedding generation failed using {EMBEDDING_MODEL}: {e}")
        raise e


import hashlib

def make_chunk_id(source, page, chunk_index, text):
    raw = f"{source}|{page}|{chunk_index}|{text}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]

def index_document_chunks(chunks):
    """
    Generates embeddings for a list of document text chunks and upserts them to Pinecone.
    """
    if index is None:
        raise ValueError("Pinecone connection is not active. Check API Keys.")

    upsert_data = []
    
    for chunk in chunks:
        text = chunk["text"].strip()
        metadata = dict(chunk["metadata"])
        if not text:
            continue
            
        chunk_id = make_chunk_id(
            metadata.get("source", "unknown"),
            metadata.get("page", 0),
            metadata.get("chunk_index", 0),
            text
        )
        
        metadata["chunk_id"] = chunk_id
        metadata["text"] = text
        
        upsert_data.append((
            chunk_id,
            get_embedding(text, "passage"),
            metadata
        ))

    if not upsert_data:
        return

    # Batch upsert to Pinecone
    try:
        print(f"Upserting {len(upsert_data)} vectors to Pinecone...")
        index.upsert(vectors=upsert_data)
        print("Upsert complete.")
    except Exception as e:
        print(f"Error upserting vectors to Pinecone: {e}")
        raise e


def delete_document_vectors(filename):
    """
    Deletes all vector embeddings associated with a specific file.
    Gracefully catches and ignores 404 Namespace Not Found errors (which occur when index is empty).
    """
    if not index:
        return
        
    try:
        print(f"Deleting vectors associated with source: {filename} from Pinecone...")
        index.delete(filter={"source": {"$eq": filename}})
        print("Deletion from Pinecone complete.")
    except Exception as e:
        # In Pinecone serverless, if the index has no namespace, it raises a 404 Namespace Not Found error.
        # We catch and log this warning instead of crashing the server.
        if "Namespace not found" in str(e) or "404" in str(e):
            print("Pinecone Warning: Namespace/vectors not found. Index is likely empty or vectors are already deleted.")
        else:
            print(f"Error deleting vectors from Pinecone: {e}")
            raise e

def query_similar_chunks(query_text, top_k=3):
    """
    Embeds the input query and retrieves the top_k most similar document text chunks from Pinecone.
    """
    if index is None:
        raise ValueError("Pinecone connection is not active. Check API Keys.")

    try:
        # Generate embedding vector for the question query
        query_vector = get_embedding(query_text, "query")
        
        # Query Pinecone index
        results = index.query(
            vector=query_vector,
            top_k=top_k,
            include_metadata=True
        )
        
        matches = []
        for match in results.get("matches", []):
            metadata = match.get("metadata", {})
            matches.append({
                "id": match.get("id"),
                "score": match.get("score"),
                "text": metadata.get("text", ""),
                "source": metadata.get("source", "Unknown document"),
                "page": metadata.get("page"),
                "chunk_index": metadata.get("chunk_index"),
                "chunk_id": metadata.get("chunk_id"),
                "section": metadata.get("section")
            })
            
        return matches
    except Exception as e:
        print(f"Error querying similar chunks: {e}")
        raise e

