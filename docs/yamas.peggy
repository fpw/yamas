/*
 *   Yamas - Yet Another Macro Assembler (for the PDP-8)
 *   Copyright (C) 2023 Folke Will <folko@solhost.org>
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Affero General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Affero General Public License for more details.
 *
 *   You should have received a copy of the GNU Affero General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

 {{
      const basePseudos = [
        "PAGE",     "FIELD",        "RELOC",
        "IFDEF",    "IFNDEF",       "IFNZRO",   "IFZERO",   "DEFINE",
        "TEXT",     "ZBLOCK",       "DUBL",     "FLTG",     "DEVICE",   "FILENAME",
        "EXPUNGE",  "FIXTAB",       "FIXMRI",
        "DECIMAL",  "OCTAL",
        "NOPUNCH",  "ENPUNCH",
        "EJECT",    "XLIST",        "PAUSE",
    ];

    // converts head and tail[t1, t2, t3, ...] to {lhs: {lhs: {lhs: head, ...t1}, ...t2}, ...t3}
    function leftAssoc(head, tail) {
        return tail.reduce((acc, cur) => ({lhs: acc, ...cur}), head);
    }

    // checks if the last line of a macro body starts a comment -
    // which means that the closing ">" is inside a comment
    function checkIfComment(text) {
        const lines = text.split("\n");
        return lines[lines.length - 1].includes("/");
    }
}}

{
    let disabledPseudos = options.disabledPseudos || [];
    const pseudos = new Set(basePseudos.filter(p => !disabledPseudos.includes(p)));
    const macros = new Set();
}

Program                 = stmts:Statement* _* (EOF .*)?
                            { return {type: "Program", statements: stmts}; }

Statement "Statement"   = _* @(
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

Invocation              = macro:Macro args:(_* @$[^,\r\n/]+)|.., ","|
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
ParenExpr               = "(" _* expr:Expression _* ")"?
                            { return {type: "Paren", where: "page", expr: expr}; }
                        / "[" _* expr:Expression _* "]"?
                            { return {type: "Paren", where: "zero", expr: expr}; }

SymbolGroup             = sym:Element exprs:(_ @Expression)*
                            { return {type: "SymbolGroup", symbol: sym, exprs: exprs}; }

BinaryOp                = head:Element tail:BinOpFragment+
                            { return {type: "BinOp", ...leftAssoc(head, tail)}; }
BinOpFragment           = op:BinaryOperator rhs:(Element / ParenExpr)
                            { return {type: "BinOp", op: op, rhs: rhs}; }
BinaryOperator          = op:$("+" / "-" / "!" / "&" / "^" / "%")

// Tested with PAL8: The line that ends the macro body is still in the statement after the ">" (generates IC errors except for ; and /)
// Unless the ">" is found inside a comment, in that case the body still finishes but there is no IC error for the rest of the line
// We're solving this using a little hack: consume everything after ">" till the end of the line if the last line of the body starts a comment
MacroBody               = InnerMacroBody
InnerMacroBody          = "<" body:$(([^<>]+ InnerMacroBody ?)* [^>]*) ">" ([^\n]* &{return checkIfComment(body)})?
                            { return {type: "MacroBody", body: body}; }

Element "Element"       = unary:[-+]? elem:(Integer / Symbol / ASCII / CLC)
                            { return {type: "Element", unary: unary, element: elem}; }

Integer                 = int:$[0-9]+
                            { return {type: "Integer", value: int}; }

Symbol "Symbol"         = name:SymbolName &{return !pseudos.has(name) && !macros.has(name);}
                            { return {type: "Symbol", name: name}; }

Macro "Macro Name"      = @name:SymbolName &{return macros.has(name);}

SymbolName              = $([a-zA-Z][a-zA-Z0-9]*)

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
Field                   = "FIELD" p:(_+ @Param)?
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
// Even though the PAL8 manual claims that the expression may not contain spaces,
// it works fine in PAL8 to do something like IFZERO 0 1 < ... >, so it's a full expression and not only binop
IfZero                  = "IFZERO" _ p:Expression _* body:MacroBody
                            { return {type: "IfZero", expr: p, body: body}; }
IfNZro                  = "IFNZRO" _ p:Expression _* body:MacroBody
                            { return {type: "IfNotZero", expr: p, body: body}; }

DataPseudo              = ZBlock / Text / Dubl / Fltg / Device / FileName
ZBlock                  = "ZBLOCK" _ p:Param
                            { return {type: "ZBlock", amount: p}; }
Text                    = "TEXT" _ l:. text:$(c:[^\r\n] &{return c != l;})* (r:. &{return r == l;})?
                            { return {type: "Text", text: text}; }
Dubl                    = "DUBL" _* list:(@(IntWithUnary  / NeutralListElement) _* )*
                            { return {type: "DoubleIntList", list: list}; }
Fltg                    = "FLTG" _* list:(@(Float / NeutralListElement) _*)*
                            { return {type: "FloatList", list: list}; }
Device                  = "DEVICE" _ dev:StringContent
                            { return {type: "Device", name: dev}; }
FileName                = "FILENAME" _ name:StringContent
                            { return {type: "FileName", text: name}; }

OutputCtrlPseudo        = EnPunch / NoPunch / Eject / Pause / XList
EnPunch                 = "ENPUNCH"
                            { return {type: "EnPunch"}; }
NoPunch                 = "NOPUNCH"
                            { return {type: "NoPunch"}; }
Pause                   = "PAUSE"
                            { return {type: "Pause"}; }
XList                   = "XLIST"
                            { return {type: "XList"}; }
Eject                   = "EJECT" title:(_ @$[^\r\n/;]*)?
                            { return {type: "Eject", title: title}; }
IntWithUnary            = u:[-+]? i:Integer
                             {return {type: "DoubleInt", unary: u, value: i}; }
Float                   = [-+]? ([0-9]+ "." [0-9]* / [0-9]* "." [0-9]+ / [0-9]+) ([eE][-+]? [0-9]+)?
                            { return {type: "Float", value: text()}; }
Param                   = BinaryOp / Element
NeutralListElement      = Separator / Comment / EOL

// Tested in PAL8: these separators end string literals (except in TEXT)
StringContent           = $[^\r\n/;]+
