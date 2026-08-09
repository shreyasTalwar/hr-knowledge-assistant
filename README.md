# AI HR Knowledge Assistant

An intelligent Retrieval-Augmented Generation (RAG) platform that allows employees to ask natural language questions about company policies, guidelines, and handbooks, and receive verified answers with source citations. 

The application features a secure admin dashboard where HR managers can upload, index, and manage PDF documents dynamically.

---

## 🏗️ Architecture

```mermaid
graph TD
    Client[React Frontend Vite] <-->|Bearer Token Auth| API[Flask Backend API]
    Auth[Clerk Auth Provider] -.->|JWT Session Tokens| Client
    API <-->|Document Metadata| DB[(SQLite Database)]
    API --->|Saves Files| LocalFS[Local Uploads Folder]
    API --->|Page Text Extract| Parser[PyMuPDF Fitz Parser]
    Parser --->|Semantic Chunks| Splitter[LangChain Text Splitter]
    Splitter --->|bge-small-en-v1.5| Embedder[FastEmbed ONNX CPU Runtime]
    Embedder --->|384d Vectors| VectorDB[(Pinecone Index)]
    API <-->|Similarity Matches| VectorDB
    API <-->|Free Model Routing| LLM[OpenRouter API]
```

### Key Components:
1.  **Frontend (React + Vite)**: Configured with custom theme variables (Dark/Light mode support), Clerk UI wrappers, and message scrolling components. Built-in interactive citation elements allow clicking source buttons to open corresponding PDF files on the exact page.
2.  **Authentication (Clerk)**: Handles user login, profile management, and session tokens. Roles are verified on both the frontend and backend using JWT token payload claims (`role: admin` in public metadata).
3.  **Backend (Flask + Flask-SQLAlchemy)**: Tracks document processing state, serves static files, and validates session tokens using RSA signature verification. Uses request-local `g.user` contexts.
4.  **Database (SQLite)**: Stores local file metadata, upload timestamps, and status parameters.
5.  **Vector Store (Pinecone Serverless)**: Maintains document chunk vectors and metadata (source filename, page number, chunk index, hashed chunk ID).
6.  **Embedding Model (`bge-small-en-v1.5`)**: Transforms text passages page-by-page into dense 384-dimensional vector embeddings locally via FastEmbed ONNX runtime.
7.  **LLM Generation (OpenRouter)**: Grounded prompting built around the `openrouter/free` endpoint to generate accurate answers from context. Features strict regular expression checkers that sanitize hallucinations and validate citations against retrieved document sources.

---

## 🛠️ Configuration & Credentials

### 1. Backend Config
Create a file named `.env` inside the `backend/` directory:
```env
FLASK_APP=app.py
FLASK_ENV=development
PORT=5000

# Clerk RSA Signature Verification JWKS URL
CLERK_JWKS_URL=https://<your-clerk-app>.clerk.accounts.dev/.well-known/jwks.json

# Pinecone Credentials
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=ai-hr-assistant-index

# OpenRouter Key for RAG LLM
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=openrouter/free
```

### 2. Frontend Config
Create a file named `.env.local` inside the `frontend/` directory:
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_BASE_URL=http://localhost:5000/api
```

On production Vercel hosting, make sure you configure:
```env
VITE_API_BASE_URL=https://<your-render-backend-url>.onrender.com/api
```

---

## 🚀 Local Setup Guide

### 1. Run the Flask Backend
Navigate to the `backend/` directory and install the requirements:
```powershell
cd backend
pip install -r requirements.txt
```
Launch the API server:
```powershell
python app.py
```
*(On the first launch, it will automatically download the `bge-small-en-v1.5` embedding model weight files locally).*

### 2. Run the React Frontend
Navigate to the `frontend/` directory and install the dependencies:
```powershell
cd frontend
npm install
```
Launch the Vite development server:
```powershell
npm run dev
```

Open `http://localhost:5173/` in your browser to start asking questions!

