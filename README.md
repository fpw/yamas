# Introduction
This is Yamas – Yet Another Macro Assembler: A PAL-compatible assembler for PDP-8 computers. It also includes support
macros in the syntax of [MACRO-8 (PDF manual)]. It is a complete clean-room implementation of a PDP-8 using web technologies so that
the assembler can be integrated into web applications, apps on phones and the like. Of course it also comes with a
a traditional shell command (through Node.js).

# FAQs
## Assembler FAQ
### Why another assembler for the PDP-8?
While [palbart] and [macro8x] exist, it would be hard to adapt them for usage on the web. For example, creating a proper
syntax highlighter requires knowledge about the abstract syntax tree (AST) of the program, something that the existing
assemblers don't even have since they're traditional two-pass compilers that directly emit output symbols while still
parsing the input. Yamas is built more like a compiler than an assembler: it creates an AST using a parser and a lexer
that is then passed to the actual assembler with the possibility to access the artifactes created in between. This enables
tools like code editors to access the AST to query defined symbols, expanded macros and the like.

### Which pseudo symbols are supported?
Currently, the following pseudos are supported:

 Type | Pseudos
------|---------
Control of origin       |`PAGE`,     `FIELD`,        `RELOC`
Conditionals and macros |`IFDEF`,    `IFNDEF`,       `IFNZRO`,   `IFZERO`,   `DEFINE`
Data output             |`TEXT`,     `ZBLOCK`,       `DUBL`,     `FLTG`,     `DEVICE`,   `FILENAME`
Symbol table control    |`EXPUNGE`,  `FIXTAB`,       `FIXMRI`
Radix control           |`DECIMAL`,  `OCTAL`
Output control          |`NOPUNCH`,  `ENPUNCH`
No-ops                  |`EJECT`

### Is the generated code correct?
"Correct" is hard to define since there are many different dialects of the language that are treated
differently by different assemblers. But the output should match the output of PAL8. Any mismatch is considered
a bug. Yamas currently passes the [palbart testbench], including the "bad" directory where palbart fails.
It also uses extensive unit tests so that new features don't break things that once worked.

### But in my own tests, the generated bin files differ?
What matters is the machine state after reading the bin files. It's okay if things have a different order on the tape.
For example, the literal table is output at a different time. Palbart does the same and the bin tapes don't match PAL8.
That's why comparisons of bin files should be done with a special type like [cmp_tape]. Yamas also includes the `-c` option to compare its output with a given bin file, noting the differences in the resulting state.

## Language FAQ
### Why do both FIXMRI and FIXTAB exist when FIXTAB auto-detect MRIs?
Because some external hardware might use the data break to read memory and expect custom operations that act like MRIs.
A prominent example is the external floating point unit: It introduces custom opcodes that it executes as a co-processor.
Some of these custom opcodes need an MRI-like operand even though the opcode starts with 6 or 7. For example, the Focal code
defines ``FIXMRI FPT=6000`` which wouldn't work with the auto-detection of `FIXTAB`.

### How are comments inside macros and conditional statements handled?
They are parsed as comments, but if they contain a '>', it will still end the current macro body.
Interestingly, the rest of the line after the closing '>' is still handled as a comment, i.e. not parsed.
Example: ``IFDEFA <I/O ERROR>`` is legal: it either assembles as `I` (value 0400) or not at all, depending on `A`.
This matches the behavior of PAL8.

## Implementation FAQ
### Why no parser generator?
This project was also a personal project for me to strengthen skills that I hardly need for my day job,
such as writing lexers and parers.

### Why is the grammar not using logical lines consisting of a label, a statement and a comment?
Some statements can span multiple lines, for example macro and condition bodies. Also, a line can multiple statements separated with semicolons.
For that reason, it was decided to not use logical lines.

### Why can expressions be null? Also, why not undefined?
Expressions can be null in pass 1, for example when a symbol is used that is only defined later. This is okay unless the expression changes the CLC.
For that reason, the assembler differentiates between defined and undefined expressions. Using an undefined expression in an `IFZERO` is not okay
because the resulting CLC can't be calculated - but using it in something like ``A=JMS X`` is completely fine.

It's still possible to cause havoc (as in palbart and macro8x) by using undefined symbols in `IFDEF`/ `IFNDEF` when they are defined later.
But this is usually noticed when labels after the conditional are assembled since the addresses will not match between pass 1 and 2.

`null` is used instead of `define` so that the linter will spot a missing `case`
in the eval functions after adding a new node type. It would probably be better to
use a `Maybe` type so that exrepssions like `if (!val)` are also caught.

### Why does the origin operator always lead to origin symbols in the binary tape? Couldn't this be optimized to only write them when necessary?
Some programs deliberately use the origin operator to generate RIM loader sections in the punched tape, e.g. TSS/8.

### Why does the assembler emit callbacks instead of simply returning the target memory state and creating the bin tape from there?
See above: The origin statements must be preserved as they appeared in the code.

[palbart]: http://www.pdp8online.com/ftp/software/palbart/
[macro8x]: http://simh.trailing-edge.com/sources/simtools/crossassemblers/
[palbart testbench]: http://www.pdp8online.com/ftp/software/palbart/testbench/
[cmp_tape]: http://www.pdp8online.com/ftp/software/cmp_tape/
[MACRO-8 (PDF manual)]: http://www.bitsavers.org/pdf/dec/pdp8/software/DEC-08-CMAB-D_MACRO8.pdf
