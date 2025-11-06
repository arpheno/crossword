"""
Parser for NYT crossword API format.

Converts the raw API text format into our clean Crossword model.
Handles all the special formatting characters (%, ^, ,) during parsing
so the rest of the application never needs to deal with them.
"""
from typing import List, Tuple
from .models import Crossword, CrosswordMetadata, Entry, Character


class NYTFormatParser:
    """
    Parses NYT crossword format into clean domain models.
    
    The NYT format uses special characters:
    - % = next letter is circled
    - ^ = next letter is shaded  
    - , = separates letters in a rebus square
    - # = black square
    - . = end of line marker (also a black square)
    """
    
    @staticmethod
    def parse(api_text: str) -> Crossword:
        """
        Parse complete API response into a Crossword object.
        
        Args:
            api_text: Raw text from NYT API
            
        Returns:
            Parsed Crossword with clean models
        """
        lines = api_text.strip().split('\n\n')
        
        # Extract metadata
        date = lines[1].strip()
        title = lines[2].strip()
        authors = [author.strip() for author in lines[3].split('/')]
        width = int(lines[4].strip())
        height = int(lines[5].strip())
        
        # Extract grid
        grid_lines = lines[8].split('\n')
        
        # Adjust dimensions based on actual grid content
        # The grid is always reported as square, but may have trailing black squares
        actual_width, actual_height = NYTFormatParser._calculate_actual_dimensions(
            grid_lines, width, height
        )
        
        metadata = CrosswordMetadata(
            date=date,
            title=title,
            authors=authors,
            width=actual_width,
            height=actual_height
        )
        
        # Get clues - they come after the grid
        # Split by double newline and find the two clue sections after the grid
        clue_text = api_text.split('org.apache')[0]
        clue_parts = clue_text.split('\n\n')
        
        # Find clue sections (after line 8 which is the grid)
        # The sections after the grid are the across and down clues
        across_section_idx = 9  # First section after grid
        down_section_idx = 10   # Second section after grid
        
        across_clues = [hint.strip() for hint in lines[across_section_idx].split('\n') if hint.strip()]
        down_clues = [hint.strip() for hint in lines[down_section_idx].split('\n') if hint.strip()]
        
        # Parse entries using the ORIGINAL dimensions (before adjustment)
        # The trailing black squares are just visual padding and don't affect entry positions
        entries = NYTFormatParser._parse_entries(grid_lines, across_clues, down_clues, width, height)
        
        return Crossword(metadata=metadata, entries=entries)
    
    @staticmethod
    def _normalize_grid_line(line: str) -> str:
        """
        Normalize a grid line by removing formatting markers and collapsing rebus sequences.
        
        E.g., "JOHNDEEREG,R,E,E,N" becomes "JOHNDEEREG" where G represents the rebus cell containing "GREEN".
        E.g., "W,H,I,T,EWEDDING" becomes "WWEDDING" where first W represents the rebus cell containing "WHITE".
        
        The comma-separated letters are part of a single grid position (rebus cell).
        This ensures one character per grid position.
        """
        result = []
        i = 0
        while i < len(line):
            char = line[i]
            
            if char in ['%', '^']:
                # Skip formatting markers
                i += 1
            elif char in ['#', '.']:
                # Black squares pass through
                result.append(char)
                i += 1
            else:
                # Regular letter - check if it starts or continues a rebus sequence
                result.append(char)
                i += 1
                
                # Look ahead for comma (indicates this letter starts/continues a rebus)
                if i < len(line) and line[i] == ',':
                    # This is a rebus! Skip all comma-separated continuation letters
                    # They're all part of the same grid cell we just added
                    while i < len(line):
                        if line[i] == ',':
                            i += 1  # Skip comma
                            # Skip any formatting markers
                            while i < len(line) and line[i] in ['%', '^']:
                                i += 1
                            # Skip the continuation letter (it's part of the rebus cell)
                            if i < len(line) and line[i] not in ['#', '.']:
                                i += 1
                            else:
                                break  # Hit a black square or end of line
                        else:
                            break  # No more commas, done with this rebus
        
        return ''.join(result)
    
    @staticmethod
    def _calculate_actual_dimensions(grid_lines: List[str], reported_width: int, reported_height: int) -> Tuple[int, int]:
        """
        Calculate actual grid dimensions by detecting trailing rows/columns of black squares.
        
        The API always reports square dimensions, but grids may be rectangular with
        trailing black squares. This detects and removes them from the dimensions.
        
        Args:
            grid_lines: Raw grid lines from API
            reported_width: Width from API
            reported_height: Height from API
            
        Returns:
            Tuple of (actual_width, actual_height)
        """
        # Normalize grid for checking (remove formatting markers and collapse rebus sequences)
        normalized_grid = []
        for line in grid_lines:
            if line.strip():  # Skip empty lines
                normalized = NYTFormatParser._normalize_grid_line(line)
                normalized_grid.append(normalized)
        
        actual_width = reported_width
        actual_height = reported_height
        
        # Check if the last row is all black squares (dots)
        if normalized_grid and actual_height > 0:
            last_row = normalized_grid[actual_height - 1] if actual_height <= len(normalized_grid) else ""
            # Check if last row is all dots (end-of-line markers which are black squares)
            if last_row and all(c == '.' for c in last_row):
                actual_height -= 1
                print(f"Detected trailing row of black squares, adjusting height: {reported_height} -> {actual_height}")
        
        # Check if the last column is all black squares
        # Need to check the last character of each row (before the dot)
        if normalized_grid and actual_width > 0:
            # The last actual column is at index (actual_width - 1)
            # But rows end with '.', so the last letter column is at (actual_width - 2)
            last_col_idx = actual_width - 1
            
            # Check if this column in all rows is '#' or we're at the dot
            all_black = True
            for y in range(min(actual_height, len(normalized_grid))):
                row = normalized_grid[y]
                if last_col_idx < len(row):
                    char = row[last_col_idx]
                    # If it's not a black square and not a dot, this column has content
                    if char not in ['#', '.']:
                        all_black = False
                        break
            
            if all_black:
                actual_width -= 1
                print(f"Detected trailing column of black squares, adjusting width: {reported_width} -> {actual_width}")
        
        return actual_width, actual_height
    
    @staticmethod
    def _parse_entries(grid_lines: List[str], across_clues: List[str], down_clues: List[str], 
                       width: int, height: int) -> List[Entry]:
        """
        Parse all entries from the grid and clues.
        
        This finds where each word starts, extracts it with formatting,
        and creates Entry objects.
        """
        # First, normalize the grid for position finding (remove formatting chars but keep structure)
        # We need to collapse rebus sequences (X,Y,Z) into single positions for grid navigation
        normalized_grid = []
        raw_grid = []
        for line in grid_lines:
            raw_grid.append(line)
            # Remove circled/shaded markers but handle rebus sequences specially
            normalized = NYTFormatParser._normalize_grid_line(line)
            normalized_grid.append(normalized)
        
        # Find starting positions for all entries
        starting_positions = NYTFormatParser._find_starting_positions(normalized_grid, width, height)
        
        # Create entries
        entries = []
        
        # Across entries
        across_starts = NYTFormatParser._find_across_starts(starting_positions, normalized_grid)
        for (clue_num, (x, y)), clue_text in zip(across_starts, across_clues):
            characters = NYTFormatParser._extract_across_word(raw_grid, normalized_grid, x, y)
            if characters:
                entry = Entry(
                    clue_number=clue_num,
                    clue_text=clue_text,
                    direction="across",
                    start_x=x,
                    start_y=y,
                    characters=characters
                )
                entries.append(entry)
        
        # Down entries
        down_starts = NYTFormatParser._find_down_starts(starting_positions, normalized_grid)
        for (clue_num, (x, y)), clue_text in zip(down_starts, down_clues):
            characters = NYTFormatParser._extract_down_word(raw_grid, normalized_grid, x, y)
            if characters:
                entry = Entry(
                    clue_number=clue_num,
                    clue_text=clue_text,
                    direction="down",
                    start_x=x,
                    start_y=y,
                    characters=characters
                )
                entries.append(entry)
        
        return entries
    
    @staticmethod
    def _find_starting_positions(grid: List[str], width: int, height: int) -> List[Tuple[int, int]]:
        """
        Find all positions where clues start and assign them sequential numbers.
        
        A position gets a clue number if:
        - It's not a black square
        - It starts an across word (2+ letters) OR a down word (2+ letters)
        
        Numbering goes left-to-right, top-to-bottom.
        """
        positions = []
        
        for y in range(height):
            for x in range(width):
                # Skip if this position is out of bounds or black
                if y >= len(grid) or x >= len(grid[y]) or grid[y][x] in ['#', '.']:
                    continue
                
                # Check if this starts an across word (at least 2 letters)
                is_across_start = False
                if x == 0 or (x > 0 and grid[y][x-1] in ['#', '.']):
                    # This is after the edge or a black square
                    # Check if there's at least one more letter to the right
                    if x + 1 < len(grid[y]) and grid[y][x + 1] not in ['#', '.']:
                        is_across_start = True
                
                # Check if this starts a down word (at least 2 letters)
                is_down_start = False
                if y == 0 or (y > 0 and x < len(grid[y-1]) and grid[y-1][x] in ['#', '.']):
                    # This is after the edge or a black square
                    # Check if there's at least one more letter below
                    if y + 1 < len(grid) and x < len(grid[y + 1]) and grid[y + 1][x] not in ['#', '.']:
                        is_down_start = True
                
                if is_across_start or is_down_start:
                    positions.append((x, y))
        
        return sorted(positions, key=lambda p: (p[1], p[0]))  # Sort by y, then x
    
    @staticmethod
    def _find_across_starts(positions: List[Tuple[int, int]], grid: List[str]) -> List[Tuple[int, Tuple[int, int]]]:
        """
        Filter to just across starting positions with their clue numbers.
        
        The clue numbers are determined by the position's index + 1 in the 
        sorted list of ALL starting positions.
        """
        numbered = []
        
        for idx, (x, y) in enumerate(positions, start=1):
            # Check if this position starts an across word
            is_across_start = (x == 0 or grid[y][x-1] in ['#', '.'])
            if is_across_start:
                # Verify there's at least one more letter (already checked in _find_starting_positions)
                if x + 1 < len(grid[y]) and grid[y][x + 1] not in ['#', '.']:
                    numbered.append((idx, (x, y)))
        
        return numbered
    
    @staticmethod
    def _find_down_starts(positions: List[Tuple[int, int]], grid: List[str]) -> List[Tuple[int, Tuple[int, int]]]:
        """
        Filter to just down starting positions with their clue numbers.
        
        The clue numbers are determined by the position's index + 1 in the 
        sorted list of ALL starting positions.
        """
        numbered = []
        
        for idx, (x, y) in enumerate(positions, start=1):
            # Check if this position starts a down word
            is_down_start = (y == 0 or (y > 0 and x < len(grid[y-1]) and grid[y-1][x] in ['#', '.']))
            if is_down_start:
                # Verify there's at least one more letter (already checked in _find_starting_positions)
                if y + 1 < len(grid) and x < len(grid[y + 1]) and grid[y + 1][x] not in ['#', '.']:
                    numbered.append((idx, (x, y)))
        
        return numbered
    
    @staticmethod
    def _extract_across_word(raw_grid: List[str], normalized_grid: List[str], start_x: int, start_y: int) -> List[Character]:
        """
        Extract an across word starting at the given position.
        
        Reads from normalized grid for positioning, but extracts formatting from raw grid.
        """
        characters = []
        x = start_x
        
        # Read letters from normalized grid
        while x < len(normalized_grid[start_y]) and normalized_grid[start_y][x] not in ['#', '.']:
            # Get the letter from normalized position
            letter = normalized_grid[start_y][x]
            
            # Now find this letter in the raw grid with its formatting
            char = NYTFormatParser._extract_character_at_position(raw_grid, normalized_grid, x, start_y)
            characters.append(char)
            
            x += 1
        
        return characters
    
    @staticmethod
    def _extract_down_word(raw_grid: List[str], normalized_grid: List[str], start_x: int, start_y: int) -> List[Character]:
        """
        Extract a down word starting at the given position.
        
        Reads from normalized grid for positioning, but extracts formatting from raw grid.
        """
        characters = []
        y = start_y
        
        # Read letters from normalized grid
        while y < len(normalized_grid) and start_x < len(normalized_grid[y]) and normalized_grid[y][start_x] not in ['#', '.']:
            # Get the letter from normalized position
            letter = normalized_grid[y][start_x]
            
            # Now find this letter in the raw grid with its formatting
            char = NYTFormatParser._extract_character_at_position(raw_grid, normalized_grid, start_x, y)
            characters.append(char)
            
            y += 1
        
        return characters
    
    @staticmethod
    def _extract_character_at_position(raw_grid: List[str], normalized_grid: List[str], x: int, y: int) -> Character:
        """
        Extract a Character at a specific grid position, with formatting from raw grid.
        
        The normalized grid tells us which letter is at position (x, y).
        The raw grid tells us what formatting markers precede that letter.
        """
        # Get the letter from normalized grid
        letter = normalized_grid[y][x]
        
        # Find this letter in the raw grid row
        raw_row = raw_grid[y]
        normalized_row = normalized_grid[y]
        
        # Count how many actual letters come before position x in normalized grid
        letters_before = sum(1 for i in range(x) if normalized_row[i] not in ['#', '.', '%', '^'])
        
        # Now find the corresponding position in raw grid (accounting for formatting markers and rebus sequences)
        raw_pos = 0
        letter_count = 0
        formatting_markers = []
        
        while raw_pos < len(raw_row):
            char = raw_row[raw_pos]
            
            if char in ['%', '^']:
                # Collect formatting marker for the NEXT letter
                if letter_count == letters_before:
                    # This marker applies to our target letter
                    formatting_markers.append(char)
                raw_pos += 1
            elif char not in ['#', '.']:
                # This is a letter (possibly start of a rebus)
                if letter_count == letters_before:
                    # Found our target letter!
                    # Check if THIS letter starts a rebus (has commas after it)
                    rebus_letters = [char]
                    raw_pos += 1
                    
                    # Look ahead for comma-separated continuation
                    while raw_pos < len(raw_row) and raw_row[raw_pos] == ',':
                        raw_pos += 1  # Skip comma
                        # Skip any formatting markers
                        while raw_pos < len(raw_row) and raw_row[raw_pos] in ['%', '^']:
                            raw_pos += 1
                        # Get the next letter in the rebus sequence
                        if raw_pos < len(raw_row) and raw_row[raw_pos] not in ['#', '.', ',']:
                            rebus_letters.append(raw_row[raw_pos])
                            raw_pos += 1
                        else:
                            break
                    
                    # Create Character with formatting
                    return Character(
                        letters=''.join(rebus_letters),
                        is_circled='%' in formatting_markers,
                        is_shaded='^' in formatting_markers
                    )
                
                # Not our target letter - skip it (and any rebus continuation)
                letter_count += 1
                raw_pos += 1
                
                # Skip any comma-separated continuation letters (they're part of the same grid cell)
                while raw_pos < len(raw_row) and raw_row[raw_pos] == ',':
                    raw_pos += 1  # Skip comma
                    # Skip formatting markers
                    while raw_pos < len(raw_row) and raw_row[raw_pos] in ['%', '^']:
                        raw_pos += 1
                    # Skip the continuation letter
                    if raw_pos < len(raw_row) and raw_row[raw_pos] not in ['#', '.']:
                        raw_pos += 1
                    else:
                        break
            else:
                # Black square or dot
                raw_pos += 1
        
        # Fallback: just return the letter without formatting
        return Character(letters=letter)
