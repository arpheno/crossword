import random
from datetime import datetime, timedelta
import os

from flask import Flask, render_template
import requests

from .data_reader import DataReader

from .entity import Crossword
from .crossword_builder import build_crossword

# Get the directory containing this file
current_dir = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__,
           template_folder=os.path.join(current_dir, 'templates'),
           static_folder=os.path.join(current_dir, 'static'))


@app.route('/')
def index():  # return the static content at static/app.html
    html = render_template('newapp.html')
    return html
@app.route('/crossword/<date>')
def get_crossword(date):
    content = requests.get(f'https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword?date={date}').text
    return content


def daterange(begin, end):
    current_date = begin
    while current_date < end:
        yield current_date
        current_date += timedelta(days=1)


base_url = "https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword"


@app.route('/random_crossword/<weekday>')
def get_random_crossword(weekday):
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
        return 'Invalid weekday'
    random_date = random.choice([date for date in daterange(begin, end) if date.weekday() == weekday_map[weekday]])
    reader = DataReader(base_url=base_url)
    formatted_date = random_date.strftime("%y%m%d")
    print(f"Fetching crossword for {weekday} {formatted_date}")
    crossword_data = Crossword.from_api_response(reader._fetch_data(formatted_date))
    print(f'Crossword for {formatted_date} fetched')
    #Validate that the crosswords date is the correct weekday
    assert datetime.strptime(crossword_data.date, "%y%m%d").weekday() == weekday_map[weekday]
    
    entities = build_crossword(crossword_data)
    
    response_data = {
        "metadata": {
            "date": crossword_data.date,
            "title": crossword_data.title,
            "authors": crossword_data.authors
        },
        "entries": [entity.dict() for entity in entities]
    }
    return response_data


@app.route('/grid')
def grid():
    # Example black cells - you can modify this pattern
    black_cells = {(0, 4), (1, 1), (2, 2), (3, 3), (4, 0)}
    return render_template('grid.html', black_cells=black_cells)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
