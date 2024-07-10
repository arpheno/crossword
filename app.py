import random
from datetime import datetime, timedelta

from flask import Flask, render_template
import requests

from scraper import DataReader, Crossword
from work_in_progress import process_to_entities

app = Flask(__name__)


@app.route('/')
def hello_world():  # return the static content at static/app.html
    html = render_template('app.html')
    return html
@app.route('/new')
def new():  # return the static content at static/app.html
    html = render_template('newapp.html')
    return html
# I want to load from https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword?date={date}
# and then extract the crossword data from the response and return to client
# client will send the date as a query parameter
# The date will be in the format YYMMDD
# the response is a text blob with the crossword data
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
    crossword = Crossword.from_api_response(reader._fetch_data(formatted_date))
    print(f'Crossword for {formatted_date} fetched')
    #Validate that the crosswords date is the correct weekday
    assert datetime.strptime(crossword.date, "%y%m%d").weekday() == weekday_map[weekday]
    entities = process_to_entities(crossword)
    #Do i need to turn the pedantic model to json here?
    return [entity.dict() for entity in entities]


if __name__ == '__main__':
    app.run()
