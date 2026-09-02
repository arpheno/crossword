/* Characterization of the current solver's public interaction methods.
 *
 * These tests use a tiny hand-authored entry set and stub the network-facing
 * lifecycle hook.  They intentionally exercise behavior without loading a
 * page, contacting a service, or depending on a provider payload.
 */

const Vue = require('vue');
const axios = require('axios');

global.io = jest.fn(() => ({
    on: jest.fn(),
    emit: jest.fn()
}));
global.Vue = Vue;
global.axios = axios;

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn()
    }))
});

const { CrosswordApp } = require('../../src/crossword/static/main.js');

const cell = letters => ({ letters });
const across = (number, clue = 'A synthetic clue') => ({
    clue_number: number,
    clue_text: clue,
    direction: 'across',
    start_x: 0,
    start_y: 0,
    characters: [cell('A'), cell('B')]
});
const down = (number, clue = 'A crossing clue') => ({
    clue_number: number,
    clue_text: clue,
    direction: 'down',
    start_x: 0,
    start_y: 0,
    characters: [cell('A'), cell('C')]
});

function freshApp() {
    const AppOptions = { ...CrosswordApp, created() { } };
    const Constructor = Vue.extend(AppOptions);
    const app = new Constructor();
    app.$nextTick = callback => callback();
    app.$refs = {};
    return app;
}

describe('synthetic solver interaction characterization', () => {
    let app;

    beforeEach(() => {
        app = freshApp();
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('clue and cell selection set direction and focus the linked cell', () => {
        const entry = across(1);
        const clueFocus = jest.fn();
        const cellFocus = jest.fn();
        app.$refs['input-0-0'] = [{ focus: clueFocus }];
        app.$refs['input-0-1'] = [{ focus: cellFocus }];

        app.handle_clue_click({}, entry);
        expect(app.direction).toBe('across');
        expect(app.activeClueNumber).toBe(1);
        expect(app.activeDirection).toBe('across');
        expect(clueFocus).toHaveBeenCalledTimes(1);

        const stopPropagation = jest.fn();
        app.handle_cell_click({ stopPropagation }, entry, 1);
        expect(stopPropagation).toHaveBeenCalledTimes(1);
        expect(cellFocus).toHaveBeenCalledTimes(1);
    });

    test('keyboard entry advances and an orthogonal arrow changes direction', () => {
        app.crossword = [across(1)];
        app.grid = [['', '']];
        const nextFocus = jest.fn();
        app.$refs['input-0-1'] = [{ focus: nextFocus }];

        const letterEvent = { key: 'a', preventDefault: jest.fn() };
        app.handle_crossword_cell_keydown(letterEvent, 0, 0);

        expect(app.grid[0][0]).toBe('A');
        expect(letterEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(nextFocus).toHaveBeenCalledTimes(1);

        const directionEvent = { key: 'ArrowDown', preventDefault: jest.fn() };
        app.handle_crossword_cell_keydown(directionEvent, 0, 0);
        expect(app.direction).toBe('down');
    });

    test('checking marks a complete entry and completes the puzzle', () => {
        const entry = across(1);
        app.crossword = [entry];
        app.grid = [['A', 'B']];
        const classList = () => ({ add: jest.fn(), remove: jest.fn() });
        const firstClasses = classList();
        const secondClasses = classList();
        app.$refs['input-0-0'] = [{ value: 'A', classList: firstClasses }];
        app.$refs['input-0-1'] = [{ value: 'B', classList: secondClasses }];
        app.stopTimer = jest.fn();
        app.celebrateCompletion = jest.fn();

        app.check_all();

        expect(app.completedWords.has(entry.clue_text)).toBe(true);
        expect(firstClasses.add).toHaveBeenCalledWith('green');
        expect(secondClasses.add).toHaveBeenCalledWith('green');
        expect(app.stopTimer).toHaveBeenCalledTimes(1);
        expect(app.celebrateCompletion).toHaveBeenCalledTimes(1);
    });

    test('reveal completes empty cells with the authoritative entry values', () => {
        const entry = across(1);
        app.crossword = [entry];
        app.grid = [['', '']];
        app.score = 100;
        app.revealsUsed = 0;
        app.$forceUpdate = jest.fn();
        app.stopTimer = jest.fn();
        global.confirm = jest.fn(() => true);

        app.revealAll();

        expect(app.grid).toEqual([['A', 'B']]);
        expect(app.revealsUsed).toBe(2);
        expect(app.score).toBe(50);
        expect(app.stopTimer).toHaveBeenCalledTimes(1);
    });

    test('clue lanes expose active and crossing entries as linked projections', () => {
        const acrossEntry = across(1, 'Same surface');
        const downEntry = down(1);
        app.crossword = [acrossEntry, downEntry];
        app.activeClueNumber = 1;
        app.activeDirection = 'across';

        expect(app.isActiveClue(acrossEntry)).toBe(true);
        expect(app.isClueAffected(downEntry)).toBe(true);
        expect(app.isClueAffected(acrossEntry)).toBe(false);
        expect(app.getIntersectingClues(1, 'across')).toEqual([downEntry]);
        expect(app.isCellInAffectedClue(downEntry, 0)).toBe(true);
    });
});
