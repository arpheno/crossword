# Crossword Puzzle App

A web application for solving crossword puzzles that works both online and offline.

## Setup Local Dependencies

For offline support, the application requires local copies of Vue.js and Axios. Follow these steps to set up the local dependencies:

1. Create the libraries directory:
```bash
mkdir -p src/crossword/static/lib
```

2. Download the required libraries:
```bash
# Download Vue.js
curl -o src/crossword/static/lib/vue.js https://cdn.jsdelivr.net/npm/vue@2.6.14/dist/vue.js

# Download Axios
curl -o src/crossword/static/lib/axios.min.js https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js
```

These steps ensure that the application works properly in offline mode by using local copies of the required JavaScript libraries instead of CDN versions. 