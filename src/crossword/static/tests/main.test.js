import { describe, it, expect, beforeEach, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { CrosswordApp } from '../main.js'; // Import the actual app configuration
import axios from 'axios'; // Import the actual axios to get a handle on its mocked version

// Mock localStorage for testing environment
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => {
            store[key] = value.toString();
        },
        clear: () => {
            store = {};
        },
        removeItem: (key) => {
            delete store[key];
        }
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true // Default to online
});

// Mock window.location.origin
Object.defineProperty(window, 'location', {
    value: {
        origin: 'http://localhost:8000'
    },
    writable: true
});

// This will be our controllable mock function instance
let mockAxiosGet;

// Hoisted mock: Vitest replaces the actual 'axios' with this structure.
vi.mock('axios', () => ({
    default: {
        // Provide a placeholder function initially.
        // We'll replace this with our vi.fn() instance in beforeEach.
        get: vi.fn(() => Promise.resolve({ data: {} })) 
    }
}));

// Mock window.alert
window.alert = vi.fn();

describe('CrosswordApp', () => {
    let wrapper;

    beforeEach(() => {
        localStorageMock.clear();
        window.alert.mockClear(); // Clear alert mock
        
        // Create a new vi.fn() for each test to ensure isolation
        mockAxiosGet = vi.fn();
        // Now, assign this new mock function to the 'get' method of the mocked axios module
        axios.get = mockAxiosGet;

        // Default mock implementation for axios.get for calls during component creation
        mockAxiosGet.mockResolvedValue({ 
            data: { 
                metadata: { date: 'defaultTestDate', title: 'Default Test Puzzle', authors: ['Default Tester'] }, 
                entries: [{ clue: '1. Default Clue', answer: 'DEFAULT', direction: 'across', x:0, y:0, index:1 }] 
            }
        });

        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        
        // Use the imported CrosswordApp
        // Add a minimal template to avoid the warning
        const appConfigWithTemplate = {
            ...CrosswordApp,
            template: '<div></div>' // Minimal template
        };

        wrapper = shallowMount(appConfigWithTemplate, { // Use the modified config
            global: {
                // Do not mock $refs directly like this for Vue 3 with @vue/test-utils v2
                // mocks: {
                //     $refs: {},
                // }
                // If you need to stub $nextTick and it's not globally available:
                stubs: {
                    // If you had custom components to stub, they would go here
                },
                mocks: {
                     $nextTick: (callback) => Promise.resolve().then(callback), // More robust $nextTick mock
                }
            }
        });
    });

    it('should initialize with default data', async () => {
        // The created() hook will run, potentially calling loadCrossword.
        // We need to wait for any async operations in created() to settle.
        await wrapper.vm.$nextTick(); // Ensure created hook async ops complete
        expect(wrapper.vm.direction).toBe('across');
        // isOffline is set in created based on navigator.onLine, which we mock
        expect(wrapper.vm.isOffline).toBe(false);
        expect(wrapper.vm.cachedCrosswordsCount.monday).toBe(1);
        // Verify that created() tried to load a crossword, even if it's mocked data
        expect(mockAxiosGet).toHaveBeenCalled(); 
    });

    it('updateCachedCounts should read from localStorage', () => {
        localStorageMock.setItem('crosswords_monday', JSON.stringify([{id: 'puzzle1'}]));
        wrapper.vm.updateCachedCounts();
        expect(wrapper.vm.cachedCrosswordsCount.monday).toBe(1);
    });
    
    it('loadCrossword should populate crossword data', async () => {
        // Specific mock for this test case
        const specificMetadata = { date: 'test_monday_specific', title: 'Specific Monday Puzzle', authors: ['Specific Tester'] };
        const specificEntries = [{ clue: '1. Specific', answer: 'SPECIFIC', direction: 'across', x:0, y:0, index:1 }];
        
        // Configure our vi.fn() instance for this specific test case
        mockAxiosGet.mockResolvedValueOnce({ 
            data: { 
                metadata: specificMetadata, 
                entries: specificEntries 
            }
        });

        await wrapper.vm.loadCrossword('monday'); // Call the method under test

        expect(wrapper.vm.currentPuzzleMetadata).toEqual(specificMetadata);
        expect(wrapper.vm.crossword).toEqual(specificEntries);
        expect(mockAxiosGet).toHaveBeenCalledWith(`${wrapper.vm.baseUrl}/random_crossword/monday`);
    });

    describe('markPuzzleSolved', () => {
        const testDay = 'monday';
        const testPuzzleId = '231026'; // Example puzzle ID (date)
        const testMetadata = {
            date: testPuzzleId,
            title: 'Test Puzzle Title',
            authors: ['Test Author1', 'Test Author2']
        };

        beforeEach(() => {
            // Ensure localStorage is clean for solved puzzles for the test day
            localStorageMock.removeItem(`solved_${testDay}`);
            // Set current puzzle metadata on the VM instance
            wrapper.vm.currentPuzzleMetadata = { ...testMetadata };
            // Spy on updateSolvedCounts
            vi.spyOn(wrapper.vm, 'updateSolvedCounts');
        });

        afterEach(() => {
            vi.restoreAllMocks(); // Clean up spies after each test in this describe block
        });

        it('should add puzzle to localStorage and call updateSolvedCounts', () => {
            wrapper.vm.markPuzzleSolved(testDay, testPuzzleId);

            const solvedPuzzles = JSON.parse(localStorageMock.getItem(`solved_${testDay}`) || '[]');
            expect(solvedPuzzles.length).toBe(1);
            expect(solvedPuzzles[0].id).toBe(testPuzzleId);
            expect(solvedPuzzles[0].title).toBe(testMetadata.title);
            expect(solvedPuzzles[0].authors).toEqual(testMetadata.authors);
            expect(solvedPuzzles[0].dayOfWeekSolved).toBe(testDay);
            expect(solvedPuzzles[0].dateSolved).toBeDefined();
            expect(wrapper.vm.updateSolvedCounts).toHaveBeenCalled();
        });

        it('should not add a duplicate puzzle if already solved', () => {
            // Mark it solved once
            wrapper.vm.markPuzzleSolved(testDay, testPuzzleId);
            wrapper.vm.updateSolvedCounts.mockClear(); // Clear previous call

            // Attempt to mark it solved again
            wrapper.vm.markPuzzleSolved(testDay, testPuzzleId);

            const solvedPuzzles = JSON.parse(localStorageMock.getItem(`solved_${testDay}`) || '[]');
            expect(solvedPuzzles.length).toBe(1); // Should still be 1
            // If it's a duplicate, updateSolvedCounts should NOT be called again.
            expect(wrapper.vm.updateSolvedCounts).not.toHaveBeenCalled(); 
        });

        it('should not mark solved if currentPuzzleMetadata is null', () => {
            wrapper.vm.currentPuzzleMetadata = null;
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console.error
            
            wrapper.vm.markPuzzleSolved(testDay, testPuzzleId);

            const solvedPuzzles = JSON.parse(localStorageMock.getItem(`solved_${testDay}`) || '[]');
            expect(solvedPuzzles.length).toBe(0);
            expect(wrapper.vm.updateSolvedCounts).not.toHaveBeenCalled();
            expect(consoleErrorSpy).toHaveBeenCalled();
            
            consoleErrorSpy.mockRestore();
        });

        it('should not mark solved if puzzleId does not match currentPuzzleMetadata.date', () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console.error
            wrapper.vm.markPuzzleSolved(testDay, 'anotherPuzzleId');

            const solvedPuzzles = JSON.parse(localStorageMock.getItem(`solved_${testDay}`) || '[]');
            expect(solvedPuzzles.length).toBe(0);
            expect(wrapper.vm.updateSolvedCounts).not.toHaveBeenCalled();
            expect(consoleErrorSpy).toHaveBeenCalled();
            
            consoleErrorSpy.mockRestore();
        });
    });

    // Add more tests here, e.g., for interactions, method calls, etc.
}); 