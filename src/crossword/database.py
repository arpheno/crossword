"""
Database configuration and models for tracking completed puzzles.
"""
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


db = SQLAlchemy(model_class=Base)


class CompletedPuzzle(db.Model):
    """Track puzzles that have been completed by users."""
    __tablename__ = 'completed_puzzles'
    
    id = db.Column(db.Integer, primary_key=True)
    puzzle_date = db.Column(db.String(6), unique=True, nullable=False, index=True)  # YYMMDD format
    title = db.Column(db.String(200))
    authors = db.Column(db.Text)  # JSON string of authors list
    weekday = db.Column(db.String(10))  # e.g., 'monday', 'tuesday'
    completed_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    time_taken = db.Column(db.Integer)  # Time in seconds
    score = db.Column(db.Integer)  # Final score
    
    def __repr__(self):
        return f'<CompletedPuzzle {self.puzzle_date} - {self.title}>'
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization."""
        import json
        return {
            'id': self.id,
            'puzzle_date': self.puzzle_date,
            'title': self.title,
            'authors': json.loads(self.authors) if self.authors else [],
            'weekday': self.weekday,
            'completed_at': self.completed_at.isoformat(),
            'time_taken': self.time_taken,
            'score': self.score
        }


def init_db(app):
    """Initialize the database."""
    with app.app_context():
        db.create_all()
