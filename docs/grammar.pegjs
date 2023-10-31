Program = Statement*

Statement = Blank* (Origin / Label / Assign / PseudoStatement / ExpressionStmt / Separator / Comment / Invocation)
Origin = "*" Expression
Label = Symbol ","
Assign = Symbol "=" Expression
ExpressionStmt = Expression
Separator = ";" / EOL
Invocation = Symbol (Symbol ("," Symbol)*)?
Comment = $("/" [^\n]* (EOL / EOF))

Expression = (SymbolGroup / ParenExpr / BinaryOp / Element)
ParenExpr = ("(" / "[") Blank* Expression
SymbolGroup = Symbol (Blank Expression)*
BinaryOp =  Element ("+" / "-" / "!" / "&" / "^" / "%") BinaryOp / Element

PseudoStatement     = OriginPseudo / SymbolTablePseudo / MacroPseudo / DataPseudo / RadixPseudo / OutputCtrlPseudo
OriginPseudo        = "PAGE" Expression? /
                        "FIELD" Expression /
                        "RELOC" Expression?
SymbolTablePseudo   = "FIXMRI" Symbol "=" Expression /
                        "FIXTAB" /
                        "EXPUNGE"
RadixPseudo         = "DECIMAL" / "OCTAL"
MacroPseudo         = "DEFINE" Symbol (Blank Symbol)* Blank* MacroBody /
                        "IFDEF" Symbol MacroBody /
                        "IFNDEF" Symbol MacroBody /
                        "IFZERO" Expression MacroBody /
                        "IFNZRO" Expression MacroBody
DataPseudo          = "ZBLOCK" Expression /
                        "TEXT" [.][*]*[.] /
                        "DUBL" (("+" / "-")? Integer / NeutralListElement)* /
                        "FLTG" (Float / NeutralListElement)* /
                        "DEVICE" [.]* /
                        "FILENAME" [.]*
OutputCtrlPseudo    = "EJECT" / "ENPUNCH" / "NOPUNCH"

NeutralListElement  = Separator / Comment
MacroBody = Blank* ("<" [^>]* ">")
Float = [-+]? ([0-9]+ "." [0-9]* / [0-9]* "." [0-9]+ / [0-9]+) ([eE][-+]? [0-9]+)?

Element = Blank* (UnaryOp / Integer / Symbol / ASCII / CLC)
UnaryOp = [+-] Element
Integer = [0-9]+ { return `Integer(${text()})`; }
Symbol = sym:([A-Z][A-Z0-9]*) { return `Symbol(${text()})`; }
CLC = "."
ASCII= "\"".

Blank = " " / "\t" / "\f"
EOL = "\r" / "\n"
EOF = "$"
