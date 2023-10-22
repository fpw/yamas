import { Lexer } from "./Lexer";
import { TokenType, tokenToString } from "./Token";

describe("Lexer", () => {
    const lexer = new Lexer();

    it("should switch between files correctly", () => {
        lexer.addInput("a.pa", "DC08A=	0	/A");
        lexer.addInput("b.pa", "IFZERO DC08A	<DCSIZE=0>");
        lexer.addInput("c.pa", "DATA1=2200+DCSIZE");
        while (true) {
            const tok = lexer.next();
            if (tok.type == TokenType.EOF) {
                break;
            }
        }
    });
});
