import random
from datetime import datetime, timedelta
import os
import json

from flask import Flask, render_template, jsonify, request
import requests

from .data_reader import DataReader
from .parser import NYTFormatParser
from .database import db, init_db, CompletedPuzzle

# Get the directory containing this file
current_dir = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__,
           template_folder=os.path.join(current_dir, 'templates'),
           static_folder=os.path.join(current_dir, 'static'))

# Configure SQLAlchemy
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///crossword.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
db.init_app(app)
init_db(app)


@app.route('/')
def index():
    """Main crossword interface."""
    html = render_template('newapp.html')
    return html
@app.route('/crossword/<date>')
def get_crossword(date):
    content = requests.get(f'https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword?date={date}').text
    return content


@app.route('/crossword_by_date/<date>')
def get_crossword_by_date(date):
    """Get a specific crossword puzzle by date (YYMMDD format)."""
    try:
        reader = DataReader(base_url=base_url)
        print(f"Fetching crossword for date {date}")
        
        # Fetch and parse crossword
        api_text = reader._fetch_data(date)
        crossword = NYTFormatParser.parse(api_text)
        
        print(f'Crossword for {date} parsed: {len(crossword.entries)} entries')
        
        # Serialize crossword data
        response_data = {
            "metadata": crossword.metadata.model_dump(),
            "entries": [entry.model_dump() for entry in crossword.entries]
        }
        
        return jsonify(response_data)
    except Exception as e:
        print(f"Error fetching crossword for date {date}: {e}")
        return jsonify({"error": str(e)}), 400


def daterange(begin, end):
    current_date = begin
    while current_date < end:
        yield current_date
        current_date += timedelta(days=1)


base_url = "https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword"


@app.route('/random_crossword/<weekday>')
def get_random_crossword(weekday):
    """Get a random crossword puzzle for the specified weekday."""
    begin = datetime(2010, 1, 1)
    end = datetime.today()
    weekday = weekday.lower()
    weekday_map = {
        'monday': 0,
        'tuesday': 1,
        'wednesday': 2,
        'thursday': 3,
        'friday': 4,
        'saturday': 5,
        'sunday': 6
    }
    if weekday not in weekday_map:
        return jsonify({"error": "Invalid weekday"}), 400
    
    random_date = random.choice([date for date in daterange(begin, end) if date.weekday() == weekday_map[weekday]])
    reader = DataReader(base_url=base_url)
    formatted_date = random_date.strftime("%y%m%d")
    print(f"Fetching crossword for {weekday} {formatted_date}")
    
    # Fetch and parse crossword
    api_text = reader._fetch_data(formatted_date)
    crossword = NYTFormatParser.parse(api_text)
    
    print(f'Crossword for {formatted_date} parsed: {len(crossword.entries)} entries')
    
    # Validate that the crossword date is the correct weekday
    assert datetime.strptime(crossword.metadata.date, "%y%m%d").weekday() == weekday_map[weekday]
    
    # Serialize crossword data
    response_data = {
        "metadata": crossword.metadata.model_dump(),
        "entries": [entry.model_dump() for entry in crossword.entries]
    }
    
    return jsonify(response_data)


@app.route('/grid')
def grid():
    # Example black cells - you can modify this pattern
    black_cells = {(0, 4), (1, 1), (2, 2), (3, 3), (4, 0)}
    return render_template('grid.html', black_cells=black_cells)


@app.route('/api/completed_puzzles', methods=['GET'])
def get_completed_puzzles():
    """Get all completed puzzles."""
    try:
        completed = CompletedPuzzle.query.order_by(CompletedPuzzle.completed_at.desc()).all()
        return jsonify([puzzle.to_dict() for puzzle in completed])
    except Exception as e:
        print(f"Error fetching completed puzzles: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/completed_puzzles/<puzzle_date>', methods=['GET'])
def check_puzzle_completed(puzzle_date):
    """Check if a specific puzzle is completed."""
    try:
        puzzle = CompletedPuzzle.query.filter_by(puzzle_date=puzzle_date).first()
        if puzzle:
            return jsonify({"completed": True, "data": puzzle.to_dict()})
        return jsonify({"completed": False})
    except Exception as e:
        print(f"Error checking puzzle completion: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/completed_puzzles', methods=['POST'])
def mark_puzzle_completed():
    """Mark a puzzle as completed."""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data or 'puzzle_date' not in data:
            return jsonify({"error": "puzzle_date is required"}), 400
        
        puzzle_date = data['puzzle_date']
        
        # Check if already exists
        existing = CompletedPuzzle.query.filter_by(puzzle_date=puzzle_date).first()
        if existing:
            return jsonify({
                "message": "Puzzle already marked as completed",
                "data": existing.to_dict()
            }), 200
        
        # Create new completed puzzle record
        completed_puzzle = CompletedPuzzle(
            puzzle_date=puzzle_date,
            title=data.get('title', ''),
            authors=json.dumps(data.get('authors', [])),
            weekday=data.get('weekday', ''),
            time_taken=data.get('time_taken'),
            score=data.get('score')
        )
        
        db.session.add(completed_puzzle)
        db.session.commit()
        
        print(f"Marked puzzle {puzzle_date} as completed")
        
        return jsonify({
            "message": "Puzzle marked as completed",
            "data": completed_puzzle.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"Error marking puzzle as completed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/completed_puzzles/<puzzle_date>', methods=['DELETE'])
def delete_completed_puzzle(puzzle_date):
    """Delete a completed puzzle record (for testing/reset)."""
    try:
        puzzle = CompletedPuzzle.query.filter_by(puzzle_date=puzzle_date).first()
        if not puzzle:
            return jsonify({"error": "Puzzle not found"}), 404
        
        db.session.delete(puzzle)
        db.session.commit()
        
        return jsonify({"message": "Puzzle completion record deleted"}), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting completed puzzle: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
