# Introduction
This assembler is based on the MACRO8 syntax.

# Assemblers
## MACRO8
PAL-III: Doesn't support macros, literals or conditional assembly
MACRO8 supports macros, but doesn't support conditional assembly using IFDEF and the like.
PAL-D:
PAL-8: From PS/8. Based on PAL-D, but adds these ops as in PAL-III: FILENAME, DEVICE, IFNDEF, IFNZRO, FIXMRI

## Syntax
### Symbol
Can be either
* a parameter assignment, e.g. "A=EXPR"
* a macro
* a location, e.g. "TAG, ...".

There are different types
* permanent symbols: are OR-ed when separated by space, e.g. CLA CMA
* user symbols: are used as addresses, e.g. JMP BEG

### Element
Symbol or Integer

### Expressions
* ELEM + ELEM, Addition
* ELEM - ELEM, Subtraction
* ELEM ! ELEM, OR
* ELEM & ELEM, AND
* ELEM ELEM, e.g. CLA CMA -> OR or TAD A -> MRI

### Literals
* (x) defines literal on current page
* [x] defines literal on page zero

# Passes
## Pass 1
* figure out addresses of symbols
* generate links (for access to other pages)
* generate literals (current page table, zero table)

## Pass 2
* generate code

# Grammar
Statement: *Expr | Symbol=Expr | Symbol, | Symbol
