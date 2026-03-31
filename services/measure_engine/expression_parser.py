from __future__ import annotations

from dataclasses import dataclass
from typing import Any


_AGG_FUNCS = {"SUM", "AVG", "COUNT", "MIN", "MAX"}


@dataclass
class Token:
    kind: str
    value: str


def _tokenize(expression: str) -> list[Token]:
    text = str(expression or "")
    tokens: list[Token] = []
    i = 0

    while i < len(text):
        ch = text[i]

        if ch.isspace():
            i += 1
            continue

        if ch in "+-*/(),":
            tokens.append(Token(kind=ch, value=ch))
            i += 1
            continue

        if ch.isdigit() or (ch == "." and i + 1 < len(text) and text[i + 1].isdigit()):
            start = i
            i += 1
            while i < len(text) and (text[i].isdigit() or text[i] == "."):
                i += 1
            tokens.append(Token(kind="NUMBER", value=text[start:i]))
            continue

        if ch.isalpha() or ch == "_":
            start = i
            i += 1
            while i < len(text) and (text[i].isalnum() or text[i] in "._"):
                i += 1
            tokens.append(Token(kind="IDENT", value=text[start:i]))
            continue

        if ch == "*":
            tokens.append(Token(kind="STAR", value=ch))
            i += 1
            continue

        raise ValueError(f"Unsupported token '{ch}' in expression")

    tokens.append(Token(kind="EOF", value=""))
    return tokens


class _Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.pos = 0

    def _peek(self) -> Token:
        return self.tokens[self.pos]

    def _next(self) -> Token:
        tok = self.tokens[self.pos]
        self.pos += 1
        return tok

    def _expect(self, kind: str) -> Token:
        tok = self._peek()
        if tok.kind != kind:
            raise ValueError(f"Expected token '{kind}', got '{tok.kind}'")
        return self._next()

    def parse(self) -> dict[str, Any]:
        node = self._parse_expression()
        if self._peek().kind != "EOF":
            raise ValueError("Unexpected token after expression")
        return node

    def _parse_expression(self) -> dict[str, Any]:
        node = self._parse_term()
        while self._peek().kind in {"+", "-"}:
            op = self._next().kind
            right = self._parse_term()
            node = {
                "type": "binary",
                "operator": op,
                "left": node,
                "right": right,
            }
        return node

    def _parse_term(self) -> dict[str, Any]:
        node = self._parse_factor()
        while self._peek().kind in {"*", "/"}:
            op = self._next().kind
            right = self._parse_factor()
            node = {
                "type": "binary",
                "operator": op,
                "left": node,
                "right": right,
            }
        return node

    def _parse_factor(self) -> dict[str, Any]:
        tok = self._peek()

        if tok.kind in {"+", "-"}:
            op = self._next().kind
            operand = self._parse_factor()
            return {
                "type": "unary",
                "operator": op,
                "operand": operand,
            }

        if tok.kind == "NUMBER":
            value = float(self._next().value)
            return {
                "type": "number",
                "value": value,
            }

        if tok.kind == "IDENT":
            return self._parse_function_or_identifier()

        if tok.kind == "(":
            self._next()
            node = self._parse_expression()
            self._expect(")")
            return node

        raise ValueError(f"Unexpected token '{tok.kind}'")

    def _parse_function_or_identifier(self) -> dict[str, Any]:
        ident = self._expect("IDENT").value
        upper_ident = ident.upper()

        if self._peek().kind != "(":
            return {
                "type": "field",
                "field": ident,
            }

        self._expect("(")

        if self._peek().kind == "STAR":
            self._next()
            arg = "*"
        else:
            token = self._peek()
            if token.kind not in {"IDENT"}:
                raise ValueError(f"Expected field reference in function '{upper_ident}'")
            arg = self._next().value

        self._expect(")")

        if upper_ident not in _AGG_FUNCS:
            raise ValueError(f"Unsupported function '{ident}'")

        table = None
        field = arg
        if arg != "*" and "." in arg:
            table, field = arg.split(".", 1)

        return {
            "type": "agg",
            "func": upper_ident,
            "field": field,
            "table": table,
        }


def parse_expression(expression: str) -> dict[str, Any]:
    if not expression or not str(expression).strip():
        raise ValueError("Expression is required")
    tokens = _tokenize(expression)
    parser = _Parser(tokens)
    return parser.parse()


def collect_aggregations(ast: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not ast:
        return []

    out: list[dict[str, Any]] = []

    def walk(node: dict[str, Any] | None):
        if not node:
            return

        t = node.get("type")
        if t == "agg":
            out.append(node)
            return

        if t == "binary":
            walk(node.get("left"))
            walk(node.get("right"))
            return

        if t == "unary":
            walk(node.get("operand"))
            return

    walk(ast)
    return out


def canonical_agg_signature(func: str, field: str, table: str | None = None) -> str:
    f = str(func or "COUNT").upper()
    raw_field = "*" if str(field or "") in {"*", "__count__"} else str(field or "")
    if raw_field != "*" and table:
        return f"{f}({table}.{raw_field})"
    return f"{f}({raw_field})"
