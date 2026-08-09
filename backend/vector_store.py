import os
from pinecone import Pinecone
from dotenv import load_dotenv
from fastembed import TextEmbedding

# Ensure environment variables are loaded
load_dotenv()

# Initialize FastEmbed ONNX model (uses much less RAM than sentence-transformers/torch)
print("Loading FastEmbed model (BAAI/bge-small-en-v1.5)...")
model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
print("Model loaded successfully.")


PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")

# Initialize Pinecone Client
pc = None
index = None

if PINECONE_API_KEY and PINECONE_INDEX_NAME:
    try:
        pc = Pinecone(api_key=PINECONE_API_KEY)
        index = pc.Index(PINECONE_INDEX_NAME)
        print(f"Connected to Pinecone Index: {PINECONE_INDEX_NAME}")
    except Exception as e:
        print(f"Failed to initialize Pinecone Index connection: {e}")
else:
    print("Warning: PINECONE_API_KEY or PINECONE_INDEX_NAME environment variables are missing. Vector indexing will be disabled.")

def get_embedding(text):
    """
    Generate 384-dimensional vector embedding for a given string text.
    """
    # model.embed returns a generator of numpy arrays. We convert the first item to list.
    embeddings = list(model.embed([text]))
    return embeddings[0].tolist()


def index_document_chunks(chunks):
    """
    Generates embeddings for a list of document text chunks and upserts them to Pinecone.
    """
    if not index:
        raise ValueError("Pinecone connection is not active. Check API Keys.")

    upsert_data = []
    
    for idx, chunk in enumerate(chunks):
        text = chunk["text"]
        meta = chunk["metadata"]
        
        # Generate embedding vector
        vector = get_embedding(text)
        
        # Merge text content directly into metadata payload for grounding during searches
        meta["text"] = text
        
        # Unique vector identifier
        vector_id = f"{meta['source']}_chunk_{idx}"
        
        upsert_data.append((
            vector_id,
            vector,
            meta
        ))

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
    if not index:
        raise ValueError("Pinecone connection is not active. Check API Keys.")

    try:
        # Generate embedding vector for the question query
        query_vector = get_embedding(query_text)
        
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
                "score": match.get("score"),
                "text": metadata.get("text", ""),
                "source": metadata.get("source", "Unknown"),
                "page": metadata.get("page", 0)
            })
            
        return matches
    except Exception as e:
        print(f"Error querying Pinecone index: {e}")
        raise e



