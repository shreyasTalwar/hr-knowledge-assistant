from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Document(db.Model):
    __tablename__ = 'documents'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), unique=True, nullable=False)
    size = db.Column(db.String(50), nullable=False)
    pages = db.Column(db.Integer, default=0) # Total pages in PDF
    status = db.Column(db.String(50), default='processing', nullable=False) # processing, indexed, failed
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_json(self):
        return {
            "id": self.id,
            "name": self.name,
            "size": self.size,
            "pages": self.pages,
            "status": self.status,
            "uploadedAt": self.uploaded_at.strftime('%Y-%m-%d %H:%M')
        }

class ChatMessage(db.Model):
    __tablename__ = 'chat_messages'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(50), nullable=False) # 'user' or 'assistant'
    content = db.Column(db.Text, nullable=False)
    source_metadata = db.Column(db.Text, nullable=True) # JSON serialized citations list
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_json(self):
        import json
        citations = []
        if self.source_metadata:
            try:
                citations = json.loads(self.source_metadata)
            except Exception:
                citations = []
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "source": citations,
            "timestamp": self.timestamp.strftime('%Y-%m-%d %H:%M')
        }


