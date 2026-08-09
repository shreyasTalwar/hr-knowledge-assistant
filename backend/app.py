import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from auth import require_auth

import threading
from werkzeug.utils import secure_filename
from models import db, Document, ChatMessage
from parser import extract_pdf_pages, chunk_document
from vector_store import index_document_chunks, delete_document_vectors, query_similar_chunks
from llm import generate_rag_answer
import json



# Load environment variables
load_dotenv()

app = Flask(__name__)

# Configure local SQLite database URI
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///hr_assistant.db')
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Configure upload settings
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
ALLOWED_EXTENSIONS = {'pdf'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024 # 10MB limit

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Initialize database
db.init_app(app)

# Create database tables inside app context
with app.app_context():
    db.create_all()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Background processing target function
def process_pdf_in_background(app_context, doc_id, file_path, filename):
    with app_context:
        try:
            # 1. Extract text page-by-page
            pages_data = extract_pdf_pages(file_path)

            # 2. Split text into chunks
            chunks = chunk_document(filename, pages_data)

            # 3. Generate embeddings and index them inside Pinecone
            print(f"Generating embeddings and indexing {len(chunks)} chunks in Pinecone...")
            index_document_chunks(chunks)

            # Update document status to Indexed and save total page count
            doc = Document.query.get(doc_id)
            if doc:
                doc.status = 'indexed'
                doc.pages = len(pages_data)
                db.session.commit()


        except Exception as e:
            print(f"Error processing PDF {filename} in background: {e}")
            doc = Document.query.get(doc_id)
            if doc:
                doc.status = 'failed'
                db.session.commit()

# Configure CORS to accept requests from our frontend ports
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173", "http://localhost:5174"]}})

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "message": "AI HR Knowledge Assistant API is running smoothly."
    }), 200

# Secure Document Upload Endpoint for HR/Admin
@app.route('/api/admin/upload', methods=['POST'])
@require_auth(required_role='admin')
def upload_document():
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({"error": "No file selected for upload"}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        try:
            # Check if file with same name already exists in database
            existing_doc = Document.query.filter_by(name=filename).first()
            if existing_doc:
                return jsonify({"error": "A document with this name already exists. Please delete it first."}), 400

            file.save(file_path)
            file_size = os.path.getsize(file_path)
            size_kb = round(file_size / 1024, 1)
            size_str = f"{size_kb} KB" if size_kb < 1024 else f"{round(size_kb / 1024, 1)} MB"

            # Create document record inside SQLite database
            new_doc = Document(
                name=filename,
                size=size_str,
                status='processing'
            )
            db.session.add(new_doc)
            db.session.commit()

            # Trigger background parsing thread to avoid blocking the main server thread
            app_context = app.app_context()
            thread = threading.Thread(
                target=process_pdf_in_background,
                args=(app_context, new_doc.id, file_path, filename)
            )
            thread.start()

            return jsonify({
                "message": "File successfully uploaded and processing has started.",
                "document": new_doc.to_json()
            }), 201
            
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": f"Failed to save file: {str(e)}"}), 500
            
    return jsonify({"error": "Invalid file type. Only PDF documents are allowed."}), 400

# Get List of Uploaded Documents
@app.route('/api/admin/documents', methods=['GET'])
@require_auth()
def get_documents():

    try:
        documents = Document.query.order_by(Document.uploaded_at.desc()).all()
        return jsonify([doc.to_json() for doc in documents]), 200
    except Exception as e:
        return jsonify({"error": f"Failed to fetch documents: {str(e)}"}), 500

# Delete an Uploaded Document
@app.route('/api/admin/documents/<int:doc_id>', methods=['DELETE'])
@require_auth(required_role='admin')
def delete_document(doc_id):
    try:
        doc = Document.query.get(doc_id)
        if not doc:
            return jsonify({"error": "Document not found"}), 404
        
        # Delete file from local file storage
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], doc.name)
        if os.path.exists(file_path):
            os.remove(file_path)
            
        # Delete related vector embeddings from Pinecone index
        delete_document_vectors(doc.name)
            
        # Delete metadata from database
        db.session.delete(doc)
        db.session.commit()
        
        return jsonify({"message": f"Successfully deleted {doc.name}"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to delete document: {str(e)}"}), 500


# Secure Admin Test Endpoint
@app.route('/api/admin/verify', methods=['GET'])
@require_auth(required_role='admin')
def verify_admin():
    return jsonify({
        "authenticated": True,
        "message": "Access granted: You are authorized as an Admin."
    }), 200

# Secure Employee Test Endpoint
@app.route('/api/employee/verify', methods=['GET'])
@require_auth()
def verify_employee():
    return jsonify({
        "authenticated": True,
        "message": "Access granted: Authorized employee session."
    }), 200

# Secure Employee Similarity Query Endpoint
@app.route('/api/employee/query', methods=['POST'])
@require_auth()
def query_documents():
    try:
        data = request.get_json()
        if not data or 'question' not in data:
            return jsonify({"error": "Missing 'question' parameter in request body"}), 400
            
        question = data['question']
        user_id = request.user.get("id")
        
        # 1. Save User Question to SQLite
        user_msg = ChatMessage(
            user_id=user_id,
            role='user',
            content=question
        )
        db.session.add(user_msg)
        
        # 2. Retrieve the 3 most similar document chunks from Pinecone
        raw_matches = query_similar_chunks(question, top_k=6) # Fetch slightly more chunks to account for deleted ones
        
        # Filter matches to only include documents currently existing in SQLite database
        existing_doc_names = {doc.name for doc in Document.query.filter_by(status='indexed').all()}
        matches = [m for m in raw_matches if m.get("source") in existing_doc_names][:3]
        
        # 3. Formulate grounded RAG answer using OpenRouter
        answer, citations = generate_rag_answer(question, matches)

        
        # 4. Save Assistant Response to SQLite
        assistant_msg = ChatMessage(
            user_id=user_id,
            role='assistant',
            content=answer,
            source_metadata=json.dumps(citations)
        )
        db.session.add(assistant_msg)
        db.session.commit()
        
        return jsonify({
            "question": question,
            "answer": answer,
            "citations": citations,
            "matches": matches
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to retrieve context: {str(e)}"}), 500

# Fetch User's Chat History from SQLite
@app.route('/api/employee/chat', methods=['GET'])
@require_auth()
def get_chat_history():
    try:
        user_id = request.user.get("id")
        messages = ChatMessage.query.filter_by(user_id=user_id).order_by(ChatMessage.timestamp.ascii if hasattr(ChatMessage.timestamp, "ascii") else ChatMessage.timestamp.asc()).all()
        return jsonify([msg.to_json() for msg in messages]), 200
    except Exception as e:
        return jsonify({"error": f"Failed to fetch chat history: {str(e)}"}), 500

# Clear User's Chat History from SQLite
@app.route('/api/employee/chat', methods=['DELETE'])
@require_auth()
def clear_chat_history():
    try:
        user_id = request.user.get("id")
        ChatMessage.query.filter_by(user_id=user_id).delete()
        db.session.commit()
        return jsonify({"message": "Chat history cleared successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to clear chat history: {str(e)}"}), 500

# Secure Endpoint to serve uploaded PDF documents
from flask import send_from_directory
@app.route('/api/documents/view/<filename>', methods=['GET'])
@require_auth()
def view_pdf_document(filename):
    try:
        # Enforce secure filename checking
        filename = secure_filename(filename)
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    except Exception as e:
        return jsonify({"error": f"Failed to load file: {str(e)}"}), 500


if __name__ == '__main__':
    from flask import request
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)





