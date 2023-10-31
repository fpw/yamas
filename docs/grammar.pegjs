{{ const keywords = new Set([
        "PAGE",     "FIELD",        "RELOC",
        "IFDEF",    "IFNDEF",       "IFNZRO",   "IFZERO",   "DEFINE",
        "TEXT",     "ZBLOCK",       "DUBL",     "FLTG",     "DEVICE",   "FILENAME",
        "EXPUNGE",  "FIXTAB",       "FIXMRI",
        "DECIMAL",  "OCTAL",
        "NOPUNCH",  "ENPUNCH",
        "EJECT",
]); }}

Program             = Statement* _* (EOF .*)?

Statement           = _* (
                            Origin /
                            Invocation /
                            Label /
                            Assign /
                            PseudoStatement /
                            ExpressionStmt /
                            Separator /
                            Comment /
                            EOL
                        ) _* EndOfExpr?

Origin              = "*" Expression
Label               = Symbol ","
Assign              = Symbol "=" _* Expression
ExpressionStmt      = Expression
Separator           = ";" / EOL
Invocation          = Symbol (_* Symbol _* ("," _* Symbol)*)? _* & EndOfExpr
Comment             = $("/" [^\n]* & (EOL / EOF))

PseudoStatement     = OriginPseudo /
                      SymbolTablePseudo /
                      MacroPseudo /
                      DataPseudo /
                      RadixPseudo /
                      OutputCtrlPseudo

OriginPseudo        = "PAGE" (_* Param)? /
                      "FIELD" _* Param /
                      "RELOC" (_* Param)?
SymbolTablePseudo   = "FIXMRI" _ Symbol "=" Param /
                      "FIXTAB" /
                      "EXPUNGE"
RadixPseudo         = "DECIMAL" / "OCTAL"
MacroPseudo         = "DEFINE" _ Symbol (_ Symbol)* _* MacroBody /
                      "IFDEF" _ Symbol _* MacroBody /
                      "IFNDEF" _ Symbol _* MacroBody /
                      "IFZERO" _ Param _* MacroBody /
                      "IFNZRO" _ Param _* MacroBody
DataPseudo          = "ZBLOCK" _ Param /
                      "TEXT" _ [^\n]* & EndOfExpr /
                      "DUBL" _ (("+" / "-")? Integer / NeutralListElement)* /
                      "FLTG" _ (Float / NeutralListElement)* /
                      "DEVICE" _ [.]* /
                      "FILENAME" _ [.]*
OutputCtrlPseudo    = "ENPUNCH" /
                      "NOPUNCH" /
                      "EJECT" (_ [^\n]*)?
Param               = BinaryOp / Element

Expression          = (BinaryOp / SymbolGroup / ParenExpr / Element)
ParenExpr           = ("(" / "[") _* Expression (_? ")" / "]")?
SymbolGroup         = Symbol (_ Expression)*
BinaryOp            = ElementAndOp+ Element
ElementAndOp        = Element ("+" / "-" / "!" / "&" / "^" / "%")
EndOfExpr           = Separator / Comment / EOF / MacroBody

NeutralListElement  = Separator / Comment
MacroBody           = ("<" [^>]* ">")
Float               = [-+]? ([0-9]+ "." [0-9]* / [0-9]* "." [0-9]+ / [0-9]+) ([eE][-+]? [0-9]+)?

Element             = UnaryOp / Integer / Symbol / ASCII / CLC
UnaryOp             = [+-] Element
Integer             = [0-9]+
Symbol              = sym:$([A-Z][A-Z0-9]*) &{return !keywords.has(sym)} {return `Symbol(${sym})`; }
CLC                 = "."
ASCII               = "\"".

_                   = $(" " / "\t" / "\f")
EOL                 = "\r" / "\n"
EOF                 = "$"
