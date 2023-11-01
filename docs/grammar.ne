@{%
      const keywords = new Set([
        "PAGE",     "FIELD",        "RELOC",
        "IFDEF",    "IFNDEF",       "IFNZRO",   "IFZERO",   "DEFINE",
        "TEXT",     "ZBLOCK",       "DUBL",     "FLTG",     "DEVICE",   "FILENAME",
        "EXPUNGE",  "FIXTAB",       "FIXMRI",
        "DECIMAL",  "OCTAL",
        "NOPUNCH",  "ENPUNCH",
        "EJECT",
    ]);
    const macros = new Set();
%}

S -> Program

Program         -> Statement:* (_ | EOL):* (EOF .:*):?

Statement       -> _:* (
                            Origin |
                            Invocation |
                            Label |
                            Assign |
                            PseudoStatement |
                            ExpressionStmt |
                            Separator |
                            Comment 
                        ) EndOfExpr

Origin          -> "*" Param
Label           -> Symbol ","
Assign          -> Symbol "=" _:* Expression
ExpressionStmt  -> Expression
Separator       -> ";"
Invocation      -> Symbol (_:* [^,\n/]:+ ("," _:* [^,\n/]:+):*):? _:* {% (d, l, reject) => !macros.has(d[0]) ? reject : d %}
Comment         -> ("/" [^\n]:*)

Param           -> BinaryOp | Element

Expression      -> (BinaryOp | SymbolGroup | ParenExpr | Element)
ParenExpr       -> ("(" | "[") _:* Expression (_:? ")" | "]"):?
SymbolGroup     -> Symbol (_ Param):*
BinaryOp        -> ElementAndOp:+ Element
ElementAndOp    -> Element ("+" | "-" | "!" | "&" | "^" | "%")
EndOfExpr       -> Separator | Comment | EOL

NeutralListElement -> Separator | Comment
MacroBody       -> "<" ([^<>]:+ MacroBody:?):* [^>]:* ">"

PseudoStatement -> OriginPseudo | SymbolTablePseudo | RadixPseudo | MacroPseudo | DataPseudo | OutputCtrlPseudo

OriginPseudo    -> Page | Field | Reloc
Page            -> "PAGE" (_:+ Param):?
Field           -> "FIELD" _:+ Param
Reloc           -> "RELOC" (_:+ Param):?
Float           -> [-+]:? (([0-9]:+ "." [0-9]:+) | ([0-9]:* "." [0-9]:+) | [0-9]:+) ([eE] [-+]:? [0-9]:+):?

SymbolTablePseudo -> FixMri | FixTab | Expunge
FixMri          -> "FIXMRI" _ Symbol "=" _:* Param
FixTab          -> "FIXTAB"
Expunge         -> "EXPUNGE"

RadixPseudo     -> Decimal | Octal
Decimal         -> "DECIMAL"
Octal           -> "OCTAL"

MacroPseudo     -> Define | IfDef | IfNDef | IfZero | IfNZro
Define          -> "DEFINE" _ Symbol (_ Symbol):* _:* MacroBody {% (d, l, reject) => {macros.add(d[2]); console.log(d[2], "<-"); return d[2];} %}
IfDef           -> "IFDEF" _ Symbol _:* MacroBody
IfNDef          -> "IFNDEF" _ Symbol _:* MacroBody
IfZero          -> "IFZERO" _ Param _:* MacroBody
IfNZro          -> "IFNZRO" _ Param _:* MacroBody

DataPseudo      -> ZBlock | Text | Dubl | Fltg | Device | FileName
ZBlock          -> "ZBLOCK" _ Param
Text            -> "TEXT" _ . [^\n]:* . {% (d, l, reject) => d[2] != d[4] ? reject : d[3] %}
Dubl            -> "DUBL" _ ([-+]:? Integer | NeutralListElement):*
Fltg            -> "FLTG" _ (Float | NeutralListElement):*
Device          -> "DEVICE" _ [^\n/]:+
FileName        -> "FILENAME" _ [^\n/]:+


OutputCtrlPseudo -> EnPunch | NoPunch | Eject
EnPunch         -> "ENPUNCH"
NoPunch         -> "NOPUNCH"
Eject           -> "EJECT" (_ [^\n]:*):?

Element         -> UnaryOp:? (Integer | Symbol | ASCII | CLC)
UnaryOp         -> [-+]
Integer         -> [0-9]:+
Symbol          -> ([A-Z] [A-Z0-9]:*) {% (d, l, reject) => keywords.has(d[0].flat().join("")) ? reject : d[0].flat().join("") %}
CLC             -> "."
ASCII           -> "\"" .

_               -> " " | "\t"
EOL             -> "\n" | "\r" | "\r\n"
EOF             -> "$"
