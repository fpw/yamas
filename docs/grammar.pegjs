{{
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
}}

Program                 = Statement* _* (EOF .*)?

Statement "Statement"   = _* (
                            Origin /
                            Invocation /
                            Label /
                            Assign /
                            PseudoStatement /
                            ExpressionStmt /
                            Separator /
                            Comment /
                            EOL
                        ) EndOfExpr?

Origin                  = "*" Expression
Label                   = Symbol ","
Assign                  = Symbol "=" _* Expression
ExpressionStmt          = Expression
Separator               = ";"
Invocation              = sym:Symbol &{return macros.has(sym);} (_* [^,\n/]+ ("," _* [^,\n/]+)*)? _* 
Comment                 = $("/" [^\n]*) EOL?

PseudoStatement         = OriginPseudo /
                          SymbolTablePseudo /
                          RadixPseudo /
                          MacroPseudo /
                          DataPseudo /
                          OutputCtrlPseudo

OriginPseudo            = Page / Field / Reloc
Page                    = "PAGE" (_+ Param)?
Field                   = "FIELD" _+ Param
Reloc                   = "RELOC" (_+ Param)?

SymbolTablePseudo       = FixMri / FixTab / Expunge
FixMri                  = "FIXMRI" _ Symbol "=" _* Param
FixTab                  = "FIXTAB"
Expunge                 = "EXPUNGE"

RadixPseudo             = Decimal / Octal
Decimal                 = "DECIMAL"
Octal                   = "OCTAL"

MacroPseudo             = Define / IfDef / IfNDef / IfZero / IfNZro
Define                  = "DEFINE" _ sym:Symbol (_ Symbol)* _* MacroBody {macros.add(sym);}
IfDef                   = "IFDEF" _ Symbol _* MacroBody
IfNDef                  = "IFNDEF" _ Symbol _* MacroBody
IfZero                  = "IFZERO" _ Param _* MacroBody
IfNZro                  = "IFNZRO" _ Param _* MacroBody

DataPseudo              = ZBlock / Text / Dubl / Fltg / Device / FileName
ZBlock                  = "ZBLOCK" _ Param
Text                    = "TEXT" _ l:. (c:. &{return c != l;})* r:.
Dubl                    = "DUBL" _ (("+" / "-")? Integer / NeutralListElement)*
Fltg                    = "FLTG" _ (Float / NeutralListElement)*
Device                  = "DEVICE" _ [^\n/]+
FileName                = "FILENAME" _ [^\n/]+

OutputCtrlPseudo        = EnPunch / NoPunch / Eject
EnPunch                 = "ENPUNCH"
NoPunch                 = "NOPUNCH"
Eject                   = "EJECT" (_ [^\n]*)?

Param "Parameter"       = BinaryOp / Element

Expression "Expression" = (BinaryOp / SymbolGroup / ParenExpr / Element)
ParenExpr               = ("(" / "[") _* Expression (_? ")" / "]")?
SymbolGroup             = SymbolNoMacro (_ Expression)*
BinaryOp                = ElementAndOp+ Element
ElementAndOp            = Element ("+" / "-" / "!" / "&" / "^" / "%")
EndOfExpr "End of expr" = Separator / Comment / EOL / !.

NeutralListElement      = Separator / Comment
MacroBody               = "<" ([^<>]+ MacroBody?)* [^>]* ">"
Float                   = [-+]? ([0-9]+ "." [0-9]* / [0-9]* "." [0-9]+ / [0-9]+) ([eE][-+]? [0-9]+)?

Element "Element"       = UnaryOp? (Integer / SymbolNoMacro / ASCII / CLC)
UnaryOp                 = [+-]
Integer                 = [0-9]+
Symbol "Symbol"         = sym:$([A-Z][A-Z0-9]*) &{return !keywords.has(sym)} {return `Symbol(${sym})`; }
SymbolNoMacro           = sym:Symbol &{return !macros.has(sym);}
CLC                     = "."
ASCII                   = "\"".

_ "Blank"               = " " / "\t" / "\f"
EOL "Newline"           = "\r" / "\n"
EOF "EOF"               = "$"
