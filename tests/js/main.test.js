
const Vue = require('vue');
const axios = require('axios');

// Mock global objects before importing main.js
global.io = jest.fn(() => ({
    on: jest.fn(),
    emit: jest.fn()
}));
global.Vue = Vue;
global.axios = axios;

// Mock window properties that might be missing in JSDOM or need specific values
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(), // deprecated
        removeListener: jest.fn(), // deprecated
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    })),
});

// Mock localStorage
const localStorageMock = (function () {
    let store = {};
    return {
        getItem: jest.fn(key => store[key] || null),
        setItem: jest.fn((key, value) => {
            store[key] = value.toString();
        }),
        removeItem: jest.fn(key => {
            delete store[key];
        }),
        clear: jest.fn(() => {
            store = {};
        })
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Import the app
const { CrosswordApp } = require('../../src/crossword/static/main.js');

describe('CrosswordApp Logic', () => {
    let app;

    beforeEach(() => {
        // Silence console.error during tests to avoid noise from expected errors
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });

        // Mock alert
        window.alert = jest.fn();

        // Create a fresh instance for each test
        // We override the created hook to prevent side effects (network calls) during test instantiation
        const AppOptions = { ...CrosswordApp, created: function () { } };
        const Constructor = Vue.extend(AppOptions);
        app = new Constructor();

        // Manually call init-like setup if needed for specific tests, 
        // or just set the data properties directly.
        // Since we skipped created(), we might need to set some defaults if tests rely on them.
        app.selectedWeekday = 'monday';

        // Mock DOM elements that might be referenced via $refs or querySelector
        app.$refs = {};
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('initial state is correct', () => {
        expect(app.direction).toBe('across');
        expect(app.score).toBe(100);
        expect(app.isOffline).toBe(false);
    });

    test('isValidPuzzle validates correct puzzle structure', () => {
        const validPuzzle = {
            metadata: { date: '231026', width: 5, height: 5 },
            entries: [
                {
                    clue_number: 1,
                    clue_text: 'Test Clue',
                    direction: 'across',
                    start_x: 0,
                    start_y: 0,
                    characters: [{ letters: 'A' }, { letters: 'B' }]
                }
            ]
        };
        expect(app.isValidPuzzle(validPuzzle)).toBe(true);
    });

    test('isValidPuzzle rejects invalid puzzle', () => {
        const invalidPuzzle = {
            metadata: {},
            entries: [] // Empty entries
        };
        expect(app.isValidPuzzle(invalidPuzzle)).toBe(false);
    });

    test('check_all correctly identifies correct words', () => {
        // Setup a simple crossword state
        app.crossword = [
            {
                clue_number: 1,
                clue_text: 'Test Clue',
                direction: 'across',
                start_x: 0,
                start_y: 0,
                characters: [{ letters: 'A' }, { letters: 'B' }]
            }
        ];

        // Mock the grid
        app.grid = [
            ['A', 'B'],
            [null, null]
        ];

        // Mock $refs for inputs
        app.$refs = {
            'input-0-0': [{ value: 'A', classList: { add: jest.fn(), remove: jest.fn() } }],
            'input-0-1': [{ value: 'B', classList: { add: jest.fn(), remove: jest.fn() } }]
        };

        app.check_all();

        expect(app.completedWords.has('Test Clue')).toBe(true);
        expect(app.$refs['input-0-0'][0].classList.add).toHaveBeenCalledWith('green');
    });

    test('check_all correctly identifies incorrect words', () => {
        // Setup a simple crossword state
        app.crossword = [
            {
                clue_number: 1,
                clue_text: 'Test Clue',
                direction: 'across',
                start_x: 0,
                start_y: 0,
                characters: [{ letters: 'A' }, { letters: 'B' }]
            }
        ];

        // Mock the grid with WRONG answers
        app.grid = [
            ['X', 'Y'],
            [null, null]
        ];

        // Mock $refs for inputs
        app.$refs = {
            'input-0-0': [{ value: 'X', classList: { add: jest.fn(), remove: jest.fn() } }],
            'input-0-1': [{ value: 'Y', classList: { add: jest.fn(), remove: jest.fn() } }]
        };

        const initialScore = app.score;
        app.check_all();

        expect(app.completedWords.has('Test Clue')).toBe(false);
        expect(app.$refs['input-0-0'][0].classList.add).toHaveBeenCalledWith('red');
        expect(app.score).toBeLessThan(initialScore);
    });

    test('formatTime formats seconds correctly', () => {
        expect(app.formatTime(65)).toBe('1:05');
        expect(app.formatTime(0)).toBe('0:00');
        expect(app.formatTime(600)).toBe('10:00');
    });
});
