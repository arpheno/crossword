import requests
from requests.exceptions import RequestException


from datetime import timedelta
from time import sleep

base_url = "https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword"


def already_fetched(date):
    return False  # Placeholder implementation; check if data already exists for the given date


class DataReader:
    def __init__(self, base_url=base_url, max_retries=5, backoff_factor=1):
        self.base_url = base_url
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor

    def fetch_data(self, start_date, end_date):
        for date in self.daterange(start_date, end_date):
            if not already_fetched(date):
                data = self._fetch_data(date)
                yield data

    def daterange(self, start_date, end_date):
        for n in range(int((end_date - start_date).days) + 1):
            yield (start_date + timedelta(n)).strftime("%Y%m%d")

    def _fetch_data(self, date):
        params = {"date": date}
        for i in range(self.max_retries):
            try:
                response = requests.get(self.base_url, params=params)
                response.raise_for_status()
                return response.text
            except RequestException as e:
                print(
                    f"Request failed: {e}, retrying in {self.backoff_factor} seconds..."
                )
                sleep(self.backoff_factor)
                self.backoff_factor *= 2
