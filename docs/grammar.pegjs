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

    // converts head and tail[t1, t2, t3, ...] to {lhs: {lhs: {lhs: head, ...t1}, ...t2}, ...t3}
    function leftAssoc(head, tail) {
        return tail.reduce((acc, cur) => ({lhs: acc, ...cur}), head);
    }
}}

{
    const macros = new Set();
}

Program                 = stmts:Statement* _* (EOF .*)?
                        { return {type: "Program", statements: stmts}; }

Statement "Statement"   = _* stmt:(
                            Origin /
                            Invocation /
                            Label /
                            Assign /
                            PseudoStatement /
                            ExpressionStmt /
                            Separator /
                            Comment /
                            EOL
                        )
                        { return stmt; }

Origin                  = "*" expr:Expression
                        { return {type: "Origin", expr: expr}; }

Label                   = sym:Symbol ","
                        { return {type: "Label", symbol: sym}; }

// Tested: PAL8 doesn't allow A=B=x or A=DECIMAL 10 OCTAL.
// It does however allow A=(x) and generates a link, assigning the address to A
Assign                  = sym:Symbol "=" _* expr:Expression
                        { return {type: "Assign", symbol: sym, expr: expr}; }

ExpressionStmt          = expr:Expression
                        { return {type: "ExprStmt", expr: expr}; }

Separator               = ";"
                        { return {type: "Separator"}; }

Invocation              = macro:Macro args:(_* @[^,\r\n/]+)|.., ","| _*
                        { return {type: "Invocation", macro: macro, args: args}; }

Comment                 = "/" text:$([^\r\n]*) EOL?
                        { return {type: "Comment", text: text}; }

PseudoStatement         = p:(OriginPseudo /
                          SymbolTablePseudo /
                          RadixPseudo /
                          MacroPseudo /
                          DataPseudo /
                          OutputCtrlPseudo)
                        { return {type: "Pseudo", pseudo: p}; }

Expression "Expression" = BinaryOp / SymbolGroup / ParenExpr / Element

// Tested with PAL8: A stray closing paren generates an IC error, but only if it's really stray. Also there can be spaces.
ParenExpr               = p:$("(" / "[") _* expr:Expression (_* ")" / "]")?
                        { return {type: "Paren", paren: p, expr: expr}; }

SymbolGroup             = sym:Symbol exprs:(_ @Expression)*
                        { return {type: "SymbolGroup", symbol: sym, exprs: exprs}; }

BinaryOp                = head:Element tail:BinOpFragment+
                        { return {type: "BinOp", ...leftAssoc(head, tail)}; }
BinOpFragment           = op:BinaryOperator rhs:Element
                        { return {type: "BinOp", op: op, rhs: rhs}; }
BinaryOperator          = op:$("+" / "-" / "!" / "&" / "^" / "%")

// Tested with PAL8: The line that ends the macro body may not contain anything after the ">" (generates IC errors)
// Unless the ">" is found inside a comment, in that case the body still finishes but there is no IC error for the rest of the line
MacroBody               = "<" body:$(([^<>]+ MacroBody?)* [^>]*) ">"
                        { return {type: "MacroBody", body: body}; }

Float                   = [-+]? ([0-9]+ "." [0-9]* / [0-9]* "." [0-9]+ / [0-9]+) ([eE][-+]? [0-9]+)?
                        { return {type: "Float", value: text()}; }

Element "Element"       = unary:[-+]? elem:(Integer / Symbol / ASCII / CLC)
                        { return {type: "Element", unary: unary, element: elem}; }

Integer                 = int:$[0-9]+
                        { return {type: "Integer", value: int}; }

Symbol "Symbol"         = name:SymbolName &{return !keywords.has(name) && !macros.has(name)}
                        { return {type: "Symbol", name: name}; }

Macro "Macro Name"      = name:SymbolName &{return macros.has(name);}
                        {return name;}

SymbolName              = $([A-Z][A-Z0-9]*)

CLC                     = "."
                        { return {type: "CLC"}; }

ASCII                   = "\"" chr:.
                        { return {type: "ASCII", char: chr}; }

_ "Blank"               = (" " / "\t" / "\f")
                        { return {type: "Blank"}; }

EOL "Newline"           = ("\r\n" / "\r" / "\n")
                        { return {type: "EOL"}; }

EOF "EOF"               = "$"
                        { return {type: "EOF"}; }

// Pseudos
OriginPseudo            = Page / Field / Reloc
Page                    = "PAGE" p:(_+ @Param)?
                        { return {type: "Page", page: p}; }
Field                   = "FIELD" _+ p:Param
                        { return {type: "Field", field: p}; }
Reloc                   = "RELOC" p:(_+ @Param)?
                        { return {type: "Reloc", reloc: p}; }

SymbolTablePseudo       = FixMri / FixTab / Expunge
FixMri                  = "FIXMRI" _ sym:Symbol "=" _* p:Param
                        { return {type: "FIXMRI", symbol: sym, value: p}; }
FixTab                  = "FIXTAB"
                        { return {type: "FixTab"}; }
Expunge                 = "EXPUNGE"
                        { return {type: "Expunge"}; }

RadixPseudo             = Decimal / Octal
Decimal                 = "DECIMAL"
                        { return {type: "Decimal"}; }
Octal                   = "OCTAL"
                        { return {type: "Octal"}; }

MacroPseudo             = Define / IfDef / IfNDef / IfZero / IfNZro
Define                  = "DEFINE" _ name:SymbolName args:(_ @SymbolName)* _* body:MacroBody
                        { macros.add(name); return {type: "Define", name: name, args: args, body: body}}
IfDef                   = "IFDEF" _ sym:Symbol _* body:MacroBody
                        { return {type: "IfDef", symbol: sym, body: body}; }
IfNDef                  = "IFNDEF" _ sym:Symbol _* body:MacroBody
                        { return {type: "IfNotDef", symbol: sym, body: body}; }
IfZero                  = "IFZERO" _ p:Param _* body:MacroBody
                        { return {type: "IfZero", expr: p, body: body}; }
IfNZro                  = "IFNZRO" _ p:Param _* body:MacroBody
                        { return {type: "IfNotZero", expr: p, body: body}; }

DataPseudo              = ZBlock / Text / Dubl / Fltg / Device / FileName
ZBlock                  = "ZBLOCK" _ p:Param
                        { return {type: "ZBlock", amount: p}; }
Text                    = "TEXT" _ l:. text:$(c:. &{return c != l;})* r:.
                        { return {type: "Text", text: text}; }
Dubl                    = "DUBL" _ list:(_* @(([-+]? Integer) / NeutralListElement) _* )*
                        { return {type: "DoubleIntList", list: list}; }
Fltg                    = "FLTG" _ list:(_* @(Float / NeutralListElement) _*)*
                        { return {type: "FloatList", list: list}; }
Device                  = "DEVICE" _ [^\r\n/;]+ // Tested: these separators end the command
FileName                = "FILENAME" _ [^\r\n/;]+ // Tested: these separators end the command

OutputCtrlPseudo        = EnPunch / NoPunch / Eject
EnPunch                 = "ENPUNCH"
NoPunch                 = "NOPUNCH"
Eject                   = "EJECT" (_ [^\r\n/;]*)? // Tested: these separators end the command

Param "Parameter"       = BinaryOp / Element
NeutralListElement      = Separator / Comment / EOL
