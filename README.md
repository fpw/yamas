# Introduction
This assembler is based on the MACRO8 syntax.

# Syntax
## Symbol
Can be either
* a parameter assignment, e.g. "A=EXPR"
* a macro
* a location, e.g. "TAG, ...".

There are different types
* permanent symbols: are OR-ed when separated by space, e.g. CLA CMA
* user symbols: are used as addresses, e.g. JMP BEG

## Element
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

# Code FAQ
## Why is the parser not using logical lines consisting of label, a statement and comments?
Some statements can span multiple lines, for example macro and condition bodies. Also, a line can multiple statements separated with semicolons.
For that reason, it was decided to not use logical lines.

## Why can expressions be null? And why not undefined?
Expressions can be null in pass 1, for example when a symbol is used that is only defined later. This is okay unless the expression changes the CLC.
For that reason, the assembler differentiates between defined and undefined expressions. Using an undefined expression in an `IFZERO` is not okay
because the resulting CLC can't be calculated - but using it in something like ``A=JMS X`` is completely fine.

`null` is used instead of `define` so that the linter will spot a missing `case`
in the eval functions after adding a new node type. It would probably be better to
use a `Maybe` type so that exrepssions like `if (!val)` are also caught.

## Why does the origin operator always lead to origin symbols in the binary tape? Couldn't this be optimized to only write them when necessary?
Some programs deliberately use the origin operator to generate RIM loader dumps, e.g. TSS/8.

## Why does the assembler emit callbacks instead of simply returning the target memory state and creating the bin tape from there?
See above: The origin statements must be preserved as they appeared in the code.
