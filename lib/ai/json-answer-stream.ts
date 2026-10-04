// Incremental JSON string lexer: never forwards the JSON envelope or citation IDs.
export class JsonAnswerStream {
  raw = "";
  answer = "";
  private depth = 0;
  private inString = false;
  private kind: "key" | "answer" | "other" = "other";
  private value = "";
  private escape = "";
  private key = "";
  private expectingKey = false;
  private valuePending = false;
  private foundAnswer = false;
  push(delta: string): string {
    this.raw += delta;
    if (this.raw.length > 100000) throw new Error("Oversized model response");
    let output = "";
    for (const c of delta) {
      if (!this.inString) {
        if (c === '"') {
          this.kind = this.depth === 1 && this.expectingKey ? "key" : this.depth === 1 && this.valuePending && this.key === "answer" ? "answer" : "other";
          if (this.kind === "answer") {if (this.foundAnswer) throw new Error("Duplicate answer"); this.foundAnswer = true;}
          this.inString = true; this.value = ""; this.escape = ""; this.valuePending = false;
        } else if (c === "{" || c === "[") {this.depth++; if (this.depth === 1) this.expectingKey = true;}
        else if (c === "}" || c === "]") this.depth--;
        else if (this.depth === 1 && c === ",") {this.expectingKey = true; this.valuePending = false;}
        else if (this.depth === 1 && c === ":") {this.expectingKey = false; this.valuePending = true;}
        continue;
      }
      let decoded = "";
      if (this.escape) {
        this.escape += c;
        if (this.escape === "\\u" || (this.escape.startsWith("\\u") && this.escape.length < 6)) continue;
        decoded = JSON.parse('"' + this.escape + '"') as string; this.escape = "";
      } else if (c === "\\") {this.escape = c; continue;}
      else if (c === '"') {this.inString = false; if (this.kind === "key") this.key = this.value; continue;}
      else {if (c.charCodeAt(0) < 32) throw new Error("Invalid JSON string"); decoded = c;}
      this.value += decoded;
      if (this.kind === "answer") {output += decoded; this.answer += decoded;}
    }
    return output;
  }
}
