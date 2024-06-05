from flask import Flask, render_template
import requests

app = Flask(__name__)


@app.route('/')
def hello_world():  # return the static content at static/app.html
    html = render_template('app.html')
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


if __name__ == '__main__':
    app.run()
