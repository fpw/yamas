Program         -> Statement:* _:* (EOF .:*):?

Statement 		-> _:* (
                            Origin |
                            Invocation |
                            Label |
                            Assign |
                            PseudoStatement |
                            ExpressionStmt |
                            Separator |
                            Comment |
                            EOL
                        ) EndOfExpr

Origin         	-> "*" Param
Label           -> Symbol ","
Assign          -> Symbol "=" _:* Expression
ExpressionStmt  -> Param
Separator       -> ";" | EOL
Invocation      -> Symbol (_:* [^,\n/]:+ ("," _:* [^,\n/]:+):*):? _:* EndOfExpr
Comment         -> ("/" [^\n]:* (EOL | EOF))

Param 			-> BinaryOp | Element

Expression 		-> (BinaryOp | SymbolGroup | ParenExpr | Element)
ParenExpr       -> ("(" | "[") _:* Expression (_:? ")" | "]"):?
SymbolGroup     -> Symbol (_ Param):* {% (sym, es) => ({type: "group", sym: sym, exprs: es}) %}
BinaryOp        -> ElementAndOp:+ Element
ElementAndOp    -> Element ("+" | "-" | "!" | "&" | "^" | "%")
EndOfExpr 		-> Separator | Comment | EOL

NeutralListElement -> Separator | Comment
MacroBody       -> "<" ([^<>]:+ MacroBody:?):* [^>]:* ">"

Float          	-> [-+]:? (([0-9]:+ "." [0-9]:+) | ([0-9]:* "." [0-9]:+) | [0-9]:+) ([eE] [-+]:? [0-9]:+):?

Element			-> UnaryOp:? (Integer | Symbol | ASCII | CLC)
UnaryOp			-> [-+]
Integer			-> [0-9]:+
Symbol			-> ([A-Z] [A-Z0-9]:+)	{% (h, t) => ({type: "symbol", name: h.join("")}) %}
CLC				-> "."
ASCII 			-> "\"" .

_ 				-> " " | "\t"
EOL 			-> "\n" | "\r"
EOF				-> "$"
